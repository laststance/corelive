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
import {
  DEFAULT_STARTUP_WINDOW_CONFIG,
  type StartupWindowConfig,
} from './types/ipc'
import { isPlainObject } from './utils/isPlainObject'

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
  /** Keep the floating navigator visible while macOS Spaces change. */
  visibleOnAllWorkspaces: boolean
  alwaysOnTop: boolean
  resizable: boolean
  frame: boolean
  rememberPosition: boolean
  rememberSize: boolean
  /**
   * @deprecated Superseded by `behavior.startup.showFloating`. Retained only so
   * `migrateFloatingStartVisible` can read + delete it from pre-feature configs;
   * never written to new configs. Remove once no live config.json carries it.
   */
  startVisible?: boolean
}

/** Window configuration section */
interface WindowConfig {
  main: MainWindowConfig
  floating: FloatingWindowConfig
}

/**
 * BrainDump window/feature configuration.
 *
 * Persisted locally per-device (D1 decision in BrainDump plan). `notes` is a
 * `Record<categoryId-as-string, text>` because JSON object keys must be
 * strings — the renderer stringifies the numeric categoryId before reading.
 */
export interface BrainDumpConfig {
  width: number
  height: number
  /** Keep the BrainDump panel visible while macOS Spaces change. */
  visibleOnAllWorkspaces: boolean
  /** Window opacity, clamped 0.30–1.00 to keep the window discoverable. */
  opacity: number
  /** When true, BrainDump mirrors FloatingNavigator's selected category. */
  syncMode: boolean
  /** Global accelerator string; empty disables the shortcut. */
  shortcut: string
  /**
   * Last category id BrainDump showed (used as the source of truth across
   * sync flips so the user never loses their selection).
   */
  lastCategoryId: number | null
  /** Per-category note text, keyed by categoryId stringified. */
  notes: Record<string, string>
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

/**
 * Appearance configuration.
 *
 * NOTE: theme + accent color are NOT here. The web app owns theme entirely via
 * localStorage (`storageKey="corelive-theme"`, applied as `data-theme`); the
 * Electron shell only loads the remote site, so a native `appearance.theme` /
 * `accentColor` had zero readers and was removed (would only drift from the
 * real, web-persisted value). Keep appearance config web-localStorage-owned.
 */
interface AppearanceConfig {
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
  /** Which window(s) appear at Electron launch (≥1 must be true). */
  startup: StartupWindowConfig
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
  braindump: BrainDumpConfig
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

    // A hand-edited config.json (or a pre-startup-feature file) can carry an
    // all-false startup block; normalize before any window code reads it.
    this.ensureAtLeastOneStartupWindow()
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
          visibleOnAllWorkspaces: false,
          alwaysOnTop: true,
          resizable: true,
          frame: false,
          rememberPosition: true,
          rememberSize: true,
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

      // theme/accentColor intentionally absent — the web app owns theme via
      // localStorage (see AppearanceConfig note); native shell never reads it.
      appearance: {
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
        // Default: only the main window opens at launch (showMain=true).
        startup: { ...DEFAULT_STARTUP_WINDOW_CONFIG },
      },

      advanced: {
        enableDevTools: false,
        enableLogging: true,
        logLevel: 'info',
        maxLogFiles: 5,
        hardwareAcceleration: true,
        experimentalFeatures: false,
      },

      braindump: {
        width: 480,
        height: 640,
        visibleOnAllWorkspaces: false,
        opacity: 0.95,
        syncMode: true,
        shortcut: '',
        lastCategoryId: null,
        notes: {},
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

        // Migrate legacy fields on the RAW config — must run before merge,
        // which would otherwise fill `showFloating` with its default and
        // erase the signal that it was never explicitly set.
        this.pruneLegacyAppearanceKeys(loadedConfig)
        this.migrateFloatingStartVisible(loadedConfig)

        // Merge with defaults to ensure all properties exist
        const mergedConfig = this.mergeWithDefaults(loadedConfig)

        // Perform migration if needed
        return this.migrateConfig(mergedConfig)
      }
    } catch (error) {
      log.error('Failed to load config:', error)
    }

    // Return default config if loading fails — deep clone so the runtime copy
    // never aliases nested defaults like `braindump.notes`.
    return structuredClone(this.defaultConfig)
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

