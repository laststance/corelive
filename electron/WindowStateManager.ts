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
  floating: WindowState
  [key: string]: WindowState
}

/** Window type */
type WindowType = 'main' | 'floating'

/** Snap edge type */
type SnapEdge =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'maximize'

/** Display info */
export interface DisplayInfo {
  id: number
  label: string
  bounds: Rectangle
  workArea: Rectangle
  scaleFactor: number
  rotation: number
  touchSupport: string
  monochrome: boolean
  accelerometerSupport: string
  colorSpace: string
  colorDepth: number
  depthPerComponent: number
  isPrimary: boolean
}

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

/** Window stats */
export interface WindowStats {
  windowCount: number
  lastSaved: number
  displays: Array<{
    id: number
    bounds: Rectangle
    workArea: Rectangle
    scaleFactor: number
  }>
  states: Record<
    string,
    {
      bounds: WindowBounds
      displayId: number
      lastSaved: number
    }
  >
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
    const floatingConfig = windowConfig.floating

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
      floating: {
        width: floatingConfig.width,
        height: floatingConfig.height,
        x: screenWidth - floatingConfig.width - 50,
        y: 50,
        isVisible: floatingConfig.startVisible,
        isAlwaysOnTop: floatingConfig.alwaysOnTop,
        isMaximized: false,
        isMinimized: false,
        isFullScreen: false,
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
      floating: defaultStates.floating,
    }

    if (states.main) {
      validatedStates.main = this.validateWindowState(
        states.main,
        defaultStates.main,
        'main',
      )
    }

    if (states.floating) {
      validatedStates.floating = this.validateWindowState(
        states.floating,
        defaultStates.floating,
        'floating',
      )
    }

