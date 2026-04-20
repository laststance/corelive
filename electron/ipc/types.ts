import type { IPCChannel, IPCChannels } from '../types/ipc'

/**
 * Maps `IPCChannels[C]['request']` to the argument tuple that main-side
 * handlers and preload-side callers use.
 *
 * - `request: void` → `[]`
 * - `request: T[]` → `T[]` (tuple style request, e.g. `[string, Options]`)
 * - `request: T`    → `[T]`  (single-arg request)
 *
 * @example
 *   ArgsOf<'auth-get-user'>           // []
 *   ArgsOf<'auth-sync-from-web'>      // [AuthUserPayload]
 *   ArgsOf<'window-state-set'>        // ['main' | 'floating', Partial<WindowState>]
 */
export type ArgsOf<C extends IPCChannel> =
  IPCChannels[C]['request'] extends void
    ? []
    : IPCChannels[C]['request'] extends readonly unknown[]
      ? IPCChannels[C]['request']
      : [IPCChannels[C]['request']]
