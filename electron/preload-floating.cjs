const { contextBridge, ipcRenderer } = require('electron')

const { log } = require('../src/lib/logger.cjs')

// Whitelist of allowed IPC channels for floating navigator (more restricted than main window)
const ALLOWED_CHANNELS = {
  // Essential todo operations for floating navigator
  'todo-get-all': true,
  'todo-create': true,
  'todo-update': true,
  'todo-delete': true,

  // Window operations specific to floating navigator
  'floating-window-close': true,
  'floating-window-minimize': true,
  'floating-window-toggle-always-on-top': true,

  // Quick actions
  'todo-toggle-complete': true,
  'todo-quick-create': true,

  // Event channels for real-time updates
  'todo-updated': true,
  'todo-created': true,
  'todo-deleted': true,
  'floating-window-focus': true,
  'floating-window-blur': true,

  // Notification management (limited for floating navigator)
  'notification-show': true,
  'notification-get-preferences': true,
  'notification-is-enabled': true,

  // Keyboard shortcuts (limited for floating navigator)
  'shortcuts-get-registered': true,
  'shortcuts-get-defaults': true,
  'shortcuts-get-stats': true,
}

/**
 * Validate IPC channel for security
 */
function validateChannel(channel) {
  return ALLOWED_CHANNELS[channel] === true
}

