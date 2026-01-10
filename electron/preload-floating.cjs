/**
 * @fileoverview Preload script for Floating Navigator Window
 *
 * In WebView architecture, the Floating Navigator loads https://corelive.app/floating-navigator
 * and uses oRPC (via the web app) for all data operations.
 *
 * This preload script only exposes:
 * - Window control APIs (close, minimize, always-on-top)
 * - Platform detection (isElectron, isFloatingNavigator)
 *
 * Note: Todo operations are NOT exposed here - they are handled by
 * the React components using the same oRPC client as the web version.
 *
 * @module electron/preload-floating
 */

const { contextBridge, ipcRenderer } = require('electron')

const { log } = require('./logger.cjs')

// Whitelist of allowed IPC channels for floating navigator (window controls only)
const ALLOWED_CHANNELS = {
  // Window operations specific to floating navigator
  'floating-window-close': true,
  'floating-window-minimize': true,
  'floating-window-toggle-always-on-top': true,
  'floating-window-get-bounds': true,
  'floating-window-set-bounds': true,
  'floating-window-is-always-on-top': true,

  // Focus events
  'floating-window-focus': true,
  'floating-window-blur': true,

  // Show main window
  'window-show-main': true,
}

/**
 * Validate IPC channel for security
 */
function validateChannel(channel) {
  return ALLOWED_CHANNELS[channel] === true
}

/**
 * Sanitize data to prevent injection attacks
 */
function sanitizeData(data) {
  if (typeof data === 'string') {
    return data.trim()
  }
  if (typeof data === 'object' && data !== null) {
    const sanitized = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        sanitized[key] = value.trim()
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value
      } else if (value === null || value === undefined) {
        sanitized[key] = value
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) => sanitizeData(item))
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeData(value)
      }
    }
    return sanitized
  }
  return data
}

/**
 * Expose compact API surface for floating navigator window controls.
 *
 * Note: In WebView architecture, all data operations (todos, auth, etc.)
 * are handled by the web app via oRPC. This API only provides
 * Electron-specific window controls.
 */
contextBridge.exposeInMainWorld('floatingNavigatorAPI', {
  // Floating window specific controls
  window: {
    /**
     * Close floating navigator window
     */
    close: async () => {
      try {
        return await ipcRenderer.invoke('floating-window-close')
      } catch (error) {
        log.error('Floating Navigator: Failed to close window:', error)
      }
    },

    /**
     * Minimize floating navigator window
     */
    minimize: async () => {
      try {
        return await ipcRenderer.invoke('floating-window-minimize')
      } catch (error) {
        log.error('Floating Navigator: Failed to minimize window:', error)
      }
    },

    /**
     * Toggle always on top behavior
     */
    toggleAlwaysOnTop: async () => {
      try {
        return await ipcRenderer.invoke('floating-window-toggle-always-on-top')
      } catch (error) {
        log.error('Floating Navigator: Failed to toggle always on top:', error)
      }
    },

    /**
     * Focus main application window
     */
    focusMainWindow: async () => {
      try {
        return await ipcRenderer.invoke('window-show-main')
      } catch (error) {
        log.error('Floating Navigator: Failed to focus main window:', error)
      }
    },

    /**
     * Get current window bounds
     */
    getBounds: async () => {
      try {
        return await ipcRenderer.invoke('floating-window-get-bounds')
      } catch (error) {
        log.error('Floating Navigator: Failed to get window bounds:', error)
        return null
      }
    },

    /**
     * Set window bounds
     */
    setBounds: async (bounds) => {
      if (!bounds || typeof bounds !== 'object') {
        throw new Error('Invalid bounds data')
      }

      const sanitizedBounds = sanitizeData(bounds)

      try {
        return await ipcRenderer.invoke(
          'floating-window-set-bounds',
          sanitizedBounds,
        )
      } catch (error) {
        log.error('Floating Navigator: Failed to set window bounds:', error)
      }
    },

    /**
     * Check if window is always on top
     */
    isAlwaysOnTop: async () => {
      try {
        return await ipcRenderer.invoke('floating-window-is-always-on-top')
      } catch (error) {
        log.error(
          'Floating Navigator: Failed to check always on top status:',
          error,
        )
        return false
      }
    },
  },

  // Secure event listener management (restricted set for floating navigator)
  on: (channel, callback) => {
    if (!validateChannel(channel)) {
      log.error(
        `Floating Navigator: Attempted to listen to unauthorized channel: ${channel}`,
      )
      return
    }

    if (typeof callback !== 'function') {
      log.error('Floating Navigator: Callback must be a function')
      return
    }

    // Wrap callback to sanitize incoming data
    const wrappedCallback = (event, ...args) => {
      try {
        const sanitizedArgs = args.map((arg) => sanitizeData(arg))
        callback(event, ...sanitizedArgs)
      } catch (error) {
        log.error('Floating Navigator: Error in event callback:', error)
      }
    }

    ipcRenderer.on(channel, wrappedCallback)

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback)
    }
  },

  removeListener: (channel, callback) => {
    if (!validateChannel(channel)) {
      log.error(
        `Floating Navigator: Attempted to remove listener from unauthorized channel: ${channel}`,
      )
      return
    }

    ipcRenderer.removeListener(channel, callback)
  },
})

/**
 * Expose environment information for floating navigator.
 *
 * Used by React components to detect Electron context
 * and enable platform-specific features.
 */
contextBridge.exposeInMainWorld('floatingNavigatorEnv', {
  isElectron: true,
  isFloatingNavigator: true,
  platform: process.platform,
})

// Listen for menu actions from main process and dispatch custom events
ipcRenderer.on('floating-navigator-menu-action', (_event, action) => {
  // Dispatch custom event that FloatingNavigator component can listen to
  window.dispatchEvent(
    new CustomEvent('floating-navigator-menu-action', {
      detail: { action },
    }),
  )
})
