/**
 * @fileoverview Configuration Manager for Electron Application
 *
 * Manages all user and application settings with:
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

import {
  DEFAULT_SHORTCUT_OPEN_SOUND_ENABLED,
  DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
  isShortcutOpenSoundSelection,
  SETTINGS_POPOVER_DEFAULT_HEIGHT_PX,
  SETTINGS_POPOVER_DEFAULT_WIDTH_PX,
  type ShortcutOpenSoundSelection,
} from './constants'
import { log } from './logger'
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

/** Window configuration section */
interface WindowConfig {
  main: MainWindowConfig
}

/**
 * LiveEditor window/feature configuration.
 *
 * Persisted locally per-device (D1 decision in LiveEditor plan). `notes` is a
 * `Record<categoryId-as-string, text>` because JSON object keys must be
 * strings — the renderer stringifies the numeric categoryId before reading.
 */
export interface LiveEditorConfig {
  width: number
  height: number
  /** Keep the LiveEditor panel visible while macOS Spaces change. */
  visibleOnAllWorkspaces: boolean
  /** Keep the LiveEditor panel pinned above other windows (default off). */
  alwaysOnTop: boolean
  /** Window opacity, clamped 0.30–1.00 to keep the window discoverable. */
  opacity: number
  /**
   * @deprecated Legacy mirror with no readers — the live LiveEditor toggle keys
   * are `shortcuts.toggleLiveEditor` / `shortcuts.toggleLiveEditorSecondary`.
   * Kept only so existing config.json files keep validating.
   */
  shortcut: string
  /** Per-category note text, keyed by categoryId stringified. */
  notes: Record<string, string>
}

/** Keyboard shortcuts configuration */
interface ShortcutsConfig {
  enabled: boolean
  newTask: string
  quit: string
  minimize: string
  toggleLiveEditor: string
  /** Optional second key for the same LiveEditor toggle; empty disables it. */
  toggleLiveEditorSecondary: string
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
  /** Play a bundled cue after a shortcut actually reveals LiveEditor. */
  shortcutOpenSoundEnabled: boolean
  /** Rotate all cues by default or pin one stable bundled sound identifier. */
  shortcutOpenSoundSelection: ShortcutOpenSoundSelection
  /**
   * macOS: hide the Dock icon + Cmd+Tab entry (`setActivationPolicy('accessory')`).
   * Persisted here (not just renderer localStorage) so the main process can apply
   * it at boot BEFORE any window shows — surviving a cold Start-at-Login restart
   * when the remote renderer (and its ElectronStartupSync) may never load (#112).
   */
  hideAppIcon: boolean
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

/** Persisted size of the Settings popover window (user-resizable). */
export interface SettingsPopoverConfig {
  width: number
  height: number
}

/** Complete application configuration */
export interface AppConfig {
  version: string
  window: WindowConfig
  shortcuts: ShortcutsConfig
  notifications: NotificationsConfig
  appearance: AppearanceConfig
  behavior: BehaviorConfig
  advanced: AdvancedConfig
  liveEditor: LiveEditorConfig
  settingsPopover: SettingsPopoverConfig
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
// Retired Keys
// ============================================================================

/**
 * Config keys retired from config.json, grouped by section. The legacy key
 * strings live ONLY here; {@link ConfigManager.pruneRetiredConfigKeys} deletes
 * them from a raw on-disk/imported config before the merge with defaults.
 */
const RETIRED_CONFIG_KEYS: Readonly<Record<string, readonly string[]>> = {
  // T9: the web app owns theme via localStorage; the native shell never read these.
  appearance: ['theme', 'accentColor'],
  // Floating Navigator retirement (login shell): its window geometry, its
  // shortcuts, the startup-window picker, and LiveEditor's category sync.
  window: ['floating'],
  shortcuts: [
    'toggleFloatingNavigator',
    'focusFloatingNavigator',
    'toggleAlwaysOnTop',
  ],
  behavior: ['startup'],
  liveEditor: ['syncMode', 'lastCategoryId'],
  // Tray section retirement: nothing ever read any of these 7 keys outside
  // this file's own interface + default (verified by grep across the whole
  // codebase, including tests). Listed individually, not as a whole-section
  // drop, since pruneRetiredConfigKeys deletes keys within a section rather
  // than the section itself — an old config.json's `tray: {}` survives empty,
  // same as the existing `window: { main: {} }` precedent above.
  tray: [
    'enabled',
    'minimizeToTray',
    'closeToTray',
    'startMinimized',
    'showNotificationCount',
    'doubleClickAction',
    'rightClickAction',
  ],
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

  /** Whether a raw on-disk rename migration must be persisted after load. */
  private shouldSaveLoadedConfig = false

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

    // Raw migrations run before `this.config` exists, so persist only now.
    if (this.shouldSaveLoadedConfig) {
      this.saveConfig()
    }
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
      },