    return validatedStates
  }

  /**
   * Validate individual window state.
   */
  private validateWindowState(
    state: Partial<WindowState>,
    defaultState: WindowState,
    windowType: WindowType,
  ): WindowState {
    const windowConfig = this.configManager.getSection(
      'window',
    ) as AppConfig['window']
    const config = windowConfig[windowType]
    const validatedState: WindowState = { ...defaultState }

    // Validate dimensions
    const minWidth = 'minWidth' in config ? config.minWidth : 400
    const minHeight = 'minHeight' in config ? config.minHeight : 300
    const maxWidth = 'maxWidth' in config ? config.maxWidth : 2000
    const maxHeight = 1500

    if (typeof state.width === 'number' && state.width >= minWidth) {
      validatedState.width = Math.min(state.width, maxWidth)
    }

    if (typeof state.height === 'number' && state.height >= minHeight) {
      validatedState.height = Math.min(state.height, maxHeight)
    }

    // Validate position if remember position is enabled
    if (
      config.rememberPosition &&
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

      if (windowType === 'floating') {
        this.windowStates[windowType].isAlwaysOnTop =
          browserWindow.isAlwaysOnTop()
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
   * Reset window state to defaults.
   */
  resetWindowState(windowType: WindowType): boolean {
    const defaultStates = this.getDefaultWindowStates()
    this.windowStates[windowType] = defaultStates[windowType]
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
   */
  getWindowOptions(windowType: WindowType): WindowOptions {
    const state = this.getWindowState(windowType)
    const windowConfig = this.configManager.getSection(
      'window',
    ) as AppConfig['window']
    const config = windowConfig[windowType]

    if (!state || !config) {
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

    if (windowType === 'floating') {
      const floatingConfig = config as AppConfig['window']['floating']
      options.maxWidth = floatingConfig.maxWidth
      options.frame = floatingConfig.frame
      options.alwaysOnTop = state.isAlwaysOnTop
      options.resizable = floatingConfig.resizable
      options.skipTaskbar = true
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

      if (
        windowType === 'floating' &&
        typeof state.isAlwaysOnTop === 'boolean'
      ) {
        browserWindow.setAlwaysOnTop(state.isAlwaysOnTop)
      }

      if (state.isVisible && windowType === 'floating') {
        browserWindow.show()
      }

      return true
    } catch (error) {
      log.error(`Failed to apply ${windowType} window state:`, error)
      return false
    }
  }

  /**
   * Get statistics about window states.
   */
  getStats(): WindowStats {
    return {
      windowCount: Object.keys(this.windowStates).length,
      lastSaved: Math.max(
        ...Object.values(this.windowStates).map((s) => s.lastSaved || 0),
      ),
      displays: screen.getAllDisplays().map((d) => ({
        id: d.id,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
      })),
      states: Object.keys(this.windowStates).reduce(
        (acc, key) => {
          acc[key] = {
            bounds: {
              x: this.windowStates[key].x,
              y: this.windowStates[key].y,
              width: this.windowStates[key].width,
              height: this.windowStates[key].height,
            },
            displayId: this.windowStates[key].displayId,
            lastSaved: this.windowStates[key].lastSaved,
          }
          return acc
        },
        {} as WindowStats['states'],
      ),
    }
  }

  /**
   * Move window to specific display.
   */
  moveWindowToDisplay(
    windowType: WindowType,
    displayId: number,
    browserWindow: BrowserWindow | null = null,
  ): boolean {
    const displays = screen.getAllDisplays()
    const targetDisplay = displays.find((d) => d.id === displayId)

    if (!targetDisplay) {
      log.warn(`Display ${displayId} not found`)
      return false
    }

    const state = this.getWindowState(windowType)
    if (!state) {
      log.warn(`Window state for ${windowType} not found`)
      return false
    }

    const newPosition = this.calculateCenterPosition(
      { width: state.width, height: state.height },
      targetDisplay,
    )

    const success = this.setWindowState(windowType, {
      x: newPosition.x,
      y: newPosition.y,
      displayId: targetDisplay.id,
      workArea: targetDisplay.workArea,
    })

    if (success && browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.setBounds({
        x: newPosition.x,
        y: newPosition.y,
        width: state.width,
        height: state.height,
      })
    }

    return success
  }

  /**
   * Snap window to edge of current display.
   */
  snapWindowToEdge(
    windowType: WindowType,
    edge: SnapEdge,
    browserWindow: BrowserWindow | null = null,
  ): boolean {
    const state = this.getWindowState(windowType)
    if (!state) return false

    const displays = screen.getAllDisplays()
    const currentDisplay =
      displays.find((d) => d.id === state.displayId) ||
      screen.getPrimaryDisplay()
    const {
      x: displayX,
      y: displayY,
      width: displayWidth,
      height: displayHeight,
    } = currentDisplay.workArea

    let newX = state.x
    let newY = state.y
    let newWidth = state.width
    let newHeight = state.height

    switch (edge) {
      case 'left':
        newX = displayX
        newY = displayY
        newWidth = Math.floor(displayWidth / 2)
        newHeight = displayHeight
        break
      case 'right':
        newX = displayX + Math.floor(displayWidth / 2)
        newY = displayY
        newWidth = Math.floor(displayWidth / 2)
        newHeight = displayHeight
        break
      case 'top':
        newX = displayX
        newY = displayY
        newWidth = displayWidth
        newHeight = Math.floor(displayHeight / 2)
        break
      case 'bottom':
        newX = displayX
        newY = displayY + Math.floor(displayHeight / 2)
        newWidth = displayWidth
        newHeight = Math.floor(displayHeight / 2)
        break
      case 'top-left':
        newX = displayX
        newY = displayY
        newWidth = Math.floor(displayWidth / 2)
        newHeight = Math.floor(displayHeight / 2)
        break
      case 'top-right':
        newX = displayX + Math.floor(displayWidth / 2)
        newY = displayY
        newWidth = Math.floor(displayWidth / 2)
        newHeight = Math.floor(displayHeight / 2)
        break
      case 'bottom-left':
        newX = displayX
        newY = displayY + Math.floor(displayHeight / 2)
        newWidth = Math.floor(displayWidth / 2)
        newHeight = Math.floor(displayHeight / 2)
        break
      case 'bottom-right':
        newX = displayX + Math.floor(displayWidth / 2)
        newY = displayY + Math.floor(displayHeight / 2)
        newWidth = Math.floor(displayWidth / 2)
        newHeight = Math.floor(displayHeight / 2)
        break
      case 'maximize':
        newX = displayX
        newY = displayY
        newWidth = displayWidth
        newHeight = displayHeight
        break
      default:
        return false
    }

    const success = this.setWindowState(windowType, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    })

    if (success && browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.setBounds({
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      })
    }

    return success
  }

  /**
   * Get display information for a window.
   */
  getWindowDisplay(windowType: WindowType): Display | null {
    const state = this.getWindowState(windowType)
    if (!state) return null

    const displays = screen.getAllDisplays()
    return (
      displays.find((d) => d.id === state.displayId) ||
      screen.getPrimaryDisplay()
    )
  }

  /**
   * Get all available displays with their information.
   */
  getAllDisplays(): DisplayInfo[] {
    return screen.getAllDisplays().map((display) => ({
      id: display.id,
      label: display.label || `Display ${display.id}`,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      touchSupport: display.touchSupport,
      monochrome: display.monochrome,
      accelerometerSupport: display.accelerometerSupport,
      colorSpace: display.colorSpace,
      colorDepth: display.colorDepth,
      depthPerComponent: display.depthPerComponent,
      isPrimary: display.id === screen.getPrimaryDisplay().id,
    }))
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

      if (windowType === 'floating') {
        this.windowStates[windowType].isAlwaysOnTop =
          browserWindow.isAlwaysOnTop()
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
