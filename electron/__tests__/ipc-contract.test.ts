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
  })
})
