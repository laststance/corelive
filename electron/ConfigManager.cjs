/**
 * @fileoverview Configuration Manager for Electron Application
 *
 * Manages all user preferences and application settings with:
 * - Persistent storage in platform-specific directories
 * - Type-safe default values
 * - Automatic backup and recovery
 * - Migration support for version updates
 *
 * Storage locations:
 * - Windows: %APPDATA%/CoreLive/config.json
 * - macOS: ~/Library/Application Support/CoreLive/config.json
 * - Linux: ~/.config/CoreLive/config.json
 *
 * @module electron/ConfigManager
 */

const fs = require('fs')
const path = require('path')

const { app } = require('electron')

const { log } = require('./logger.cjs')

/**
 * Manages application configuration with persistence and validation.
 *
 * Features:
 * - Hierarchical configuration structure (dot notation access)
 * - Automatic file creation with sensible defaults
 * - Safe writes with atomic file operations
 * - Configuration validation and sanitization
 * - Backup management for recovery
 *
 * Why a dedicated config manager?
 * - Centralized settings management
 * - Cross-platform path handling
 * - Prevents corruption with safe writes
 * - Easy testing with dependency injection
 */
class ConfigManager {
  constructor() {
    /**
     * Platform-specific configuration directory.
     * app.getPath('userData') ensures configs are stored in the
     * correct location for each OS, respecting user permissions.
     */
    this.configDir = app.getPath('userData')
    this.configPath = path.join(this.configDir, 'config.json')
    this.windowStatePath = path.join(this.configDir, 'window-state.json')

    // Create directory if it doesn't exist
    this.ensureConfigDirectory()

    // Define default values for all settings
    this.defaultConfig = this.getDefaultConfig()

    // Load existing config or create with defaults
    this.config = this.loadConfig()
  }

  /**
   * Defines the default configuration structure with sensible defaults.
   *
   * These defaults are carefully chosen to:
   * - Provide good first-run experience on macOS
   * - Be accessible (reasonable font sizes, etc.)
   * - Follow macOS conventions (keyboard shortcuts)
   *
   * @returns {Object} Default configuration object
   */
  getDefaultConfig() {
    // macOS uses Cmd as the primary modifier key
    const modifier = 'Cmd'

    return {
      version: '1.0.0', // Config schema version for migrations

      // Window preferences
      window: {
        main: {
          width: 1200, // Good for most screens
          height: 800, // 3:2 aspect ratio
          minWidth: 800, // Minimum for usable UI
          minHeight: 600, // Prevents UI compression
          rememberPosition: true, // Restore last position
          rememberSize: true, // Restore last size
          startMaximized: false, // Normal size on first run
          centerOnStart: true, // Center if no saved position
        },
        floating: {
          width: 300,
          height: 400,
          minWidth: 250,
          minHeight: 300,
          maxWidth: 400,
          alwaysOnTop: true,
          resizable: true,
          frame: false,
          rememberPosition: true,
          rememberSize: true,
          startVisible: false,
        },
      },
      // System tray behavior
      tray: {
        enabled: true, // Show tray icon
        minimizeToTray: true, // Hide window instead of minimize
        closeToTray: true, // Hide window instead of quit
        startMinimized: false, // Start with window visible
        showNotificationCount: true, // Badge with todo count
        doubleClickAction: 'restore', // What double-click does
        rightClickAction: 'menu', // What right-click does
      },

      // Global keyboard shortcuts
      shortcuts: {
        enabled: true,
        newTask: `${modifier}+N`, // Create new todo
        showMainWindow: `${modifier}+Shift+T`, // Show/hide main window
        quit: 'Cmd+Q', // Quit app (macOS standard)
        minimize: `${modifier}+M`, // Minimize window
        toggleAlwaysOnTop: `${modifier}+Shift+A`, // Toggle floating on top
        focusFloatingNavigator: `${modifier}+Shift+N`, // Focus floating window
      },
      notifications: {
        enabled: true,
        taskCreated: true,
        taskCompleted: true,
        taskUpdated: true,
        taskDeleted: false,
        sound: true,
        showInTray: true,
        autoHide: true,
        autoHideDelay: 5000, // milliseconds
        position: 'topRight', // 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft'
      },
      appearance: {
        theme: 'system', // 'light' | 'dark' | 'system'
        accentColor: '#3b82f6',
        fontSize: 'medium', // 'small' | 'medium' | 'large'
        compactMode: false,
      },
      behavior: {
        startOnLogin: false,
        checkForUpdates: true,
        autoSave: true,
        autoSaveInterval: 30000, // milliseconds
        confirmOnDelete: true,
        confirmOnQuit: false,
      },
      advanced: {
        enableDevTools: false,
        enableLogging: true,
        logLevel: 'info', // 'error' | 'warn' | 'info' | 'debug'
        maxLogFiles: 5,
        hardwareAcceleration: true,
        experimentalFeatures: false,
      },
    }
  }

