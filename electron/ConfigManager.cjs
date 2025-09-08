const fs = require('fs')
const path = require('path')

const { app } = require('electron')

const { log } = require('../src/lib/logger.cjs')

class ConfigManager {
  constructor() {
    // Use app.getPath('userData') for cross-platform user data directory
    this.configDir = app.getPath('userData')
    this.configPath = path.join(this.configDir, 'config.json')
    this.windowStatePath = path.join(this.configDir, 'window-state.json')

    // Ensure config directory exists
    this.ensureConfigDirectory()

    // Default configuration
    this.defaultConfig = this.getDefaultConfig()

    // Current configuration
    this.config = this.loadConfig()
  }

  /**
   * Get default configuration structure
   */
  getDefaultConfig() {
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Cmd' : 'Ctrl'

    return {
      version: '1.0.0',
      window: {
        main: {
          width: 1200,
          height: 800,
          minWidth: 800,
          minHeight: 600,
          rememberPosition: true,
          rememberSize: true,
          startMaximized: false,
          centerOnStart: true,
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
      tray: {
        enabled: true,
        minimizeToTray: true,
        closeToTray: true,
        startMinimized: false,
        showNotificationCount: true,
        doubleClickAction: 'restore', // 'restore' | 'toggle' | 'none'
        rightClickAction: 'menu', // 'menu' | 'restore' | 'none'
      },
      shortcuts: {
        enabled: true,
        newTask: `${modifier}+N`,
        search: `${modifier}+F`,
        toggleFloatingNavigator: `${modifier}+Shift+F`,
        showMainWindow: `${modifier}+Shift+T`,
        quit: isMac ? 'Cmd+Q' : 'Ctrl+Q',
        minimize: `${modifier}+M`,
        toggleAlwaysOnTop: `${modifier}+Shift+A`,
        focusFloatingNavigator: `${modifier}+Shift+N`,
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
   * Save configuration to file
   */
  saveConfig() {
    try {
      const configData = JSON.stringify(this.config, null, 2)
      fs.writeFileSync(this.configPath, configData, 'utf8')
      return true
    } catch (error) {
      log.error('Failed to save config:', error)
      return false
    }
  }

  /**
   * Merge loaded config with defaults to ensure all properties exist
   */
  mergeWithDefaults(loadedConfig) {
    const merge = (target, source) => {
      const result = { ...target }

      for (const key in source) {
        if (
          source[key] &&
          typeof source[key] === 'object' &&
          !Array.isArray(source[key])
        ) {
          result[key] = merge(target[key] || {}, source[key])
        } else if (source[key] !== undefined) {
          result[key] = source[key]
        }
      }

      return result
    }

    return merge(this.defaultConfig, loadedConfig)
  }

  /**
   * Migrate configuration between versions
   */
  migrateConfig(config) {
    const currentVersion = config.version || '0.0.0'
    const targetVersion = this.defaultConfig.version

    if (currentVersion === targetVersion) {
      return config
    }

    // Perform version-specific migrations here
    // Example migration logic:
    if (this.compareVersions(currentVersion, '1.0.0') < 0) {
      // Migration from pre-1.0.0 versions
      config = this.migrateToV1(config)
    }

    // Update version
    config.version = targetVersion

    // Save migrated config
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
   * Get configuration value by path
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.')
    let current = this.config

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key]
      } else {
        return defaultValue
      }
    }

    return current
  }

  /**
   * Set configuration value by path
   */
  set(path, value) {
    const keys = path.split('.')
    let current = this.config

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key]
    }

    current[keys[keys.length - 1]] = value
    return this.saveConfig()
  }

  /**
   * Update multiple configuration values
   */
  update(updates) {
    for (const [path, value] of Object.entries(updates)) {
      this.set(path, value)
    }
    return this.saveConfig()
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
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
