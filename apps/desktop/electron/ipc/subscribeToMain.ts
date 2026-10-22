import type {
  IPCEventChannel,
  IPCEventChannels,
} from '@corelive/desktop-contract/ipc'
import { ipcRenderer, type IpcRendererEvent } from 'electron'

/** Removes Electron's event object from the bridge and returns scoped listener cleanup.
 * Called by capability preloads for main-owned events; renderer code never receives IPC itself.
 * @example subscribeToMain('offline-editor-changed', renderSnapshot)
 */
export function subscribeToMain<C extends IPCEventChannel>(
  channel: C,
  callback: (payload: IPCEventChannels[C]) => void,
): () => void {
  const listener = (
    _event: IpcRendererEvent,
    payload: IPCEventChannels[C],
  ): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
