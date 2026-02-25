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

import fs from 'fs'
import path from 'path'

import { app } from 'electron'

import { log } from './logger'

// ============================================================================
// Type Definitions
// ============================================================================

/** Main window configuration */
interface MainWindowConfig {
  width: number
  height: number
  minWidth: number
  minHeight: number
  rememberPosition: boolean
  rememberSize: boolean
  startMaximized: boolean
  centerOnStart: boolean
}

/** Floating window configuration */
interface FloatingWindowConfig {
  width: number
  height: number
  minWidth: number
  minHeight: number
  maxWidth: number
  alwaysOnTop: boolean
  resizable: boolean
  frame: boolean
  rememberPosition: boolean
  rememberSize: boolean
  startVisible: boolean
}

/** Window configuration section */
interface WindowConfig {
  main: MainWindowConfig
  floating: FloatingWindowConfig
}

/** System tray configuration */
interface TrayConfig {
  enabled: boolean
  minimizeToTray: boolean
  closeToTray: boolean
  startMinimized: boolean
  showNotificationCount: boolean
  doubleClickAction: 'restore' | 'toggle'
  rightClickAction: 'menu' | 'restore'
}

/** Keyboard shortcuts configuration */
interface ShortcutsConfig {
  enabled: boolean
  newTask: string
  quit: string
  minimize: string
  toggleAlwaysOnTop: string
  focusFloatingNavigator: string
}

/** Notifications configuration */
interface NotificationsConfig {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
  showInTray: boolean
  autoHide: boolean
  autoHideDelay: number
  position: 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft'
}

/** Appearance configuration */
interface AppearanceConfig {
  theme: 'light' | 'dark' | 'system'
  accentColor: string
  fontSize: 'small' | 'medium' | 'large'
  compactMode: boolean
}

/** Behavior configuration */
interface BehaviorConfig {
  startOnLogin: boolean
  checkForUpdates: boolean
  autoSave: boolean
  autoSaveInterval: number
  confirmOnDelete: boolean
  confirmOnQuit: boolean
}

/** Advanced configuration */
interface AdvancedConfig {
  enableDevTools: boolean
  enableLogging: boolean
  logLevel: 'error' | 'warn' | 'info' | 'debug'
  maxLogFiles: number
  hardwareAcceleration: boolean
  experimentalFeatures: boolean
}

/** Complete application configuration */
export interface AppConfig {
  version: string
  window: WindowConfig
  tray: TrayConfig
  shortcuts: ShortcutsConfig
  notifications: NotificationsConfig
  appearance: AppearanceConfig
  behavior: BehaviorConfig
  advanced: AdvancedConfig
  [key: string]: unknown
}

/** Validation result */
export interface ConfigValidationResult {
  isValid: boolean
  errors: string[]
}

/** Configuration file paths */
export interface ConfigPaths {
  config: string
  windowState: string
  directory: string
}

// ============================================================================
// Security Constants
// ============================================================================

/** Keys that could be used for prototype pollution attacks */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype']

/**
 * Check if a key is unsafe (could be used for prototype pollution).
 *
 * @param key - Key to check
 * @returns True if the key is unsafe
 */
function isUnsafeKey(key: string): boolean {
  return FORBIDDEN_KEYS.includes(key)
}

// ============================================================================
// Config Manager Class
// ============================================================================

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
 * @example
 * ```typescript
 * const configManager = new ConfigManager()
 *
 * // Get value
 * const width = configManager.get('window.main.width')
 *
 * // Set value
 * configManager.set('window.main.width', 1400)
 * ```
 */
export class ConfigManager {
  /** Platform-specific configuration directory */
  private configDir: string

  /** Path to main config file */
  private configPath: string

  /** Path to window state file */
  private windowStatePath: string

  /** Default configuration values */
  private defaultConfig: AppConfig

  /** Current configuration */
  private config: AppConfig

