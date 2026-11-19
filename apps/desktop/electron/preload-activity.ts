import { contextBridge, ipcRenderer } from 'electron'

import { typedInvoke } from './ipc/typedInvoke'
import {
  ACTIVITY_INPUT_CHANNEL,
  ACTIVITY_OUTPUT_CHANNEL,
  type ActivityCardAPI,
} from './mcp/activityChannel'

// The main process verifies this exact view and file URL before delivering any data.
if (
  process.isMainFrame &&
  location.protocol === 'file:' &&
  location.pathname.endsWith('/renderer/activity.html')
) {
  const bridge: ActivityCardAPI = {
    input: async () => typedInvoke(ACTIVITY_INPUT_CHANNEL),
    finish: (dataUrl) => ipcRenderer.send(ACTIVITY_OUTPUT_CHANNEL, dataUrl),
  }
  contextBridge.exposeInMainWorld('activityCard', bridge)
}
