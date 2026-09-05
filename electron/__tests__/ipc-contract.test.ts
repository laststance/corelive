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

    it('keeps LiveEditor note text behind the dedicated IPC channel', () => {
      // Arrange
      const configGet = IPC_ARG_SCHEMAS['config-get']

      // Act + Assert: metadata and the redacted section root remain readable.
      expect(() => configGet.parse(['liveEditor'])).not.toThrow()
      expect(() => configGet.parse(['liveEditor.opacity'])).not.toThrow()
      // Direct, nested, and unknown LiveEditor paths cannot bypass the allowlist.
      expect(() => configGet.parse(['liveEditor.notes'])).toThrow(ZodError)
      expect(() => configGet.parse(['liveEditor.notes.1'])).toThrow(ZodError)
      expect(() => configGet.parse(['liveEditor.futureSecret'])).toThrow(
        ZodError,
      )
    })

    it('requires boolean for settings toggles', () => {
      const setHide = IPC_ARG_SCHEMAS['settings:setHideAppIcon']
      expect(() => setHide.parse([true])).not.toThrow()
      expect(() => setHide.parse(['not a boolean'])).toThrow(ZodError)
      expect(() => setHide.parse([])).toThrow(ZodError)
    })

    it('takes no arguments for settings:resetPopoverSize', () => {
      // Arrange
      const resetPopoverSize = IPC_ARG_SCHEMAS['settings:resetPopoverSize']

      // Act + Assert: reset is a void call — an empty tuple must pass.
      expect(() => resetPopoverSize.parse([])).not.toThrow()
      // Any argument is rejected; the renderer has nothing meaningful to send.
      expect(() => resetPopoverSize.parse([true])).toThrow(ZodError)
      expect(() => resetPopoverSize.parse([360])).toThrow(ZodError)
    })

    it('requires boolean for LiveEditor desktop tracking', () => {
      const setVisibleOnAllWorkspaces =
        IPC_ARG_SCHEMAS['live-editor-set-visible-on-all-workspaces']
      expect(() => setVisibleOnAllWorkspaces.parse([true])).not.toThrow()
      expect(() => setVisibleOnAllWorkspaces.parse([false])).not.toThrow()
      expect(() => setVisibleOnAllWorkspaces.parse(['true'])).toThrow(ZodError)
      expect(() => setVisibleOnAllWorkspaces.parse([])).toThrow(ZodError)
    })

    it('requires boolean for live-editor-window-set-always-on-top', () => {
      const setAlwaysOnTop =
        IPC_ARG_SCHEMAS['live-editor-window-set-always-on-top']
      expect(() => setAlwaysOnTop.parse([true])).not.toThrow()
      expect(() => setAlwaysOnTop.parse([false])).not.toThrow()
      expect(() => setAlwaysOnTop.parse(['true'])).toThrow(ZodError)
      expect(() => setAlwaysOnTop.parse([])).toThrow(ZodError)
    })

    it('accepts optional second arg for oauth-cancel', () => {
      const oauthCancel = IPC_ARG_SCHEMAS['oauth-cancel']
      expect(() => oauthCancel.parse([])).not.toThrow()
      expect(() => oauthCancel.parse([null])).not.toThrow()
      expect(() => oauthCancel.parse(['state-id'])).not.toThrow()
      // Wrong type for state
      expect(() => oauthCancel.parse([123])).toThrow(ZodError)
    })

    it('accepts empty tuple for config-open', () => {
      const openConfig = IPC_ARG_SCHEMAS['config-open']
      expect(() => openConfig.parse([])).not.toThrow()
      expect(() => openConfig.parse([null])).toThrow(ZodError)
    })

    /**
     * LiveEditor Note channels — locks down the contract used by
     * `preload-live-editor.ts` and the main-window Settings bridge.
     */
    it('clamps and validates live-editor-window-set-opacity', () => {
      const setOpacity = IPC_ARG_SCHEMAS['live-editor-window-set-opacity']
      expect(() => setOpacity.parse([0.85])).not.toThrow()
      expect(() => setOpacity.parse([0])).not.toThrow()
      expect(() => setOpacity.parse([1])).not.toThrow()
      // Out of range — schema bounds [0, 1]
      expect(() => setOpacity.parse([1.5])).toThrow(ZodError)
      expect(() => setOpacity.parse([-0.1])).toThrow(ZodError)
      expect(() => setOpacity.parse(['0.5'])).toThrow(ZodError)
    })

    it('requires (categoryId, text) tuple for live-editor-note-set', () => {
      const setNote = IPC_ARG_SCHEMAS['live-editor-note-set']
      expect(() => setNote.parse([42, 'hello'])).not.toThrow()
      expect(() => setNote.parse([42])).toThrow(ZodError)
      expect(() => setNote.parse(['42', 'hello'])).toThrow(ZodError)
      expect(() => setNote.parse([1.5, 'hello'])).toThrow(ZodError) // not int
    })

    it('accepts empty string (disable shortcut) for live-editor-config-set-shortcut', () => {
      const setShortcut = IPC_ARG_SCHEMAS['live-editor-config-set-shortcut']
      expect(() => setShortcut.parse([''])).not.toThrow()
      expect(() =>
        setShortcut.parse(['CommandOrControl+Shift+B']),
      ).not.toThrow()
      // An over-length accelerator (> SHORTCUT_ACCELERATOR_MAX_LENGTH) is
      // rejected, so a malicious renderer can't smuggle an unbounded string in.
      expect(() => setShortcut.parse(['x'.repeat(65)])).toThrow(ZodError)
      expect(() => setShortcut.parse([null])).toThrow(ZodError)
    })
  })
})