/**
 * Sanitize data to prevent injection attacks (same as main preload)
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

// Expose compact API surface for floating navigator
contextBridge.exposeInMainWorld('floatingNavigatorAPI', {
  // Essential todo operations optimized for floating navigator
  todos: {
    /**
     * Get all todos (optimized for floating navigator display)
     */
    getTodos: async () => {
      try {
        return await ipcRenderer.invoke('todo-get-all')
      } catch (error) {
        log.error('Floating Navigator: Failed to get todos:', error)
        throw new Error('Failed to retrieve todos')
      }
    },

    /**
     * Quick create todo with minimal data
     */
    quickCreate: async (title) => {
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('Todo text is required')
      }

      const sanitizedTitle = sanitizeData(title)

      try {
        // Use quick create handler or fallback to regular create
        const todoData = { text: sanitizedTitle }
        return (
          (await ipcRenderer.invoke('todo-quick-create', todoData)) ||
          (await ipcRenderer.invoke('todo-create', todoData))
        )
      } catch (error) {
        log.error('Floating Navigator: Failed to create todo:', error)
        throw new Error('Failed to create todo')
      }
    },

    /**
     * Toggle todo completion status
     */
    toggleComplete: async (id) => {
      if (!id) {
        throw new Error('Invalid todo ID')
      }

      const sanitizedId = sanitizeData(id)

      try {
        // Use toggle handler or fallback to regular update
        return (
          (await ipcRenderer.invoke('todo-toggle-complete', sanitizedId)) ||
          (await ipcRenderer.invoke('todo-update', sanitizedId, {
            completed: true,
          }))
        )
      } catch (error) {
        log.error('Floating Navigator: Failed to toggle todo:', error)
        throw new Error('Failed to toggle todo')
      }
    },

    /**
     * Update todo (limited to title and completion status for floating navigator)
     */
    updateTodo: async (id, updates) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid todo ID')
      }
      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid update data')
      }

      const sanitizedId = sanitizeData(id)

      // Restrict updates to safe fields for floating navigator
      const allowedFields = ['title', 'completed']
      const sanitizedUpdates = {}

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          sanitizedUpdates[key] = sanitizeData(value)
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        throw new Error('No valid fields to update')
      }

      try {
        return await ipcRenderer.invoke(
          'todo-update',
          sanitizedId,
          sanitizedUpdates,
        )
      } catch (error) {
        log.error('Floating Navigator: Failed to update todo:', error)
        throw new Error('Failed to update todo')
      }
    },

    /**
     * Delete todo
     */
    deleteTodo: async (id) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid todo ID')
      }

      const sanitizedId = sanitizeData(id)

      try {
        return await ipcRenderer.invoke('todo-delete', sanitizedId)
      } catch (error) {
        log.error('Floating Navigator: Failed to delete todo:', error)
        throw new Error('Failed to delete todo')
      }
    },
  },

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
        // This will be handled by the main process to restore main window
        return await ipcRenderer.invoke('window-show-main')
      } catch (error) {
        log.error('Floating Navigator: Failed to focus main window:', error)
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

  // Utility functions for floating navigator
  utils: {
    /**
     * Get current window bounds
     */
    getWindowBounds: async () => {
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
    setWindowBounds: async (bounds) => {
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

  // Limited notification support for floating navigator
  notifications: {
    /**
     * Show notification from floating navigator
     */
    show: async (title, body, options = {}) => {
      if (!title || typeof title !== 'string') {
        throw new Error('Notification title is required')
      }
      if (!body || typeof body !== 'string') {
        throw new Error('Notification body is required')
      }

      const sanitizedTitle = sanitizeData(title)
      const sanitizedBody = sanitizeData(body)
      const sanitizedOptions = sanitizeData(options)

      try {
        return await ipcRenderer.invoke(
          'notification-show',
          sanitizedTitle,
          sanitizedBody,
          sanitizedOptions,
        )
      } catch (error) {
        log.error('Floating Navigator: Failed to show notification:', error)
        throw new Error('Failed to show notification')
      }
    },

    /**
     * Check if notifications are enabled
     */
    isEnabled: async () => {
      try {
        return await ipcRenderer.invoke('notification-is-enabled')
      } catch (error) {
        log.error(
          'Floating Navigator: Failed to check notification status:',
          error,
        )
        return false
      }
    },

    /**
     * Get notification preferences (read-only for floating navigator)
     */
    getPreferences: async () => {
      try {
        return await ipcRenderer.invoke('notification-get-preferences')
      } catch (error) {
        log.error(
          'Floating Navigator: Failed to get notification preferences:',
          error,
        )
        return null
      }
    },
  },

  // Limited shortcut support for floating navigator
  shortcuts: {
    /**
     * Get currently registered shortcuts (read-only)
     */
    getRegistered: async () => {
      try {
        return await ipcRenderer.invoke('shortcuts-get-registered')
      } catch (error) {
        log.error(
          'Floating Navigator: Failed to get registered shortcuts:',
          error,
        )
        return {}
      }
    },

    /**
     * Get default shortcuts configuration (read-only)
     */
    getDefaults: async () => {
      try {
        return await ipcRenderer.invoke('shortcuts-get-defaults')
      } catch (error) {
        log.error('Floating Navigator: Failed to get default shortcuts:', error)
        return {}
      }
    },

    /**
     * Get shortcut statistics (read-only)
     */
    getStats: async () => {
      try {
        return await ipcRenderer.invoke('shortcuts-get-stats')
      } catch (error) {
        log.error('Floating Navigator: Failed to get shortcut stats:', error)
        return null
      }
    },
  },
})

// Expose minimal environment information for floating navigator
contextBridge.exposeInMainWorld('floatingNavigatorEnv', {
  isElectron: true,
  isFloatingNavigator: true,
  platform: process.platform,
})

// Expose keyboard shortcut helpers for floating navigator
contextBridge.exposeInMainWorld('floatingNavigatorShortcuts', {
  /**
   * Register keyboard shortcuts specific to floating navigator
   */
  register: async (shortcuts) => {
    if (!shortcuts || typeof shortcuts !== 'object') {
      log.error('Floating Navigator: Invalid shortcuts configuration')
      return
    }

    const sanitizedShortcuts = sanitizeData(shortcuts)

    try {
      return ipcRenderer.invoke(
        'floating-window-register-shortcuts',
        sanitizedShortcuts,
      )
    } catch (error) {
      log.error('Floating Navigator: Failed to register shortcuts:', error)
    }
  },

  /**
   * Unregister keyboard shortcuts
   */
  unregister: async (shortcutKeys) => {
    if (!Array.isArray(shortcutKeys)) {
      log.error('Floating Navigator: Shortcut keys must be an array')
      return
    }

    const sanitizedKeys = sanitizeData(shortcutKeys)

    try {
      return ipcRenderer.invoke(
        'floating-window-unregister-shortcuts',
        sanitizedKeys,
      )
    } catch (error) {
      log.error('Floating Navigator: Failed to unregister shortcuts:', error)
    }
  },
})