      shortcuts: {
        enabled: true,
        newTask: `${modifier}+N`,
        quit: `${modifier}+Q`,
        minimize: `${modifier}+M`,
        toggleLiveEditor: 'Alt+Space',
        toggleLiveEditorSecondary: '',
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
        // User-approved desktop exception: shortcut-open feedback starts enabled.
        shortcutOpenSoundEnabled: DEFAULT_SHORTCUT_OPEN_SOUND_ENABLED,
        // Rotation keeps the feedback fresh while avoiding consecutive duplicates.
        shortcutOpenSoundSelection: DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
        // Default OFF (icon shown) — matches the renderer default
        // (DEFAULT_ELECTRON_SETTINGS.hideAppIcon) so a fresh install never flashes.
        hideAppIcon: false,
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

      liveEditor: {
        width: 480,
        height: 640,
        visibleOnAllWorkspaces: false,
        // Default OFF: LiveEditor stays unpinned unless the user opts in.
        alwaysOnTop: false,
        opacity: 0.95,
        shortcut: 'Alt+Space',
        notes: {},
      },

      settingsPopover: {
        width: SETTINGS_POPOVER_DEFAULT_WIDTH_PX,
        height: SETTINGS_POPOVER_DEFAULT_HEIGHT_PX,
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
        // which copies every unknown source key verbatim.
        const didMigrateLiveEditor =
          this.migrateLegacyLiveEditorConfig(loadedConfig)
        // Prune LAST: the braindump → liveEditor section spread above can
        // resurrect retired keys (syncMode/lastCategoryId) from the legacy block.
        const didPruneRetiredKeys = this.pruneRetiredConfigKeys(loadedConfig)
        this.shouldSaveLoadedConfig =
          didMigrateLiveEditor ||
          didPruneRetiredKeys ||
          this.shouldSaveLoadedConfig

        // Merge with defaults to ensure all properties exist
        const mergedConfig = this.mergeWithDefaults(loadedConfig)

        // Removed or malformed cue ids safely rejoin the complete shuffled pack.
        if (
          !isShortcutOpenSoundSelection(
            mergedConfig.behavior.shortcutOpenSoundSelection,
          )
        ) {
          mergedConfig.behavior.shortcutOpenSoundSelection =
            DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION
        }

        // Corrupt or hand-edited values fail silent instead of becoming truthy strings.
        if (
          typeof mergedConfig.behavior.shortcutOpenSoundEnabled !== 'boolean'
        ) {
          mergedConfig.behavior.shortcutOpenSoundEnabled = false
        }

        // Perform migration if needed
        return this.migrateConfig(mergedConfig)
      }
    } catch (error) {
      // A partially completed raw migration must never make fallback defaults
      // overwrite the unreadable original config after this load aborts.
      this.shouldSaveLoadedConfig = false
      log.error('Failed to load config:', error)
    }

    // Return default config if loading fails — deep clone so the runtime copy
    // never aliases nested defaults like `liveEditor.notes`.
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
    // aliases nested objects (e.g., `liveEditor.notes` shared with the
    // factory defaults — mutating it would silently pollute reset()).
    return merge(
      structuredClone(this.defaultConfig) as unknown as Record<string, unknown>,
      loadedConfig as unknown as Record<string, unknown>,
    ) as AppConfig
  }

  /**
   * Strips every key listed in {@link RETIRED_CONFIG_KEYS} out of a persisted
   * or imported config before merge. {@link ConfigManager.mergeWithDefaults} copies every unknown
   * source key verbatim, so without this an older `config.json` would carry
   * dead fields indefinitely. Runs on the RAW config, LAST among the raw
   * migrations: {@link ConfigManager.migrateLegacyLiveEditorConfig} spreads the
   * legacy `braindump` section, which can resurrect `syncMode`/`lastCategoryId`.
   *
   * @param raw - Config parsed from disk or an import file, before merge with defaults.
   * @returns Whether at least one retired key was removed (the caller persists when true).
   * @example
   * // disk: { window: { main: {}, floating: {} }, liveEditor: { syncMode: true, notes: {} } }
   * pruneRetiredConfigKeys(raw) // => true; raw.window === { main: {} }, raw.liveEditor === { notes: {} }
   * pruneRetiredConfigKeys({ window: { main: {} } }) // => false (nothing to write back)
   */
  private pruneRetiredConfigKeys(raw: Partial<AppConfig>): boolean {
    let didPrune = false
    for (const [sectionName, retiredKeys] of Object.entries(
      RETIRED_CONFIG_KEYS,
    )) {
      const section = (raw as Record<string, unknown>)[sectionName]
      // A hand-edited config may hold garbage where a section should be; only
      // touch a real object so deleting keys can't throw and abort the load.
      if (!isPlainObject(section)) continue
      for (const retiredKey of retiredKeys) {
        if (!(retiredKey in section)) continue
        delete section[retiredKey]
        didPrune = true
      }
    }
    return didPrune
  }