    // Deep-clone the defaults before merging so the merged result never
    // aliases nested objects (e.g., `braindump.notes` shared with the
    // factory defaults — mutating it would silently pollute reset()).
    return merge(
      structuredClone(this.defaultConfig) as unknown as Record<string, unknown>,
      loadedConfig as unknown as Record<string, unknown>,
    ) as AppConfig
  }

  /**
   * One-time migration of the legacy `window.floating.startVisible` flag into
   * the new `behavior.startup.showFloating` field. Runs on the RAW loaded
   * config BEFORE default-merge so an unset `showFloating` is detectable
   * (merge would otherwise fill it with the default `false` and erase intent).
   * Idempotent: migrates only when `showFloating` is still unset, and always
   * drops the legacy key afterward so it never lingers once superseded.
   *
   * @param raw - Config parsed from disk, before merge with defaults.
   * @returns void — sets `raw.behavior.startup.showFloating` and deletes the legacy flag in place.
   * @example
   * // disk: { window: { floating: { startVisible: true } } }  (no behavior.startup)
   * migrateFloatingStartVisible(raw) // => raw.behavior.startup.showFloating === true; startVisible removed
   */
  /**
   * Strips the removed `appearance.theme` / `appearance.accentColor` keys (T9)
   * out of a persisted/imported config before merge. `mergeWithDefaults` copies
   * every unknown source key verbatim, so without this an older `config.json`
   * would carry the dead native theme fields indefinitely and never converge to
   * the new {fontSize, compactMode} shape (theme is web-localStorage-owned).
   * Runs on the RAW config so the keys are gone before they reach the merge.
   *
   * @param raw - Config parsed from disk, before merge with defaults.
   * @returns void — deletes the legacy `appearance` keys in place (no-op if absent or non-object).
   * @example
   * // disk: { appearance: { fontSize: 'large', theme: 'dark', accentColor: '#f00' } }
   * pruneLegacyAppearanceKeys(raw) // => raw.appearance === { fontSize: 'large' }
   */
  private pruneLegacyAppearanceKeys(raw: Partial<AppConfig>): void {
    // A hand-edited config may have a corrupt non-object `appearance`; only
    // touch a real object so deleting keys can't throw and abort the load.
    if (!isPlainObject(raw.appearance)) return
    const appearance = raw.appearance as Record<string, unknown>
    delete appearance.theme
    delete appearance.accentColor
  }

  private migrateFloatingStartVisible(raw: Partial<AppConfig>): void {
    const floating = raw.window?.floating
    // Nothing legacy to migrate or clean up.
    if (!floating || floating.startVisible === undefined) return

    // Partial<AppConfig> only marks top-level keys optional; nested objects are
    // typed as fully-required even though raw JSON may omit fields. Treat the
    // startup block as genuinely partial so the "unset" check is meaningful.
    const startup = raw.behavior?.startup as
      | Partial<StartupWindowConfig>
      | undefined
    const showFloatingAlreadySet = startup?.showFloating !== undefined

    // Carry the legacy flag over only when the new field hasn't been set yet.
    if (floating.startVisible === true && !showFloatingAlreadySet) {
      // `raw.behavior` may be a corrupt non-object (string/array) from a
      // hand-edited config; only reuse it when it is a real object. Assigning
      // `.startup` to a string/array primitive throws in strict mode, which
      // would abort loadConfig into a FULL default reset (losing unrelated
      // settings like window sizes) instead of just repairing behavior.
      const behavior = isPlainObject(raw.behavior)
        ? (raw.behavior as BehaviorConfig)
        : ({} as BehaviorConfig)
      // Partial startup is fine here — mergeWithDefaults fills showMain/showBraindump.
      behavior.startup = {
        ...(startup ?? {}),
        showFloating: true,
      } as StartupWindowConfig
      raw.behavior = behavior
    }

    // Drop the superseded key regardless, so a migrated config stops carrying it.
    delete floating.startVisible
  }

  /**
   * Enforces the startup invariant (≥1 window true) on the in-memory config.
   * The safety backstop for TENSION2: lives in ConfigManager (not the IPC
   * handler) so a generic `set('behavior.startup.*')` or a hand-edited
   * config.json can never persist an all-false state that boots zero windows.
   * Repairs a non-object `behavior`/`startup` (corrupt/hand-edited JSON) back to
   * defaults instead of bailing — `main.ts` reads `getSection('behavior').startup`
   * synchronously at boot, so a non-object here would otherwise throw or boot a
   * blank desktop. Then coerces all three fields to real booleans and falls back
   * to showMain. In-memory only; the corrupt file self-heals on the next config
   * write (set/update/import all call this then saveConfig).
   *
   * @returns void — mutates `this.config.behavior(.startup)` in place.
   * @example
   * // this.config.behavior.startup = { showMain: false, showBraindump: false, showFloating: false }
   * ensureAtLeastOneStartupWindow() // => showMain becomes true
   * @example
   * // this.config.behavior = 'corrupt'  (hand-edited config.json)
   * ensureAtLeastOneStartupWindow() // => behavior reset to defaults (showMain: true)
   */
  private ensureAtLeastOneStartupWindow(): void {
    const behavior = this.config.behavior
    // A hand-edited or corrupted config.json can make `behavior` a non-object
    // (string, null) OR an array — and `typeof [] === 'object'`, so a bare
    // typeof check would let `behavior: []` through and later set a lost expando
    // on the array. isPlainObject rejects arrays/null too. Reset to the factory
    // default rather than bailing so the boot-time `getSection('behavior').startup`
    // read can never throw or read garbage. The default satisfies the invariant.
    if (!isPlainObject(behavior)) {
      log.warn(
        'Startup invariant: behavior config was not a plain object; resetting to defaults',
      )
      this.config.behavior = structuredClone(this.defaultConfig.behavior)
      return
    }
    let startup = behavior.startup
    // Same guard one level down: a non-plain-object `startup` block (including an
    // array, which the boolean coercion below would silently mangle) gets reset.
    if (!isPlainObject(startup)) {
      log.warn(
        'Startup invariant: behavior.startup was not a plain object; resetting to defaults',
      )
      startup = structuredClone(this.defaultConfig.behavior.startup)
      behavior.startup = startup
      return
    }

    // Coerce to strict booleans. A hand-edited config.json can carry a string
    // like "false", and `Boolean("false") === true` would wrongly arm a window.
    // `=== true` accepts only a real boolean true; any other value (string,
    // number, undefined) becomes false and is caught by the >=1 invariant below.
    startup.showMain = startup.showMain === true
    startup.showBraindump = startup.showBraindump === true
    startup.showFloating = startup.showFloating === true

    if (!startup.showMain && !startup.showBraindump && !startup.showFloating) {
      startup.showMain = true
    }
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
    // Backstop the startup invariant: a generic set('behavior.startup.*')
    // must never persist an all-false (zero-window) state.
    this.ensureAtLeastOneStartupWindow()
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
    // Backstop the startup invariant before the single batched disk write.
    this.ensureAtLeastOneStartupWindow()
    // Single disk write after all updates
    return this.saveConfig()
  }

  /**
   * Resets all configuration to factory defaults.
   *
   * @returns True if save successful
   */
  reset(): boolean {
    // Deep clone — a shallow spread keeps nested objects (e.g.,
    // `braindump.notes`) aliased to the factory defaults, so subsequent
    // writes would silently mutate the source-of-truth defaults.
    this.config = structuredClone(this.defaultConfig)
    return this.saveConfig()
  }

  /**
   * Reset specific section to defaults.
   */
  resetSection(section: keyof AppConfig): boolean {
    const defaultSection = this.defaultConfig[section]
    if (defaultSection && typeof defaultSection === 'object') {
      this.config[section] = structuredClone(
        defaultSection,
      ) as AppConfig[typeof section]
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

      // Apply the same legacy migration as load — an imported file may predate
      // the startup feature (or carry removed appearance keys) — on the RAW
      // config before merge.
      this.pruneLegacyAppearanceKeys(importedConfig)
      this.migrateFloatingStartVisible(importedConfig)

      // Validate imported config
      const tempConfig = this.config
      this.config = this.mergeWithDefaults(importedConfig)

      // An imported file can carry an all-false startup block; normalize it.
      this.ensureAtLeastOneStartupWindow()

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
