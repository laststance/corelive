import { ipcRenderer, type IpcRendererEvent } from 'electron'

import type { IPCEventChannel, IPCEventChannels } from '../types/ipc'

/**
 * Type-safe replacement for `ipcRenderer.on(channel, handler)` in preload scripts.
 *
 * Returns a factory that, when called with a callback, subscribes to the event channel
 * and returns an unsubscribe function. Payload type is inferred from `IPCEventChannels[C]`.
 *
 * Triggered when: preload needs to forward a main→renderer event to renderer code
 * via `contextBridge.exposeInMainWorld`.
 * Called by: `electron/preload.ts` for event-emitting channels (auth-state-changed,
 * oauth-success, app-update-*, deep-link-*, shortcut-*, etc.).
 *
 * Why a factory (not direct subscribe):
 *   contextBridge serializes function arguments, so we wrap the listener once
 *   inside preload and expose a plain `(cb) => unsubscribe` closure to renderer.
 *   This also gives renderer a stable unsubscribe handle without exposing `ipcRenderer`.
 *
 * @example
 *   // Inside electron/preload.ts contextBridge namespace:
 *   auth: {
 *     onStateChanged: createTypedListener('auth-state-changed'),
 *   },
 *
 *   // Inside renderer React component:
 *   useEffect(() => {
 *     const unsub = window.electronAPI.auth.onStateChanged((state) => {
 *       // state: { isAuthenticated: boolean; user: ElectronUser | null }
 *       setAuth(state)
 *     })
 *     return unsub
 *   }, [])
 */
export function createTypedListener<C extends IPCEventChannel>(
  channel: C,
): (cb: (data: IPCEventChannels[C]) => void) => () => void {
  return (cb) => {
    const handler = (_event: IpcRendererEvent, data: IPCEventChannels[C]) =>
      cb(data)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}
