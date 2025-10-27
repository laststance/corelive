const fs = require('fs')
const path = require('path')

const { screen, app } = require('electron')

const { log } = require('../src/lib/logger.cjs')

class WindowStateManager {
  constructor(configManager) {
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
   * Load window states from persistent storage
   */
  loadWindowStates() {
    try {
      if (fs.existsSync(this.windowStatePath)) {
        const data = fs.readFileSync(this.windowStatePath, 'utf8')
        const states = JSON.parse(data)

        // Validate and migrate window states
        log.info('Window states loaded successfully')
        return this.validateWindowStates(states)
      } else {
        // First launch - no saved state file exists (this is expected)
        log.info(
          'No saved window states found, using defaults (first launch or reset)',
        )
      }
    } catch (error) {
      // Distinguish between different error types
      if (error instanceof SyntaxError) {
        log.error(
          'Failed to parse window states (corrupted file):',
          error.message,
        )
        log.info('Using default window states')
      } else if (error.code === 'EACCES') {
        log.error(
          'Permission denied when reading window states:',
          error.message,
        )
        log.info('Using default window states')
      } else {
        log.error('Failed to load window states:', error.message)
        if (error.stack) {
          log.debug('Stack trace:', error.stack)
        }
        log.info('Using default window states')
      }
    }

    // Return default states if loading fails or file doesn't exist
    return this.getDefaultWindowStates()
  }

  /**
   * Get default window states
   */
  getDefaultWindowStates() {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } =
      primaryDisplay.workAreaSize

    const mainConfig = this.configManager.getSection('window').main
    const floatingConfig = this.configManager.getSection('window').floating

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
        displayId: primaryDisplay.id,
        workArea: primaryDisplay.workArea,
        lastSaved: Date.now(),
      },
    }
  }

  /**
   * Validate and fix window states
   */
  validateWindowStates(states) {
    const defaultStates = this.getDefaultWindowStates()
    const validatedStates = {}

    // Validate main window state
    if (states.main) {
      validatedStates.main = this.validateWindowState(
        states.main,
        defaultStates.main,
        'main',
      )
    } else {
      validatedStates.main = defaultStates.main
    }

    // Validate floating window state
    if (states.floating) {
      validatedStates.floating = this.validateWindowState(
        states.floating,
        defaultStates.floating,
        'floating',
      )
    } else {
      validatedStates.floating = defaultStates.floating
    }

    return validatedStates
  }

  /**
   * Validate individual window state
   */
  validateWindowState(state, defaultState, windowType) {
    const config = this.configManager.getSection('window')[windowType]
    const validatedState = { ...defaultState }

    // Validate dimensions
    if (
      typeof state.width === 'number' &&
      state.width >= (config.minWidth || 400)
    ) {
      validatedState.width = Math.min(state.width, config.maxWidth || 2000)
    }

    if (
      typeof state.height === 'number' &&
      state.height >= (config.minHeight || 300)
    ) {
      validatedState.height = Math.min(state.height, config.maxHeight || 1500)
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
   * Ensure window is visible on some display
   */
  ensureVisibleOnSomeDisplay(windowBounds) {
    const displays = screen.getAllDisplays()
    let isVisible = false

    // Check if window is visible on any display
    for (const display of displays) {
      const { x, y, width, height } = display.workArea
      const windowRight = windowBounds.x + windowBounds.width
      const windowBottom = windowBounds.y + windowBounds.height

      // Check if window overlaps with display work area
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
      // Move window to primary display
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
   * Save window states to persistent storage
   */
  saveWindowStates() {
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
   * Get window state for specific window
   */
  getWindowState(windowType) {
    return this.windowStates[windowType]
      ? { ...this.windowStates[windowType] }
      : null
  }

  /**
   * Update window state from BrowserWindow instance
   */
  updateWindowState(windowType, browserWindow) {
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

      // Add floating-specific properties
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
   * Set window state properties
   */
  setWindowState(windowType, properties) {
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
   * Reset window state to defaults
   */
  resetWindowState(windowType) {
    const defaultStates = this.getDefaultWindowStates()
    this.windowStates[windowType] = defaultStates[windowType]
    return this.saveWindowStates()
  }

  /**
   * Handle display changes (monitor connect/disconnect)
   */
  setupDisplayChangeHandling() {
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
   * Handle display configuration changes
   */
  handleDisplayChange(_changeType) {
    // Get current display configuration
    const currentDisplays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()

    // Validate all window positions after display changes
    for (const [windowType, state] of Object.entries(this.windowStates)) {
      // Check if the window's display still exists
      const windowDisplay = currentDisplays.find(
        (d) => d.id === state.displayId,
      )

      if (!windowDisplay) {
        // Display no longer exists, move to primary display

        const newPosition = this.calculateCenterPosition(
          { width: state.width, height: state.height },
          primaryDisplay,
        )

        this.setWindowState(windowType, {
          x: newPosition.x,
          y: newPosition.y,
          displayId: primaryDisplay.id,
          workArea: primaryDisplay.workArea,
        })
      } else {
        // Display exists, but validate position is still within bounds
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
          this.setWindowState(windowType, {
            x: validatedBounds.x,
            y: validatedBounds.y,
            workArea: windowDisplay.workArea,
          })
        }
      }
    }
  }

  /**
   * Calculate center position for a window on a specific display
   */
  calculateCenterPosition(windowSize, display) {
    const { x, y, width, height } = display.workArea

    return {
      x: x + Math.round((width - windowSize.width) / 2),
      y: y + Math.round((height - windowSize.height) / 2),
    }
  }

  /**
   * Ensure window is visible on a specific display
   */
  ensureVisibleOnDisplay(windowBounds, display) {
    const {
      x: displayX,
      y: displayY,
      width: displayWidth,
      height: displayHeight,
    } = display.workArea
    const margin = 50 // Minimum visible margin

    let { x, y, width, height } = windowBounds

    // Ensure window is not larger than display
    if (width > displayWidth) {
      width = displayWidth - margin
    }
    if (height > displayHeight) {
      height = displayHeight - margin
    }

    // Ensure window is within display bounds
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
   * Get window creation options for BrowserWindow
   */
  getWindowOptions(windowType) {
    const state = this.getWindowState(windowType)
    const config = this.configManager.getSection('window')[windowType]

    if (!state || !config) {
      return {}
    }

    const options = {
      width: state.width,
      height: state.height,
      minWidth: config.minWidth,
      minHeight: config.minHeight,
      show: false, // Always start hidden and show when ready
    }

    // Add position if remember position is enabled
    if (config.rememberPosition) {
      options.x = state.x
      options.y = state.y
    }

    // Add window type specific options
    if (windowType === 'floating') {
      options.maxWidth = config.maxWidth
      options.frame = config.frame
      options.alwaysOnTop = state.isAlwaysOnTop
      options.resizable = config.resizable
      options.skipTaskbar = true
    }

    return options
  }

  /**
   * Apply saved state to BrowserWindow after creation
   */
  applyWindowState(windowType, browserWindow) {
    const state = this.getWindowState(windowType)

    if (!state || !browserWindow || browserWindow.isDestroyed()) {
      return false
    }

    try {
      // Apply maximized state
      if (state.isMaximized && windowType === 'main') {
        browserWindow.maximize()
      }

      // Apply fullscreen state
      if (state.isFullScreen && windowType === 'main') {
        browserWindow.setFullScreen(true)
      }

      // Apply always on top for floating window
      if (
        windowType === 'floating' &&
        typeof state.isAlwaysOnTop === 'boolean'
      ) {
        browserWindow.setAlwaysOnTop(state.isAlwaysOnTop)
      }

      // Show window if it should be visible
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
   * Get statistics about window states
   */
  getStats() {
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
      states: Object.keys(this.windowStates).reduce((acc, key) => {
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
      }, {}),
    }
  }

  /**
   * Move window to specific display
   */
  moveWindowToDisplay(windowType, displayId, browserWindow = null) {
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

    // Calculate new position centered on target display
    const newPosition = this.calculateCenterPosition(
      { width: state.width, height: state.height },
      targetDisplay,
    )

    // Update window state
    const success = this.setWindowState(windowType, {
      x: newPosition.x,
      y: newPosition.y,
      displayId: targetDisplay.id,
      workArea: targetDisplay.workArea,
    })

    // Apply to browser window if provided
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
   * Snap window to edge of current display
   */
  snapWindowToEdge(windowType, edge, browserWindow = null) {
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

    // Update window state
    const success = this.setWindowState(windowType, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    })

    // Apply to browser window if provided
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
   * Get display information for a window
   */
  getWindowDisplay(windowType) {
    const state = this.getWindowState(windowType)
    if (!state) return null

    const displays = screen.getAllDisplays()
    return (
      displays.find((d) => d.id === state.displayId) ||
      screen.getPrimaryDisplay()
    )
  }

  /**
   * Get all available displays with their information
   */
  getAllDisplays() {
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
   * Save window state with debouncing to prevent excessive saves
   */
  debouncedSaveWindowStates = (() => {
    let timeoutId = null
    const delay = 500 // 500ms debounce

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      timeoutId = setTimeout(() => {
        this.saveWindowStates()
        timeoutId = null
      }, delay)
    }
  })()

  /**
   * Update window state with debounced saving
   */
  updateWindowStateDebounced(windowType, browserWindow) {
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

      // Add floating-specific properties
      if (windowType === 'floating') {
        this.windowStates[windowType].isAlwaysOnTop =
          browserWindow.isAlwaysOnTop()
      }

      // Use debounced save to prevent excessive file writes
      this.debouncedSaveWindowStates()
      return true
    } catch (error) {
      log.error(`Failed to update ${windowType} window state:`, error)
      return false
    }
  }

  /**
   * Cleanup window state manager
   */
  cleanup() {
    this.saveWindowStates()
  }
}

module.exports = WindowStateManager
