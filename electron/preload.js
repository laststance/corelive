const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getVersion: async () => ipcRenderer.invoke('app-version'),

  // App controls
  quit: async () => ipcRenderer.invoke('app-quit'),

  // Event listeners (secure channel management)
  on: (channel, callback) => {
    // Whitelist of allowed channels
    const validChannels = [
      'window-focus',
      'window-blur',
      'app-update-available',
      'app-update-downloaded',
    ]

    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback)
    }
  },

  removeListener: (channel, callback) => {
    const validChannels = [
      'window-focus',
      'window-blur',
      'app-update-available',
      'app-update-downloaded',
    ]

    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback)
    }
  },
})

// Expose environment information
contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
  platform: process.platform,
  versions: process.versions,
})
