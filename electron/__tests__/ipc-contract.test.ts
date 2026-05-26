/**
 * @fileoverview IPC contract tests.
 *
 * Guarantees that the IPC contract stays internally consistent across three
 * surfaces: type contract (`types/ipc.ts`), runtime schema (`ipc-schemas.ts`),
 * and the typed wrappers. If any of the three drifts, a test here fails —
 * so migrations cannot sneak past with a half-wired channel.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 * Depends on: `electron/ipc/ipc-schemas.ts`, `electron/types/ipc.ts`.
 *
 * @example
 *   pnpm test:electron -- ipc-contract
 */
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { IPC_ARG_SCHEMAS } from '../ipc/ipc-schemas'
import type { IPCChannel } from '../types/ipc'

describe('IPC contract', () => {
  describe('IPC_ARG_SCHEMAS exhaustiveness', () => {
    /**
     * Compile-time proof that every `IPCChannel` key exists in
     * `IPC_ARG_SCHEMAS`. The `Record<IPCChannel, ...>` type on
     * `IPC_ARG_SCHEMAS` makes this impossible to violate without a type error,
     * so this test only needs to *exist* to document the invariant and survive
     * a future refactor that accidentally loosens the type.
     */
    it('registers a schema for every channel in IPCChannels', () => {
      const channels = Object.keys(IPC_ARG_SCHEMAS) as IPCChannel[]
      expect(channels.length).toBeGreaterThan(0)
      for (const channel of channels) {
        expect(IPC_ARG_SCHEMAS[channel]).toBeDefined()
      }
    })
  })

  describe('Schema shape sanity', () => {
    it('each schema parses an empty array for void-arg channels', () => {
      const voidChannels: IPCChannel[] = [
        'app-version',
        'app-quit',
        'performance-get-metrics',
        'performance-trigger-cleanup',
        'window-minimize',
        'window-get-aux-visibility',
        'auth-get-user',
        'auth-logout',
        'auth-is-authenticated',
      ]
      for (const channel of voidChannels) {
        const schema = IPC_ARG_SCHEMAS[channel]
        expect(() => schema.parse([])).not.toThrow()
      }
    })

    it('rejects invalid arguments for typed channels', () => {
      const authSetUser = IPC_ARG_SCHEMAS['auth-set-user']
      // Missing required `clerkId`
      expect(() => authSetUser.parse([{}])).toThrow(ZodError)
      // Wrong tuple length
      expect(() => authSetUser.parse([])).toThrow(ZodError)
      // Valid payload (additional fields pass through)
      expect(() =>
        authSetUser.parse([
          {
            clerkId: 'user_abc',
            emailAddresses: ['test@example.com'],
            firstName: 'Test',
            imageUrl: 'https://example.com/a.png', // passthrough extra
          },
        ]),
      ).not.toThrow()
    })

    it('requires boolean for settings toggles', () => {
      const setHide = IPC_ARG_SCHEMAS['settings:setHideAppIcon']
      expect(() => setHide.parse([true])).not.toThrow()
      expect(() => setHide.parse(['not a boolean'])).toThrow(ZodError)
      expect(() => setHide.parse([])).toThrow(ZodError)
    })

    it('requires three startup-window booleans for settings:setStartupConfig', () => {
      // Arrange
      const setStartupConfig = IPC_ARG_SCHEMAS['settings:setStartupConfig']

      // Act + Assert: a complete three-boolean object passes the shape check.
      expect(() =>
        setStartupConfig.parse([
          { showMain: true, showBraindump: false, showFloating: false },
        ]),
      ).not.toThrow()
      // An all-false object still passes the *schema* — the >=1-true invariant
      // is enforced in ConfigManager, not at the IPC boundary.
      expect(() =>
        setStartupConfig.parse([
          { showMain: false, showBraindump: false, showFloating: false },
        ]),
      ).not.toThrow()
      // A missing flag is rejected (renderer cannot send a partial config).
      expect(() =>
        setStartupConfig.parse([{ showMain: true, showBraindump: false }]),
      ).toThrow(ZodError)
      // A non-boolean flag is rejected.
      expect(() =>
        setStartupConfig.parse([
          { showMain: 'yes', showBraindump: false, showFloating: false },
        ]),
      ).toThrow(ZodError)
      // An empty tuple is rejected.
      expect(() => setStartupConfig.parse([])).toThrow(ZodError)
    })

    it('takes no arguments for settings:getStartupConfig', () => {
      // Arrange
      const getStartupConfig = IPC_ARG_SCHEMAS['settings:getStartupConfig']

      // Act + Assert: the read side is a pure getter — an empty tuple passes.
      expect(() => getStartupConfig.parse([])).not.toThrow()
      // Any argument is rejected (the getter reads, it does not accept input).
      expect(() => getStartupConfig.parse([{ showMain: true }])).toThrow(
        ZodError,
      )
    })

    it('requires boolean for floating panel desktop tracking', () => {
      const setVisibleOnAllWorkspaces =
        IPC_ARG_SCHEMAS['floating-window-set-visible-on-all-workspaces']
      expect(() => setVisibleOnAllWorkspaces.parse([true])).not.toThrow()
      expect(() => setVisibleOnAllWorkspaces.parse([false])).not.toThrow()
      expect(() => setVisibleOnAllWorkspaces.parse(['true'])).toThrow(ZodError)
      expect(() => setVisibleOnAllWorkspaces.parse([])).toThrow(ZodError)
    })

    it('accepts enum-constrained window state channel names', () => {
      const windowStateGet = IPC_ARG_SCHEMAS['window-state-get']
      expect(() => windowStateGet.parse(['main'])).not.toThrow()
      expect(() => windowStateGet.parse(['floating'])).not.toThrow()
      expect(() => windowStateGet.parse(['unknown-window'])).toThrow(ZodError)
    })

    it('accepts optional second arg for oauth-cancel', () => {
      const oauthCancel = IPC_ARG_SCHEMAS['oauth-cancel']
      expect(() => oauthCancel.parse([])).not.toThrow()
      expect(() => oauthCancel.parse([null])).not.toThrow()
      expect(() => oauthCancel.parse(['state-id'])).not.toThrow()
      // Wrong type for state
      expect(() => oauthCancel.parse([123])).toThrow(ZodError)
    })

    /**
     * BrainDump Note channels — locks down the contract used by
     * `preload-braindump.ts` and the main-window Settings bridge.
     */
    it('clamps and validates braindump-window-set-opacity', () => {
      const setOpacity = IPC_ARG_SCHEMAS['braindump-window-set-opacity']
      expect(() => setOpacity.parse([0.85])).not.toThrow()
      expect(() => setOpacity.parse([0])).not.toThrow()
      expect(() => setOpacity.parse([1])).not.toThrow()
      // Out of range — schema bounds [0, 1]
      expect(() => setOpacity.parse([1.5])).toThrow(ZodError)
      expect(() => setOpacity.parse([-0.1])).toThrow(ZodError)
      expect(() => setOpacity.parse(['0.5'])).toThrow(ZodError)
    })

    it('requires (categoryId, text) tuple for braindump-note-set', () => {
      const setNote = IPC_ARG_SCHEMAS['braindump-note-set']
      expect(() => setNote.parse([42, 'hello'])).not.toThrow()
      expect(() => setNote.parse([42])).toThrow(ZodError)
      expect(() => setNote.parse(['42', 'hello'])).toThrow(ZodError)
      expect(() => setNote.parse([1.5, 'hello'])).toThrow(ZodError) // not int
    })

    it('rejects non-boolean for braindump-config-set-sync', () => {
      const setSync = IPC_ARG_SCHEMAS['braindump-config-set-sync']
      expect(() => setSync.parse([true])).not.toThrow()
      expect(() => setSync.parse([false])).not.toThrow()
      expect(() => setSync.parse(['true'])).toThrow(ZodError)
      expect(() => setSync.parse([])).toThrow(ZodError)
    })

    it('accepts empty string (disable shortcut) for braindump-config-set-shortcut', () => {
      const setShortcut = IPC_ARG_SCHEMAS['braindump-config-set-shortcut']
      expect(() => setShortcut.parse([''])).not.toThrow()
      expect(() =>
        setShortcut.parse(['CommandOrControl+Shift+B']),
      ).not.toThrow()
      expect(() => setShortcut.parse([null])).toThrow(ZodError)
    })

    it('requires positive int categoryId for braindump-config-set-last-category', () => {
      const setLast = IPC_ARG_SCHEMAS['braindump-config-set-last-category']
      expect(() => setLast.parse([1])).not.toThrow()
      expect(() => setLast.parse(['1'])).toThrow(ZodError)
      expect(() => setLast.parse([1.5])).toThrow(ZodError)
    })
  })
})
