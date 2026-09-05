/**
 * @fileoverview Window State Manager for Electron Application
 *
 * Manages window positions, sizes, and states with:
 * - Persistent storage of window bounds
 * - Multi-monitor support
 * - Display change handling
 * - State validation and recovery
 *
 * @module electron/WindowStateManager
 */

import fs from 'fs'
import path from 'path'

import {
  screen,
  app,
  type BrowserWindow,
  type Display,
  type Rectangle,
} from 'electron'

import type { ConfigManager, AppConfig } from './ConfigManager'
import { log } from './logger'

// ============================================================================
// Type Definitions
// ============================================================================

/** Window bounds */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Window state for a single window */
export interface WindowState {
  width: number
  height: number
  x: number
  y: number
  isMaximized: boolean
  isMinimized: boolean
  isFullScreen: boolean
  isVisible?: boolean
  isAlwaysOnTop?: boolean
  displayId: number
  workArea: Rectangle
  lastSaved: number
}

/** All window states */
interface WindowStates {
  main: WindowState
  liveEditor: WindowState
  [key: string]: WindowState
}

/** Window type */
export type WindowType = 'main' | 'liveEditor'

/** Window options for BrowserWindow creation */
export interface WindowOptions {
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  x?: number
  y?: number
  show?: boolean
  frame?: boolean
  alwaysOnTop?: boolean
  resizable?: boolean
  skipTaskbar?: boolean
}

// ============================================================================
// Window State Manager Class
// ============================================================================

/**
 * Manages window states with persistence and multi-monitor support.
 */
export class WindowStateManager {
  /** Config manager instance */
  private configManager: ConfigManager

  /** Path to window state file */
  private windowStatePath: string

  /** Current window states */
  private windowStates: WindowStates

  /** Debounce timeout for saving */
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    this.windowStatePath = path.join(
      app.getPath('userData'),
      'window-state.json',
    )
    this.windowStates = this.loadWindowStates()

