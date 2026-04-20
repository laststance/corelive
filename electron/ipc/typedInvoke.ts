import { ipcRenderer } from 'electron'

import type { IPCChannel, IPCChannels } from '../types/ipc'

import type { ArgsOf } from './types'

/**
 * Type-safe replacement for `ipcRenderer.invoke(channel, ...args)` in preload scripts.
 *
 * Enforces the channel contract (`IPCChannels`) at compile-time and returns
 * a `Promise<IPCChannels[C]['response']>` with correct inference.
 *
 * Triggered when: preload script wraps a main-process handler for exposure via `contextBridge`.
 * Called by: `electron/preload.ts` and `electron/preload-floating.ts` inside the
 * `contextBridge.exposeInMainWorld(...)` namespaces.
 *
 * Why this exists:
 *   Raw `ipcRenderer.invoke` returns `Promise<any>`. This wrapper removes the
 *   `as` casts currently scattered across preload and enforces channel names.
 *
 * @example
 *   // Inside electron/preload.ts contextBridge namespace:
 *   window: {
 *     minimize: () => typedInvoke('window-minimize'),
 *     close: () => typedInvoke('window-close'),
 *   },
 *   auth: {
 *     syncFromWeb: (user: AuthUserPayload) =>
 *       typedInvoke('auth-sync-from-web', user),
 *   },
 */
export async function typedInvoke<C extends IPCChannel>(
  channel: C,
  ...args: ArgsOf<C>
): Promise<IPCChannels[C]['response']> {
  return (await ipcRenderer.invoke(
    channel,
    ...args,
  )) as IPCChannels[C]['response']
}