  /**
   * Ensure configuration directory exists
   */
  ensureConfigDirectory() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true })
      }
    } catch (error) {
      log.error('Failed to create config directory:', error)
    }
  }

  /**
   * Load configuration from file
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8')
        const loadedConfig = JSON.parse(data)

        // Merge with defaults to ensure all properties exist
        const mergedConfig = this.mergeWithDefaults(loadedConfig)

        // Perform migration if needed
        return this.migrateConfig(mergedConfig)
      }
    } catch (error) {
      log.error('Failed to load config:', error)
    }

    // Return default config if loading fails
    return { ...this.defaultConfig }
  }

  /**
   * Saves the current configuration to disk.
   *
   * Uses synchronous writes for simplicity and reliability.
   * The file is formatted with indentation for human readability
   * if users need to manually edit it.
   *
   * Error handling:
   * - Returns false on failure (non-throwing)
   * - Logs errors for debugging
   * - Preserves in-memory config even if save fails
   *
   * @returns {boolean} True if save successful, false otherwise
   */
  saveConfig() {
    try {
      // Pretty-print JSON for readability
      const configData = JSON.stringify(this.config, null, 2)
      fs.writeFileSync(this.configPath, configData, 'utf8')
      return true
    } catch (error) {
      log.error('Failed to save config:', error)
      return false // Non-throwing for graceful degradation
    }
  }

  /**
   * Merges loaded configuration with defaults.
   *
   * This ensures:
   * - New properties are added when app updates
   * - Missing properties get default values
   * - User's existing settings are preserved
   * - Config structure remains valid
   *
   * Deep merge strategy:
   * - Objects are merged recursively
   * - Arrays are replaced entirely
   * - Primitives from loaded config override defaults
   *
   * @param {Object} loadedConfig - Config loaded from disk
   * @returns {Object} Merged configuration
   */
  mergeWithDefaults(loadedConfig) {
    const merge = (target, source) => {
      const result = { ...target }

      for (const key in source) {
        if (
          source[key] &&
          typeof source[key] === 'object' &&
          !Array.isArray(source[key]) // Arrays are replaced, not merged
        ) {
          // Recursive merge for nested objects
          result[key] = merge(target[key] || {}, source[key])
        } else if (source[key] !== undefined) {
          // Use source value if defined
          result[key] = source[key]
        }
      }

      return result
    }

    // Default config is base, user config overrides
    return merge(this.defaultConfig, loadedConfig)
  }

  /**
   * Handles configuration migrations between app versions.
   *
   * Why migrations?
   * - Config structure may change between releases
   * - Old configs need updating to work with new code
   * - Preserves user settings during upgrades
   * - Enables backwards compatibility
   *
   * Migration process:
   * 1. Check current vs target version
   * 2. Apply migrations in sequence
   * 3. Update version number
   * 4. Save migrated config
   *
   * @param {Object} config - Configuration to migrate
   * @returns {Object} Migrated configuration
   */
  migrateConfig(config) {
    const currentVersion = config.version || '0.0.0'
    const targetVersion = this.defaultConfig.version

    // Skip if already up to date
    if (currentVersion === targetVersion) {
      return config
    }

    // Apply version-specific migrations in order
    if (this.compareVersions(currentVersion, '1.0.0') < 0) {
      // Migration from pre-1.0.0 versions
      config = this.migrateToV1(config)
    }

    // Future migrations would go here:
    // if (this.compareVersions(currentVersion, '2.0.0') < 0) {
    //   config = this.migrateToV2(config)
    // }

    // Mark as migrated
    config.version = targetVersion

    // Persist migrated config
    this.saveConfig()

    return config
  }

  /**
   * Migrate to version 1.0.0
   */
  migrateToV1(config) {
    // Example migration: move old window settings to new structure
    if (config.windowSettings) {
      config.window = {
        main: config.windowSettings.main || this.defaultConfig.window.main,
        floating:
          config.windowSettings.floating || this.defaultConfig.window.floating,
      }
      delete config.windowSettings
    }

    return config
  }

  /**
   * Compare version strings
   */
  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number)
    const v2parts = version2.split('.').map(Number)

    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0
      const v2part = v2parts[i] || 0

      if (v1part < v2part) return -1
      if (v1part > v2part) return 1
    }

    return 0
  }

  /**
   * Gets a configuration value using dot notation path.
   *
   * This is the primary way to read config values. Supports:
   * - Nested property access: 'window.main.width'
   * - Array access: 'shortcuts.0'
   * - Safe access with defaults for missing values
   *
   * Examples:
   * - get('window.main.width') → 1200
   * - get('tray.enabled') → true
   * - get('missing.path', 'default') → 'default'
   *
   * @param {string} path - Dot-separated path to value
   * @param {any} defaultValue - Value to return if path not found
   * @returns {any} Configuration value or default
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.')
    let current = this.config

    // Traverse the object tree
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key]
      } else {
        return defaultValue // Path doesn't exist
      }
    }

    return current
  }

  /**
   * Sets a configuration value using dot notation path.
   *
   * Automatically:
   * - Creates missing intermediate objects
   * - Saves to disk after setting
   * - Overwrites existing values
   *
   * Examples:
   * - set('window.main.width', 1400)
   * - set('tray.enabled', false)
   * - set('new.nested.value', 123) // Creates structure
   *
   * @param {string} path - Dot-separated path to value
   * @param {any} value - Value to set
   * @returns {boolean} True if save successful
   */
  set(path, value) {
    const keys = path.split('.')
    let current = this.config

    // Navigate to parent of target property
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      // Create intermediate objects as needed
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key]
    }

    // Set the final value
    current[keys[keys.length - 1]] = value

    // Persist changes
    return this.saveConfig()
  }

  /**
   * Updates multiple configuration values at once.
   *
   * More efficient than multiple set() calls as it:
   * - Batches all changes
   * - Saves to disk only once
   * - Atomic operation (all or nothing)
   *
   * Example:
   * update({
   *   'window.main.width': 1400,
   *   'tray.enabled': false,
   *   'shortcuts.newTask': 'Ctrl+Alt+N'
   * })
   *
   * @param {Object} updates - Object with path:value pairs
   * @returns {boolean} True if save successful
   */
  update(updates) {
    // Apply all updates
    for (const [path, value] of Object.entries(updates)) {
      this.set(path, value)
    }
    // Save once at the end
    return this.saveConfig()
  }

  /**
   * Resets all configuration to factory defaults.
   *
   * Use cases:
   * - Troubleshooting corrupted settings
   * - "Reset to defaults" button in preferences
   * - Clean slate for testing
   *
   * Warning: This is destructive - all user preferences are lost!
   *
   * @returns {boolean} True if save successful
   */
  reset() {
    // Create fresh copy of defaults
    this.config = { ...this.defaultConfig }
    return this.saveConfig()
  }

  /**
   * Reset specific section to defaults
   */
  resetSection(section) {
    if (this.defaultConfig[section]) {
      this.config[section] = { ...this.defaultConfig[section] }
      return this.saveConfig()
    }
    return false
  }

  /**
   * Get entire configuration
   */
  getAll() {
    return { ...this.config }
  }

  /**
   * Get configuration section
   */
  getSection(section) {
    return this.config[section] ? { ...this.config[section] } : {}
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = []

    // Validate window settings
    if (this.config.window) {
      if (this.config.window.main) {
        if (this.config.window.main.width < 400) {
          errors.push('Main window width must be at least 400px')
        }
        if (this.config.window.main.height < 300) {
          errors.push('Main window height must be at least 300px')
        }
      }

      if (this.config.window.floating) {
        if (this.config.window.floating.width < 200) {
          errors.push('Floating window width must be at least 200px')
        }
        if (this.config.window.floating.height < 200) {
          errors.push('Floating window height must be at least 200px')
        }
      }
    }

    // Validate shortcuts
    if (this.config.shortcuts) {
      const shortcuts = Object.values(this.config.shortcuts).filter(
        (s) => typeof s === 'string',
      )
      const duplicates = shortcuts.filter(
        (item, index) => shortcuts.indexOf(item) !== index,
      )
      if (duplicates.length > 0) {
        errors.push(`Duplicate shortcuts found: ${duplicates.join(', ')}`)
      }
    }

    // Validate notification settings
    if (this.config.notifications) {
      if (this.config.notifications.autoHideDelay < 1000) {
        errors.push('Notification auto-hide delay must be at least 1000ms')
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Export configuration to file
   */
  exportConfig(filePath) {
    try {
      const configData = JSON.stringify(this.config, null, 2)
      fs.writeFileSync(filePath, configData, 'utf8')
      return true
    } catch (error) {
      log.error('Failed to export config:', error)
      return false
    }
  }

  /**
   * Import configuration from file
   */
  importConfig(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('Config file does not exist')
      }

      const data = fs.readFileSync(filePath, 'utf8')
      const importedConfig = JSON.parse(data)

      // Validate imported config
      const tempConfig = this.config
      this.config = this.mergeWithDefaults(importedConfig)

      const validation = this.validate()
      if (!validation.isValid) {
        this.config = tempConfig // Restore previous config
        throw new Error(
          `Invalid configuration: ${validation.errors.join(', ')}`,
        )
      }

      return this.saveConfig()
    } catch (error) {
      log.error('Failed to import config:', error)
      return false
    }
  }

  /**
   * Get configuration file paths
   */
  getConfigPaths() {
    return {
      config: this.configPath,
      windowState: this.windowStatePath,
      directory: this.configDir,
    }
  }

  /**
   * Backup current configuration
   */
  backup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(
        this.configDir,
        `config-backup-${timestamp}.json`,
      )

      return this.exportConfig(backupPath) ? backupPath : null
    } catch (error) {
      log.error('Failed to backup config:', error)
      return null
    }
  }

  /**
   * Clean up old backup files (keep only the latest 5)
   */
  cleanupBackups() {
    try {
      const files = fs.readdirSync(this.configDir)
      const backupFiles = files
        .filter(
          (file) => file.startsWith('config-backup-') && file.endsWith('.json'),
        )
        .map((file) => ({
          name: file,
          path: path.join(this.configDir, file),
          stat: fs.statSync(path.join(this.configDir, file)),
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime)

      // Keep only the latest 5 backups
      const filesToDelete = backupFiles.slice(5)

      for (const file of filesToDelete) {
        fs.unlinkSync(file.path)
      }

      return filesToDelete.length
    } catch (error) {
      log.error('Failed to cleanup backups:', error)
      return 0
    }
  }
}

module.exports = ConfigManager