    // Track display changes
    this.setupDisplayChangeHandling()
  }

  /**
   * Load window states from persistent storage.
   */
  private loadWindowStates(): WindowStates {
    try {
      if (fs.existsSync(this.windowStatePath)) {
        const data = fs.readFileSync(this.windowStatePath, 'utf8')
        const states = JSON.parse(data) as Partial<WindowStates>

        log.info('Window states loaded successfully')
        return this.validateWindowStates(states)
      } else {
        log.info(
          'No saved window states found, using defaults (first launch or reset)',
        )
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        log.error(
          'Failed to parse window states (corrupted file):',
          error.message,
        )
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        log.error(
          'Permission denied when reading window states:',
          (error as Error).message,
        )
      } else {
        log.error('Failed to load window states:', (error as Error).message)
      }
      log.info('Using default window states')
    }

    return this.getDefaultWindowStates()
  }

  /**
   * Get default window states.
   */
  getDefaultWindowStates(): WindowStates {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } =
      primaryDisplay.workAreaSize

    const windowConfig = this.configManager.getSection(
      'window',
    ) as AppConfig['window']
    const mainConfig = windowConfig.main
    const liveEditorConfig = this.configManager.getSection(
      'liveEditor',
    ) as AppConfig['liveEditor']

    return {
      main: {
        width: mainConfig.width,
        height: mainConfig.height,
        x: Math.round((screenWidth - mainConfig.width) / 2),
        y: Math.round((screenHeight - mainConfig.height) / 2),
        isMaximized: mainConfig.startMaximized,
        isMinimized: false,
        isFullScreen: false,
        displayId: primaryDisplay.id,
        workArea: primaryDisplay.workArea,
        lastSaved: Date.now(),
      },
      liveEditor: {
        width: liveEditorConfig.width,
        height: liveEditorConfig.height,
        // Anchor against the primary display's workArea origin so multi-
        // monitor users get the panel on the right monitor instead of at
        // (-1280, …) or off-screen entirely.
        x:
          primaryDisplay.workArea.x +
          (primaryDisplay.workArea.width - liveEditorConfig.width - 80),
        y:
          primaryDisplay.workArea.y +
          Math.round(
            (primaryDisplay.workArea.height - liveEditorConfig.height) / 2,
          ),
        isMaximized: false,
        isMinimized: false,
        isFullScreen: false,
        isVisible: false,
        displayId: primaryDisplay.id,
        workArea: primaryDisplay.workArea,
        lastSaved: Date.now(),
      },
    }
  }

  /**
   * Validate and fix window states.
   */
  private validateWindowStates(states: Partial<WindowStates>): WindowStates {
    const defaultStates = this.getDefaultWindowStates()
    const validatedStates: WindowStates = {
      main: defaultStates.main,
      liveEditor: defaultStates.liveEditor,
    }

    if (states.main) {
      validatedStates.main = this.validateWindowState(
        states.main,
        defaultStates.main,
        'main',
      )
    }

    // Previous releases stored this panel under `braindump`; accept it once so
    // an update keeps the user's size and position instead of resetting them.
    const liveEditorState =
      states.liveEditor ?? (states['braindump'] as WindowState | undefined)
    if (liveEditorState) {
      validatedStates.liveEditor = this.validateWindowState(
        liveEditorState,
        defaultStates.liveEditor,
        'liveEditor',
      )
    }

    return validatedStates
  }

  /**
   * Validate individual window state.
   *
   * LiveEditor lives outside `windowConfig` because its dimensions are tracked
   * in the dedicated `liveEditor` section (per LiveEditor plan D1) — the window
   * always remembers its bounds, so we still apply persisted x/y/w/h.
   */
  private validateWindowState(
    state: Partial<WindowState>,
    defaultState: WindowState,
    windowType: WindowType,
  ): WindowState {
    const validatedState: WindowState = { ...defaultState }

    let minWidth: number
    let minHeight: number
    let maxWidth: number
    let shouldRememberPosition: boolean

    if (windowType === 'liveEditor') {
      // LiveEditor bounds are bounded by sensible UX limits, not config-driven.
      minWidth = 320
      minHeight = 320
      maxWidth = 1200
      shouldRememberPosition = true
    } else {
      const windowConfig = this.configManager.getSection(
        'window',
      ) as AppConfig['window']
      const config = windowConfig[windowType]
      minWidth = 'minWidth' in config ? config.minWidth : 400
      minHeight = 'minHeight' in config ? config.minHeight : 300
      // No remaining window config carries a max width; keep the historical cap.
      maxWidth = 2000
      shouldRememberPosition = config.rememberPosition
    }

    const maxHeight = 1500

    if (typeof state.width === 'number' && state.width >= minWidth) {
      validatedState.width = Math.min(state.width, maxWidth)
    }

    if (typeof state.height === 'number' && state.height >= minHeight) {
      validatedState.height = Math.min(state.height, maxHeight)
    }

    // Validate position if remember position is enabled
    if (
      shouldRememberPosition &&
      typeof state.x === 'number' &&
      typeof state.y === 'number'
    ) {
      const validPosition = this.ensureVisibleOnSomeDisplay({
        x: state.x,
        y: state.y,
        width: validatedState.width,
        height: validatedState.height,
      })

      validatedState.x = validPosition.x
      validatedState.y = validPosition.y
    }

    // Validate boolean states
    if (typeof state.isMaximized === 'boolean') {
      validatedState.isMaximized = state.isMaximized
    }

    if (typeof state.isMinimized === 'boolean') {
      validatedState.isMinimized = state.isMinimized
    }

    if (typeof state.isFullScreen === 'boolean') {
      validatedState.isFullScreen = state.isFullScreen
    }

    if (typeof state.isVisible === 'boolean') {
      validatedState.isVisible = state.isVisible
    }

    if (typeof state.isAlwaysOnTop === 'boolean') {
      validatedState.isAlwaysOnTop = state.isAlwaysOnTop
    }

    // Validate display information
    if (typeof state.displayId === 'number') {
      const display = screen
        .getAllDisplays()
        .find((d) => d.id === state.displayId)
      if (display) {
        validatedState.displayId = state.displayId
        validatedState.workArea = display.workArea
      }
    }

    validatedState.lastSaved = Date.now()

    return validatedState
  }

  /**
   * Ensure window is visible on some display.
   */
  ensureVisibleOnSomeDisplay(windowBounds: WindowBounds): WindowBounds {
    const displays = screen.getAllDisplays()
    let isVisible = false

    for (const display of displays) {
      const { x, y, width, height } = display.workArea
      const windowRight = windowBounds.x + windowBounds.width
      const windowBottom = windowBounds.y + windowBounds.height

      if (
        windowBounds.x < x + width &&
        windowRight > x &&
        windowBounds.y < y + height &&
        windowBottom > y
      ) {
        isVisible = true
        break
      }
    }

    if (!isVisible) {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.workAreaSize

      return {
        x: Math.max(0, Math.round((width - windowBounds.width) / 2)),
        y: Math.max(0, Math.round((height - windowBounds.height) / 2)),
        width: windowBounds.width,
        height: windowBounds.height,
      }
    }

    return windowBounds
  }

  /**
   * Save window states to persistent storage.
   */
  saveWindowStates(): boolean {
    try {
      const stateData = JSON.stringify(this.windowStates, null, 2)
      fs.writeFileSync(this.windowStatePath, stateData, 'utf8')
      return true
    } catch (error) {
      log.error('Failed to save window states:', error)
      return false
    }
  }

  /**
   * Get window state for specific window.
   */
  getWindowState(windowType: WindowType): WindowState | null {
    return this.windowStates[windowType]
      ? { ...this.windowStates[windowType] }
      : null
  }

  /**
   * Update window state from BrowserWindow instance.
   */
  updateWindowState(
    windowType: WindowType,
    browserWindow: BrowserWindow,
  ): boolean {
    if (!browserWindow || browserWindow.isDestroyed()) {
      return false
    }

    try {
      const bounds = browserWindow.getBounds()
      const display = screen.getDisplayMatching(bounds)

      this.windowStates[windowType] = {
        ...this.windowStates[windowType],
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: browserWindow.isMaximized(),
        isMinimized: browserWindow.isMinimized(),
        isFullScreen: browserWindow.isFullScreen(),
        isVisible: browserWindow.isVisible(),
        displayId: display.id,
        workArea: display.workArea,
        lastSaved: Date.now(),
      }

      return this.saveWindowStates()
    } catch (error) {
      log.error(`Failed to update ${windowType} window state:`, error)
      return false
    }
  }

  /**
   * Set window state properties.
   */
  setWindowState(
    windowType: WindowType,
    properties: Partial<WindowState>,
  ): boolean {
    if (!this.windowStates[windowType]) {
      this.windowStates[windowType] = this.getDefaultWindowStates()[windowType]
    }

    this.windowStates[windowType] = {
      ...this.windowStates[windowType],
      ...properties,
      lastSaved: Date.now(),
    }

    return this.saveWindowStates()
  }

  /**
   * Handle display changes (monitor connect/disconnect).
   */
  private setupDisplayChangeHandling(): void {
    screen.on('display-added', () => {
      this.handleDisplayChange('added')
    })

    screen.on('display-removed', () => {
      this.handleDisplayChange('removed')
    })

    screen.on('display-metrics-changed', () => {
      this.handleDisplayChange('metrics-changed')
    })
  }

  /**
   * Handle display configuration changes.
   */
  private handleDisplayChange(_changeType: string): void {
    const currentDisplays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()

    for (const [windowType, state] of Object.entries(this.windowStates)) {
      const windowDisplay = currentDisplays.find(
        (d) => d.id === state.displayId,
      )

      if (!windowDisplay) {
        const newPosition = this.calculateCenterPosition(
          { width: state.width, height: state.height },
          primaryDisplay,
        )

        this.setWindowState(windowType as WindowType, {
          x: newPosition.x,
          y: newPosition.y,
          displayId: primaryDisplay.id,
          workArea: primaryDisplay.workArea,
        })
      } else {
        const validatedBounds = this.ensureVisibleOnDisplay(
          {
            x: state.x,
            y: state.y,
            width: state.width,
            height: state.height,
          },
          windowDisplay,
        )

        if (validatedBounds.x !== state.x || validatedBounds.y !== state.y) {
          this.setWindowState(windowType as WindowType, {
            x: validatedBounds.x,
            y: validatedBounds.y,
            workArea: windowDisplay.workArea,
          })
        }
      }
    }
  }

  /**
   * Calculate center position for a window on a specific display.
   */
  calculateCenterPosition(
    windowSize: { width: number; height: number },
    display: Display,
  ): { x: number; y: number } {
    const { x, y, width, height } = display.workArea

    return {
      x: x + Math.round((width - windowSize.width) / 2),
      y: y + Math.round((height - windowSize.height) / 2),
    }
  }

  /**
   * Ensure window is visible on a specific display.
   */
  ensureVisibleOnDisplay(
    windowBounds: WindowBounds,
    display: Display,
  ): WindowBounds {
    const {
      x: displayX,
      y: displayY,
      width: displayWidth,
      height: displayHeight,
    } = display.workArea
    const margin = 50

    let { x, y, width, height } = windowBounds

    if (width > displayWidth) {
      width = displayWidth - margin
    }
    if (height > displayHeight) {
      height = displayHeight - margin
    }

    if (x < displayX) {
      x = displayX
    } else if (x + width > displayX + displayWidth) {
      x = displayX + displayWidth - width
    }

    if (y < displayY) {
      y = displayY
    } else if (y + height > displayY + displayHeight) {
      y = displayY + displayHeight - height
    }

    return { x, y, width, height }
  }

  /**
   * Get window creation options for BrowserWindow.
   *
   * LiveEditor options come from `liveEditor` config (frameless transparent
   * panel) — main comes from `window` config as before.
   */
  getWindowOptions(windowType: WindowType): WindowOptions {
    const state = this.getWindowState(windowType)

    if (!state) {
      return {}
    }

    if (windowType === 'liveEditor') {
      return {
        width: state.width,
        height: state.height,
        minWidth: 320,
        minHeight: 320,
        maxWidth: 1200,
        x: state.x,
        y: state.y,
        show: false,
        frame: false,
        // Honor the LiveEditor always-on-top setting (default off) instead of
        // hardcoding true — pairs with the createLiveEditorWindow ctor read so the
        // options path and the constructor agree.
        alwaysOnTop: this.configManager.get<boolean>(
          'liveEditor.alwaysOnTop',
          false,
        ),
        resizable: true,
        skipTaskbar: true,
      } satisfies WindowOptions
    }

    const windowConfig = this.configManager.getSection(
      'window',
    ) as AppConfig['window']
    const config = windowConfig[windowType]

    if (!config) {
      return {}
    }

    const options: WindowOptions = {
      width: state.width,
      height: state.height,
      minWidth: 'minWidth' in config ? config.minWidth : undefined,
      minHeight: 'minHeight' in config ? config.minHeight : undefined,
      show: false,
    }

    if (config.rememberPosition) {
      options.x = state.x
      options.y = state.y
    }

    return options
  }

  /**
   * Apply saved state to BrowserWindow after creation.
   */
  applyWindowState(
    windowType: WindowType,
    browserWindow: BrowserWindow,
  ): boolean {
    const state = this.getWindowState(windowType)

    if (!state || !browserWindow || browserWindow.isDestroyed()) {
      return false
    }

    try {
      if (state.isMaximized && windowType === 'main') {
        browserWindow.maximize()
      }

      if (state.isFullScreen && windowType === 'main') {
        browserWindow.setFullScreen(true)
      }

      // Visibility is owned by WindowManager's explicit show paths. Restoring
      // it here would let stale window-state.json bypass the signed-out auth
      // gate for the LiveEditor panel.

      return true
    } catch (error) {
      log.error(`Failed to apply ${windowType} window state:`, error)
      return false
    }
  }

  /**
   * Save window state with debouncing.
   */
  debouncedSaveWindowStates(): void {
    const delay = 500

    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId)
    }

    this.saveTimeoutId = setTimeout(() => {
      this.saveWindowStates()
      this.saveTimeoutId = null
    }, delay)
  }

  /**
   * Update window state with debounced saving.
   */
  updateWindowStateDebounced(
    windowType: WindowType,
    browserWindow: BrowserWindow,
  ): boolean {
    if (!browserWindow || browserWindow.isDestroyed()) {
      return false
    }

    try {
      const bounds = browserWindow.getBounds()
      const display = screen.getDisplayMatching(bounds)

      this.windowStates[windowType] = {
        ...this.windowStates[windowType],
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: browserWindow.isMaximized(),
        isMinimized: browserWindow.isMinimized(),
        isFullScreen: browserWindow.isFullScreen(),
        isVisible: browserWindow.isVisible(),
        displayId: display.id,
        workArea: display.workArea,
        lastSaved: Date.now(),
      }

      this.debouncedSaveWindowStates()
      return true
    } catch (error) {
      log.error(`Failed to update ${windowType} window state:`, error)
      return false
    }
  }

  /**
   * Cleanup window state manager.
   */
  cleanup(): void {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId)
    }
    this.saveWindowStates()
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default WindowStateManager