  /**
   * Moves pre-rename panel data into canonical LiveEditor keys during config load/import so notes and preferences survive the product rename.
   * @param raw - Config parsed from disk before defaults are merged.
   * @returns True when at least one legacy key was moved or removed.
   * @example
   * migrateLegacyLiveEditorConfig({ braindump: { notes: { '1': 'Keep me' } } }) // => true; data moves to liveEditor
   */
  private migrateLegacyLiveEditorConfig(raw: Partial<AppConfig>): boolean {
    let didMigrate = false
    const legacySection = raw['braindump']

    if (isPlainObject(legacySection)) {
      // Canonical values win if an interrupted rollout left both sections.
      const canonicalSection: Record<string, unknown> = isPlainObject(
        raw.liveEditor,
      )
        ? raw.liveEditor
        : {}
      const mergedSection: Record<string, unknown> = {
        ...legacySection,
        ...canonicalSection,
      }
      const legacyNotes = isPlainObject(legacySection.notes)
        ? legacySection.notes
        : {}
      const canonicalNotes = isPlainObject(canonicalSection.notes)
        ? canonicalSection.notes
        : {}

      // Notes are a per-category map, so merge them one level deeper to keep
      // every category if an interrupted rollout wrote both section names.
      if (
        Object.keys(legacyNotes).length > 0 ||
        Object.keys(canonicalNotes).length > 0
      ) {
        mergedSection.notes = { ...legacyNotes, ...canonicalNotes }
      }
      raw.liveEditor = mergedSection as unknown as LiveEditorConfig
      delete raw['braindump']
      didMigrate = true
    }

    if (isPlainObject(raw.shortcuts)) {
      const shortcuts = raw.shortcuts as Record<string, unknown>
      const legacyPrimary = shortcuts['toggleBrainDump']
      const legacySecondary = shortcuts['toggleBrainDumpSecondary']

      // Copy only into absent canonical fields so repeated migration is safe.
      if (
        shortcuts['toggleLiveEditor'] === undefined &&
        typeof legacyPrimary === 'string'
      ) {
        shortcuts['toggleLiveEditor'] = legacyPrimary
      }
      if (
        shortcuts['toggleLiveEditorSecondary'] === undefined &&
        typeof legacySecondary === 'string'
      ) {
        shortcuts['toggleLiveEditorSecondary'] = legacySecondary
      }
      if (
        'toggleBrainDump' in shortcuts ||
        'toggleBrainDumpSecondary' in shortcuts
      ) {
        delete shortcuts['toggleBrainDump']
        delete shortcuts['toggleBrainDumpSecondary']
        didMigrate = true
      }
    }

    return didMigrate
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
    this.shouldSaveLoadedConfig = true

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
      }
    }

    if (legacyConfig.windowSettings) {
      config.window = {
        main:
          legacyConfig.windowSettings.main ?? this.defaultConfig.window.main,
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
    // Deep clone — a shallow spread keeps nested objects (e.g.,
    // `liveEditor.notes`) aliased to the factory defaults, so subsequent
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
    }

    // Validate shortcuts
    if (this.config.shortcuts) {
      const shortcutValues = Object.entries(this.config.shortcuts)
        // An empty accelerator means "disabled", and any number of shortcuts
        // may be disabled at once — counting those as duplicates of each other
        // would reject a perfectly valid config on import. `toggleLiveEditor-
        // Secondary` ships empty, so a single other disabled key would trip it.
        .filter(([, value]) => typeof value === 'string' && value !== '')
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

      // Apply the same raw migrations as load, in the same order (prune last),
      // before merge — an imported file may predate the current shape.
      this.migrateLegacyLiveEditorConfig(importedConfig)
      this.pruneRetiredConfigKeys(importedConfig)

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