  constructor() {
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
   * @returns Default configuration object
   */
  getDefaultConfig(): AppConfig {
    const modifier = 'CommandOrControl'

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
        doubleClickAction: 'restore',
        rightClickAction: 'menu',
      },

      shortcuts: {
        enabled: true,
        newTask: `${modifier}+N`,
        quit: `${modifier}+Q`,
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
        autoHideDelay: 5000,
        position: 'topRight',
      },

      appearance: {
        theme: 'system',
        accentColor: '#3b82f6',
        fontSize: 'medium',
        compactMode: false,
      },

      behavior: {
        startOnLogin: false,
        checkForUpdates: true,
        autoSave: true,
        autoSaveInterval: 30000,
        confirmOnDelete: true,
        confirmOnQuit: false,
      },

      advanced: {
        enableDevTools: false,
        enableLogging: true,
        logLevel: 'info',
        maxLogFiles: 5,
        hardwareAcceleration: true,
        experimentalFeatures: false,
      },
    }
  }

  /**
   * Ensure configuration directory exists.
   */
  private ensureConfigDirectory(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true })
      }
    } catch (error) {
      log.error('Failed to create config directory:', error)
    }
  }

  /**
   * Load configuration from file.
   */
  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8')
        const loadedConfig = JSON.parse(data) as Partial<AppConfig>

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
   * Saves the current configuration to disk atomically.
   *
   * Uses write-then-rename pattern to prevent corruption on crash.
   *
   * @returns True if save successful, false otherwise
   */
  saveConfig(): boolean {
    const tempPath = `${this.configPath}.tmp`
    try {
      const configData = JSON.stringify(this.config, null, 2)
      // Write to temp file first
      fs.writeFileSync(tempPath, configData, 'utf8')
      // Atomic rename (safe on POSIX, near-atomic on Windows)
      fs.renameSync(tempPath, this.configPath)
      return true
    } catch (error) {
      log.error('Failed to save config:', error)
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath)
        }
      } catch {
        // Ignore cleanup errors
      }
      return false
    }
  }

  /**
   * Merges loaded configuration with defaults.
   *
   * @param loadedConfig - Config loaded from disk
   * @returns Merged configuration
   */
  private mergeWithDefaults(loadedConfig: Partial<AppConfig>): AppConfig {
    const merge = (
      target: Record<string, unknown>,
      source: Record<string, unknown>,
    ): Record<string, unknown> => {
      const result = { ...target }

      for (const [key, sourceValue] of Object.entries(source)) {
        // Block prototype pollution attacks
        if (isUnsafeKey(key)) {
          continue
        }

        const targetValue = target[key]

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue)
        ) {
          result[key] = merge(
            (targetValue as Record<string, unknown>) ?? {},
            sourceValue as Record<string, unknown>,
          )
        } else if (sourceValue !== undefined) {
          result[key] = sourceValue
        }
      }

      return result
    }

    return merge(
      this.defaultConfig as unknown as Record<string, unknown>,
      loadedConfig as unknown as Record<string, unknown>,
    ) as AppConfig
  }

  /**
   * Handles configuration migrations between app versions.
   *
   * @param config - Configuration to migrate
   * @returns Migrated configuration
   */
  private migrateConfig(config: AppConfig): AppConfig {
    const currentVersion = config.version ?? '0.0.0'
    const targetVersion = this.defaultConfig.version

    if (currentVersion === targetVersion) {
      return config
    }

    if (this.compareVersions(currentVersion, '1.0.0') < 0) {
      config = this.migrateToV1(config)
    }

    config.version = targetVersion
    this.saveConfig()

    return config
  }

  /**
   * Migrate to version 1.0.0.
   */
  private migrateToV1(config: AppConfig): AppConfig {
    // Handle legacy windowSettings property
    const legacyConfig = config as AppConfig & {
      windowSettings?: {
        main?: MainWindowConfig
        floating?: FloatingWindowConfig
      }
    }

    if (legacyConfig.windowSettings) {
      config.window = {
        main:
          legacyConfig.windowSettings.main ?? this.defaultConfig.window.main,
        floating:
          legacyConfig.windowSettings.floating ??
          this.defaultConfig.window.floating,
      }
      delete legacyConfig.windowSettings
    }

    return config
  }

  /**
   * Compare version strings.
   */
  private compareVersions(version1: string, version2: string): number {
    const v1parts = version1.split('.').map(Number)
    const v2parts = version2.split('.').map(Number)

    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] ?? 0
      const v2part = v2parts[i] ?? 0

      if (v1part < v2part) return -1
      if (v1part > v2part) return 1
    }

    return 0
  }

  /**
   * Gets a configuration value using dot notation path.
   *
   * @param configPath - Dot-separated path to value
   * @param defaultValue - Value to return if path not found
   * @returns Configuration value or default
   *
   * @example
   * ```typescript
   * configManager.get('window.main.width') // → 1200
   * configManager.get('missing.path', 'default') // → 'default'
   * ```
   */
  get<T = unknown>(configPath: string, defaultValue?: T): T {
    const keys = configPath.split('.')
    let current: unknown = this.config

    for (const key of keys) {
      // Block prototype pollution attacks
      if (isUnsafeKey(key)) {
        return defaultValue as T
      }

      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key]
      } else {
        return defaultValue as T
      }
    }

    return current as T
  }

  /**
   * Sets a configuration value using dot notation path.
   *
   * @param configPath - Dot-separated path to value
   * @param value - Value to set
   * @returns True if save successful
   *
   * @example
   * ```typescript
   * configManager.set('window.main.width', 1400)
   * ```
   */
  set(configPath: string, value: unknown): boolean {
    const keys = configPath.split('.')
    let current: Record<string, unknown> = this.config as unknown as Record<
      string,
      unknown
    >

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!
      // Block prototype pollution attacks
      if (isUnsafeKey(key)) {
        return false
      }
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key] as Record<string, unknown>
    }

    const lastKey = keys[keys.length - 1]!
    // Block prototype pollution attacks on the final key
    if (isUnsafeKey(lastKey)) {
      return false
    }
    current[lastKey] = value
    return this.saveConfig()
  }

  /**
   * Updates multiple configuration values at once.
   * Uses a batched approach to avoid N+1 disk writes.
   *
   * @param updates - Object with path:value pairs
   * @returns True if save successful
   */
  update(updates: Record<string, unknown>): boolean {
    for (const [configPath, value] of Object.entries(updates)) {
      // Set value in memory without saving to disk
      const keys = configPath.split('.')
      let current: Record<string, unknown> = this.config as unknown as Record<
        string,
        unknown
      >

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]!
        // Block prototype pollution attacks
        if (isUnsafeKey(key)) {
          continue
        }
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {}
        }
        current = current[key] as Record<string, unknown>
      }

      const lastKey = keys[keys.length - 1]!
      // Block prototype pollution attacks on the final key
      if (!isUnsafeKey(lastKey)) {
        current[lastKey] = value
      }
    }
    // Single disk write after all updates
    return this.saveConfig()
  }

  /**
   * Resets all configuration to factory defaults.
   *
   * @returns True if save successful
   */
  reset(): boolean {
    this.config = { ...this.defaultConfig }
    return this.saveConfig()
  }

  /**
   * Reset specific section to defaults.
   */
  resetSection(section: keyof AppConfig): boolean {
    const defaultSection = this.defaultConfig[section]
    if (defaultSection && typeof defaultSection === 'object') {
      this.config[section] = { ...defaultSection } as AppConfig[typeof section]
      return this.saveConfig()
    }
    return false
  }

  /**
   * Get entire configuration.
   */
  getAll(): AppConfig {
    return { ...this.config }
  }

  /**
   * Get configuration section.
   */
  getSection<K extends keyof AppConfig>(section: K): AppConfig[K] {
    const sectionValue = this.config[section]
    if (sectionValue && typeof sectionValue === 'object') {
      return { ...sectionValue } as AppConfig[K]
    }
    return sectionValue
  }

  /**
   * Validate configuration.
   */
  validate(): ConfigValidationResult {
    const errors: string[] = []

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
      const shortcutValues = Object.entries(this.config.shortcuts)
        .filter(([, value]) => typeof value === 'string')
        .map(([, value]) => value as string)

      const duplicates = shortcutValues.filter(
        (item, index) => shortcutValues.indexOf(item) !== index,
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
   * Export configuration to file.
   */
  exportConfig(filePath: string): boolean {
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
   * Import configuration from file.
   */
  importConfig(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('Config file does not exist')
      }

      const data = fs.readFileSync(filePath, 'utf8')
      const importedConfig = JSON.parse(data) as Partial<AppConfig>

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
   * Get configuration file paths.
   */
  getConfigPaths(): ConfigPaths {
    return {
      config: this.configPath,
      windowState: this.windowStatePath,
      directory: this.configDir,
    }
  }

  /**
   * Backup current configuration.
   */
  backup(): string | null {
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
   * Clean up old backup files (keep only the latest 5).
   */
  cleanupBackups(): number {
    try {
      const files = fs.readdirSync(this.configDir)
      const backupFiles = files
        .filter(
          (file) => file.startsWith('config-backup-') && file.endsWith('.json'),
        )
        .flatMap((file) => {
          // Handle race condition: file may be deleted between readdirSync and statSync
          const filePath = path.join(this.configDir, file)
          try {
            const stat = fs.statSync(filePath)
            return [{ name: file, path: filePath, stat }]
          } catch {
            // File was likely deleted between listing and stat - skip it
            log.debug(`Skipping backup file (stat failed): ${file}`)
            return []
          }
        })
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())

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

// ============================================================================
// Default Export
// ============================================================================

export default ConfigManager
