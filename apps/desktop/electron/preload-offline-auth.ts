import type {
  OfflineAuthBridge,
  OfflineAuthRequest,
} from '@corelive/desktop-contract/offline-auth'
import { contextBridge, ipcRenderer } from 'electron'

import { typedInvoke } from './ipc/typedInvoke'
import { isTrustedTokenBrokerDocument } from './utils/isTrustedTokenBrokerDocument'

const prefix = '--corelive-app-origin='
const origin =
  process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length) ?? 'https://corelive.app'

// A Clerk handshake or another same-origin page receives no native capability.
if (isTrustedTokenBrokerDocument(window.location.href, origin)) {
  const bridge: OfflineAuthBridge = {
    ready: async () => typedInvoke('offline-auth-ready'),
    respond: async (result) =>
      (await typedInvoke('offline-auth-result', result)) === true,
    onRequest: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: OfflineAuthRequest,
      ): void => callback(request)
      ipcRenderer.on('offline-auth-request', listener)
      return () => ipcRenderer.removeListener('offline-auth-request', listener)
    },
  }
  contextBridge.exposeInMainWorld('coreliveOfflineAuth', bridge)
}
