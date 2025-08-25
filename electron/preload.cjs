const { contextBridge, ipcRenderer } = require('electron')

// Whitelist of allowed IPC channels for security
const ALLOWED_CHANNELS = {
  // Todo operations
  'todo-get-all': true,
  'todo-create': true,
  'todo-update': true,
  'todo-delete': true,
  'todo-get-by-id': true,

  // Authentication operations
  'auth-get-user': true,
  'auth-set-user': true,
  'auth-logout': true,
  'auth-is-authenticated': true,
  'auth-sync-from-web': true,

  // Window operations
  'window-minimize': true,
  'window-close': true,
  'window-toggle-floating-navigator': true,
  'window-show-floating-navigator': true,
  'window-hide-floating-navigator': true,

  // System operations
  'tray-show-notification': true,
  'tray-update-menu': true,
  'tray-set-tooltip': true,

  // Notification management
  'notification-show': true,
  'notification-get-preferences': true,
  'notification-update-preferences': true,
  'notification-clear-all': true,
  'notification-clear': true,
  'notification-is-enabled': true,
  'notification-get-active-count': true,

  // Keyboard shortcut management
  'shortcuts-get-registered': true,
  'shortcuts-get-defaults': true,
  'shortcuts-update': true,
  'shortcuts-register': true,
  'shortcuts-unregister': true,
  'shortcuts-is-registered': true,
  'shortcuts-enable': true,
  'shortcuts-disable': true,
  'shortcuts-get-stats': true,

  // Configuration management
  'config-get': true,
  'config-set': true,
  'config-get-all': true,
  'config-get-section': true,
  'config-update': true,
  'config-reset': true,
  'config-reset-section': true,
  'config-validate': true,
  'config-export': true,
  'config-import': true,
  'config-backup': true,
  'config-get-paths': true,

  // Window state management
  'window-state-get': true,
  'window-state-set': true,
  'window-state-reset': true,
  'window-state-get-stats': true,
  'window-state-move-to-display': true,
  'window-state-snap-to-edge': true,
  'window-state-get-display': true,
  'window-state-get-all-displays': true,

  // App operations
  'app-version': true,
  'app-quit': true,

  // Event channels
  'window-focus': true,
  'window-blur': true,
  'app-update-available': true,
  'app-update-downloaded': true,
  'todo-updated': true,
  'todo-created': true,
  'todo-deleted': true,
  'auth-state-changed': true,
  'focus-task': true,
  'mark-task-complete': true,
  'shortcut-new-task': true,
  'shortcut-search': true,
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
    // Deep clone and sanitize object properties
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

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Todo operations - secure IPC channels for CRUD operations
  todos: {
    /**
     * Get all todos
     */
    getTodos: async () => {
      try {
        return await ipcRenderer.invoke('todo-get-all')
      } catch (error) {
        console.error('Failed to get todos:', error)
        throw new Error('Failed to retrieve todos')
      }
    },

    /**
     * Get todo by ID
     */
    getTodoById: async (id) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid todo ID')
      }
      try {
        return await ipcRenderer.invoke('todo-get-by-id', sanitizeData(id))
      } catch (error) {
        console.error('Failed to get todo:', error)
        throw new Error('Failed to retrieve todo')
      }
    },

    /**
     * Create new todo
     */
    createTodo: async (todoData) => {
      if (!todoData || typeof todoData !== 'object') {
        throw new Error('Invalid todo data')
      }

      const sanitizedData = sanitizeData(todoData)

      // Validate required fields
      if (!sanitizedData.title || typeof sanitizedData.title !== 'string') {
        throw new Error('Todo title is required')
      }

      try {
        return await ipcRenderer.invoke('todo-create', sanitizedData)
      } catch (error) {
        console.error('Failed to create todo:', error)
        throw new Error('Failed to create todo')
      }
    },

    /**
     * Update existing todo
     */
    updateTodo: async (id, updates) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid todo ID')
      }
      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid update data')
      }

      const sanitizedId = sanitizeData(id)
      const sanitizedUpdates = sanitizeData(updates)

      try {
        return await ipcRenderer.invoke(
          'todo-update',
          sanitizedId,
          sanitizedUpdates,
        )
      } catch (error) {
        console.error('Failed to update todo:', error)
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
        console.error('Failed to delete todo:', error)
        throw new Error('Failed to delete todo')
      }
    },
  },

  // Window control APIs
  window: {
    /**
     * Minimize window to tray
     */
    minimize: async () => {
      try {
        return await ipcRenderer.invoke('window-minimize')
      } catch (error) {
        console.error('Failed to minimize window:', error)
      }
    },

    /**
     * Close window (minimize to tray)
     */
    close: async () => {
      try {
        return await ipcRenderer.invoke('window-close')
      } catch (error) {
        console.error('Failed to close window:', error)
      }
    },

    /**
     * Toggle floating navigator visibility
     */
    toggleFloatingNavigator: async () => {
      try {
        return await ipcRenderer.invoke('window-toggle-floating-navigator')
      } catch (error) {
        console.error('Failed to toggle floating navigator:', error)
      }
    },

    /**
     * Show floating navigator
     */
    showFloatingNavigator: async () => {
      try {
        return await ipcRenderer.invoke('window-show-floating-navigator')
      } catch (error) {
        console.error('Failed to show floating navigator:', error)
      }
    },

    /**
     * Hide floating navigator
     */
    hideFloatingNavigator: async () => {
      try {
        return await ipcRenderer.invoke('window-hide-floating-navigator')
      } catch (error) {
        console.error('Failed to hide floating navigator:', error)
      }
    },
  },

  // System integration APIs
  system: {
    /**
     * Show native notification
     */
    showNotification: async (title, body, options = {}) => {
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
          'tray-show-notification',
          sanitizedTitle,
          sanitizedBody,
          sanitizedOptions,
        )
      } catch (error) {
        console.error('Failed to show notification:', error)
        throw new Error('Failed to show notification')
      }
    },

    /**
     * Update system tray menu with tasks
     */
    updateTrayMenu: async (tasks = []) => {
      if (!Array.isArray(tasks)) {
        throw new Error('Tasks must be an array')
      }

      const sanitizedTasks = sanitizeData(tasks)

      try {
        return await ipcRenderer.invoke('tray-update-menu', sanitizedTasks)
      } catch (error) {
        console.error('Failed to update tray menu:', error)
      }
    },

    /**
     * Set system tray tooltip
     */
    setTrayTooltip: async (text) => {
      if (!text || typeof text !== 'string') {
        throw new Error('Tooltip text is required')
      }

      const sanitizedText = sanitizeData(text)

      try {
        return await ipcRenderer.invoke('tray-set-tooltip', sanitizedText)
      } catch (error) {
        console.error('Failed to set tray tooltip:', error)
      }
    },
  },

  // Notification management APIs
  notifications: {
    /**
     * Show custom notification
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
        console.error('Failed to show notification:', error)
        throw new Error('Failed to show notification')
      }
    },

    /**
     * Get notification preferences
     */
    getPreferences: async () => {
      try {
        return await ipcRenderer.invoke('notification-get-preferences')
      } catch (error) {
        console.error('Failed to get notification preferences:', error)
        return null
      }
    },

    /**
     * Update notification preferences
     */
    updatePreferences: async (preferences) => {
      if (!preferences || typeof preferences !== 'object') {
        throw new Error('Invalid preferences data')
      }

      const sanitizedPreferences = sanitizeData(preferences)

      try {
        return await ipcRenderer.invoke(
          'notification-update-preferences',
          sanitizedPreferences,
        )
      } catch (error) {
        console.error('Failed to update notification preferences:', error)
        throw new Error('Failed to update preferences')
      }
    },

    /**
     * Clear all active notifications
     */
    clearAll: async () => {
      try {
        return await ipcRenderer.invoke('notification-clear-all')
      } catch (error) {
        console.error('Failed to clear all notifications:', error)
      }
    },

    /**
     * Clear specific notification by tag
     */
    clear: async (tag) => {
      if (!tag || typeof tag !== 'string') {
        throw new Error('Notification tag is required')
      }

      const sanitizedTag = sanitizeData(tag)

      try {
        return await ipcRenderer.invoke('notification-clear', sanitizedTag)
      } catch (error) {
        console.error('Failed to clear notification:', error)
      }
    },

    /**
     * Check if notifications are enabled
     */
    isEnabled: async () => {
      try {
        return await ipcRenderer.invoke('notification-is-enabled')
      } catch (error) {
        console.error('Failed to check notification status:', error)
        return false
      }
    },

    /**
     * Get count of active notifications
     */
    getActiveCount: async () => {
      try {
        return await ipcRenderer.invoke('notification-get-active-count')
      } catch (error) {
        console.error('Failed to get active notification count:', error)
        return 0
      }
    },
  },

  // Keyboard shortcut management APIs
  shortcuts: {
    /**
     * Get currently registered shortcuts
     */
    getRegistered: async () => {
      try {
        return await ipcRenderer.invoke('shortcuts-get-registered')
      } catch (error) {
        console.error('Failed to get registered shortcuts:', error)
        return {}
      }
    },

    /**
     * Get default shortcuts configuration
     */
    getDefaults: async () => {
      try {
        return await ipcRenderer.invoke('shortcuts-get-defaults')
      } catch (error) {
        console.error('Failed to get default shortcuts:', error)
        return {}
      }
    },

    /**
     * Update shortcuts configuration
     */
    update: async (shortcuts) => {
      if (!shortcuts || typeof shortcuts !== 'object') {
        throw new Error('Invalid shortcuts configuration')
      }

      const sanitizedShortcuts = sanitizeData(shortcuts)

      try {
        return await ipcRenderer.invoke('shortcuts-update', sanitizedShortcuts)
      } catch (error) {
        console.error('Failed to update shortcuts:', error)
        throw new Error('Failed to update shortcuts')
      }
    },

    /**
     * Register a single shortcut
     */
    register: async (accelerator, id) => {
      if (!accelerator || typeof accelerator !== 'string') {
        throw new Error('Accelerator is required')
      }
      if (!id || typeof id !== 'string') {
        throw new Error('Shortcut ID is required')
      }

      const sanitizedAccelerator = sanitizeData(accelerator)
      const sanitizedId = sanitizeData(id)

      try {
        return await ipcRenderer.invoke(
          'shortcuts-register',
          sanitizedAccelerator,
          sanitizedId,
        )
      } catch (error) {
        console.error('Failed to register shortcut:', error)
        throw new Error('Failed to register shortcut')
      }
    },

    /**
     * Unregister a shortcut
     */
    unregister: async (id) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Shortcut ID is required')
      }

      const sanitizedId = sanitizeData(id)

      try {
        return await ipcRenderer.invoke('shortcuts-unregister', sanitizedId)
      } catch (error) {
        console.error('Failed to unregister shortcut:', error)
        throw new Error('Failed to unregister shortcut')
      }
    },

    /**
     * Check if shortcut is registered
     */
    isRegistered: async (accelerator) => {
      if (!accelerator || typeof accelerator !== 'string') {
        throw new Error('Accelerator is required')
      }

      const sanitizedAccelerator = sanitizeData(accelerator)

      try {
        return await ipcRenderer.invoke(
          'shortcuts-is-registered',
          sanitizedAccelerator,
        )
      } catch (error) {
        console.error('Failed to check shortcut registration:', error)
        return false
      }
    },

    /**
     * Enable shortcuts
     */
    enable: async () => {
      try {
        return await ipcRenderer.invoke('shortcuts-enable')
      } catch (error) {
        console.error('Failed to enable shortcuts:', error)
        return false
      }
    },

    /**
     * Disable shortcuts
     */
    disable: async () => {
      try {
        return await ipcRenderer.invoke('shortcuts-disable')
      } catch (error) {
        console.error('Failed to disable shortcuts:', error)
        return false
      }
    },

    /**
     * Get shortcut statistics
     */
    getStats: async () => {
      try {
        return await ipcRenderer.invoke('shortcuts-get-stats')
      } catch (error) {
        console.error('Failed to get shortcut stats:', error)
        return null
      }
    },
  },

  // Authentication management
  auth: {
    /**
     * Get current user
     */
    getUser: async () => {
      try {
        return await ipcRenderer.invoke('auth-get-user')
      } catch (error) {
        console.error('Failed to get user:', error)
        return null
      }
    },

    /**
     * Set current user
     */
    setUser: async (user) => {
      try {
        return await ipcRenderer.invoke('auth-set-user', sanitizeData(user))
      } catch (error) {
        console.error('Failed to set user:', error)
        throw new Error('Failed to set user')
      }
    },

    /**
     * Logout current user
     */
    logout: async () => {
      try {
        return await ipcRenderer.invoke('auth-logout')
      } catch (error) {
        console.error('Failed to logout:', error)
        throw new Error('Failed to logout')
      }
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated: async () => {
      try {
        return await ipcRenderer.invoke('auth-is-authenticated')
      } catch (error) {
        console.error('Failed to check authentication:', error)
        return false
      }
    },

    /**
     * Sync authentication state from web version
     */
    syncFromWeb: async (authData) => {
      try {
        return await ipcRenderer.invoke(
          'auth-sync-from-web',
          sanitizeData(authData),
        )
      } catch (error) {
        console.error('Failed to sync auth from web:', error)
        throw new Error('Failed to sync authentication')
      }
    },
  },

  // Configuration management APIs
  config: {
    /**
     * Get configuration value by path
     */
    get: async (path, defaultValue) => {
      if (!path || typeof path !== 'string') {
        throw new Error('Configuration path is required')
      }

      const sanitizedPath = sanitizeData(path)
      const sanitizedDefault = sanitizeData(defaultValue)

      try {
        return await ipcRenderer.invoke(
          'config-get',
          sanitizedPath,
          sanitizedDefault,
        )
      } catch (error) {
        console.error('Failed to get config value:', error)
        return defaultValue
      }
    },

    /**
     * Set configuration value by path
     */
    set: async (path, value) => {
      if (!path || typeof path !== 'string') {
        throw new Error('Configuration path is required')
      }

      const sanitizedPath = sanitizeData(path)
      const sanitizedValue = sanitizeData(value)

      try {
        return await ipcRenderer.invoke(
          'config-set',
          sanitizedPath,
          sanitizedValue,
        )
      } catch (error) {
        console.error('Failed to set config value:', error)
        throw new Error('Failed to update configuration')
      }
    },

    /**
     * Get entire configuration
     */
    getAll: async () => {
      try {
        return await ipcRenderer.invoke('config-get-all')
      } catch (error) {
        console.error('Failed to get all config:', error)
        return {}
      }
    },

    /**
     * Get configuration section
     */
    getSection: async (section) => {
      if (!section || typeof section !== 'string') {
        throw new Error('Configuration section is required')
      }

      const sanitizedSection = sanitizeData(section)

      try {
        return await ipcRenderer.invoke('config-get-section', sanitizedSection)
      } catch (error) {
        console.error('Failed to get config section:', error)
        return {}
      }
    },

    /**
     * Update multiple configuration values
     */
    update: async (updates) => {
      if (!updates || typeof updates !== 'object') {
        throw new Error('Configuration updates must be an object')
      }

      const sanitizedUpdates = sanitizeData(updates)

      try {
        return await ipcRenderer.invoke('config-update', sanitizedUpdates)
      } catch (error) {
        console.error('Failed to update config:', error)
        throw new Error('Failed to update configuration')
      }
    },

    /**
     * Reset configuration to defaults
     */
    reset: async () => {
      try {
        return await ipcRenderer.invoke('config-reset')
      } catch (error) {
        console.error('Failed to reset config:', error)
        throw new Error('Failed to reset configuration')
      }
    },

    /**
     * Reset specific section to defaults
     */
    resetSection: async (section) => {
      if (!section || typeof section !== 'string') {
        throw new Error('Configuration section is required')
      }

      const sanitizedSection = sanitizeData(section)

      try {
        return await ipcRenderer.invoke(
          'config-reset-section',
          sanitizedSection,
        )
      } catch (error) {
        console.error('Failed to reset config section:', error)
        throw new Error('Failed to reset configuration section')
      }
    },

    /**
     * Validate configuration
     */
    validate: async () => {
      try {
        return await ipcRenderer.invoke('config-validate')
      } catch (error) {
        console.error('Failed to validate config:', error)
        return { isValid: false, errors: ['Validation failed'] }
      }
    },

    /**
     * Export configuration to file
     */
    export: async (filePath) => {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('File path is required')
      }

      const sanitizedPath = sanitizeData(filePath)

      try {
        return await ipcRenderer.invoke('config-export', sanitizedPath)
      } catch (error) {
        console.error('Failed to export config:', error)
        throw new Error('Failed to export configuration')
      }
    },

    /**
     * Import configuration from file
     */
    import: async (filePath) => {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('File path is required')
      }

      const sanitizedPath = sanitizeData(filePath)

      try {
        return await ipcRenderer.invoke('config-import', sanitizedPath)
      } catch (error) {
        console.error('Failed to import config:', error)
        throw new Error('Failed to import configuration')
      }
    },

    /**
     * Backup current configuration
     */
    backup: async () => {
      try {
        return await ipcRenderer.invoke('config-backup')
      } catch (error) {
        console.error('Failed to backup config:', error)
        return null
      }
    },

    /**
     * Get configuration file paths
     */
    getPaths: async () => {
      try {
        return await ipcRenderer.invoke('config-get-paths')
      } catch (error) {
        console.error('Failed to get config paths:', error)
        return {}
      }
    },
  },

  // Window state management APIs
  windowState: {
    /**
     * Get window state
     */
    get: async (windowType) => {
      if (!windowType || typeof windowType !== 'string') {
        throw new Error('Window type is required')
      }

      const sanitizedType = sanitizeData(windowType)

      try {
        return await ipcRenderer.invoke('window-state-get', sanitizedType)
      } catch (error) {
        console.error('Failed to get window state:', error)
        return null
      }
    },

    /**
     * Set window state properties
     */
    set: async (windowType, properties) => {
      if (!windowType || typeof windowType !== 'string') {
        throw new Error('Window type is required')
      }
      if (!properties || typeof properties !== 'object') {
        throw new Error('Window properties must be an object')
      }

      const sanitizedType = sanitizeData(windowType)
      const sanitizedProperties = sanitizeData(properties)

      try {
        return await ipcRenderer.invoke(
          'window-state-set',
          sanitizedType,
          sanitizedProperties,
        )
      } catch (error) {
        console.error('Failed to set window state:', error)
        throw new Error('Failed to update window state')
      }
    },

    /**
     * Reset window state to defaults
     */
    reset: async (windowType) => {
      if (!windowType || typeof windowType !== 'string') {
        throw new Error('Window type is required')
      }

      const sanitizedType = sanitizeData(windowType)

      try {
        return await ipcRenderer.invoke('window-state-reset', sanitizedType)
      } catch (error) {
        console.error('Failed to reset window state:', error)
        throw new Error('Failed to reset window state')
      }
    },

    /**
     * Get window state statistics
     */
    getStats: async () => {
      try {
        return await ipcRenderer.invoke('window-state-get-stats')
      } catch (error) {
        console.error('Failed to get window state stats:', error)
        return {}
      }
    },

    /**
     * Move window to specific display
     */
    moveToDisplay: async (windowType, displayId) => {
      if (!windowType || typeof windowType !== 'string') {
        throw new Error('Window type is required')
      }
      if (!displayId || typeof displayId !== 'number') {
        throw new Error('Display ID is required')
      }

      const sanitizedType = sanitizeData(windowType)
      const sanitizedDisplayId = sanitizeData(displayId)

      try {
        return await ipcRenderer.invoke(
          'window-state-move-to-display',
          sanitizedType,
          sanitizedDisplayId,
        )
      } catch (error) {
        console.error('Failed to move window to display:', error)
        throw new Error('Failed to move window to display')
      }
    },

    /**
     * Snap window to edge of current display
     */
    snapToEdge: async (windowType, edge) => {
      if (!windowType || typeof windowType !== 'string') {
        throw new Error('Window type is required')
      }
      if (!edge || typeof edge !== 'string') {
        throw new Error('Edge is required')
      }

      const sanitizedType = sanitizeData(windowType)
      const sanitizedEdge = sanitizeData(edge)

      try {
        return await ipcRenderer.invoke(
          'window-state-snap-to-edge',
          sanitizedType,
          sanitizedEdge,
        )
      } catch (error) {
        console.error('Failed to snap window to edge:', error)
        throw new Error('Failed to snap window to edge')
      }
    },

    /**
     * Get display information for a window
     */
    getDisplay: async (windowType) => {
      if (!windowType || typeof windowType !== 'string') {
        throw new Error('Window type is required')
      }

      const sanitizedType = sanitizeData(windowType)

      try {
        return await ipcRenderer.invoke(
          'window-state-get-display',
          sanitizedType,
        )
      } catch (error) {
        console.error('Failed to get window display:', error)
        return null
      }
    },

    /**
     * Get all available displays
     */
    getAllDisplays: async () => {
      try {
        return await ipcRenderer.invoke('window-state-get-all-displays')
      } catch (error) {
        console.error('Failed to get all displays:', error)
        return []
      }
    },
  },

  // App information and controls
  app: {
    /**
     * Get app version
     */
    getVersion: async () => {
      try {
        return await ipcRenderer.invoke('app-version')
      } catch (error) {
        console.error('Failed to get app version:', error)
        return 'unknown'
      }
    },

    /**
     * Quit application
     */
    quit: async () => {
      try {
        return await ipcRenderer.invoke('app-quit')
      } catch (error) {
        console.error('Failed to quit app:', error)
      }
    },
  },

  // Secure event listener management
  on: (channel, callback) => {
    if (!validateChannel(channel)) {
      console.error(`Attempted to listen to unauthorized channel: ${channel}`)
      return
    }

    if (typeof callback !== 'function') {
      console.error('Callback must be a function')
      return
    }

    // Wrap callback to sanitize incoming data
    const wrappedCallback = (event, ...args) => {
      try {
        const sanitizedArgs = args.map((arg) => sanitizeData(arg))
        callback(event, ...sanitizedArgs)
      } catch (error) {
        console.error('Error in event callback:', error)
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
      console.error(
        `Attempted to remove listener from unauthorized channel: ${channel}`,
      )
      return
    }

    ipcRenderer.removeListener(channel, callback)
  },

  // Remove all listeners for a channel
  removeAllListeners: (channel) => {
    if (!validateChannel(channel)) {
      console.error(
        `Attempted to remove all listeners from unauthorized channel: ${channel}`,
      )
      return
    }

    ipcRenderer.removeAllListeners(channel)
  },
})

// Expose environment information
contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
})
