/**
 * @fileoverview Lazy Loading Manager for Electron Components
 *
 * Manages on-demand loading of non-critical Electron components
 * to dramatically improve startup performance.
 *
 * Why lazy loading matters in Electron:
 * - Electron apps can be slow to start (loading Chromium + Node.js)
 * - Users expect desktop apps to launch quickly
 * - Many features aren't needed immediately at startup
 * - Loading everything upfront wastes memory and time
 *
 * Strategy:
 * - Load only essential components at startup (window, IPC)
 * - Defer heavy modules until actually needed
 * - Cache loaded modules to avoid re-loading
 * - Handle loading errors gracefully
 *
 * Performance impact:
 * - Can reduce startup time by 30-50%
 * - Lower initial memory footprint
 * - Better perceived performance
 *
 * @module electron/LazyLoadManager
 */

const { log } = require('../src/lib/logger.cjs')

const { performanceOptimizer } = require('./performance-config.cjs')

/**
 * Orchestrates lazy loading of Electron components.
 *
 * Components are categorized by priority:
 * - Critical: Loaded immediately (WindowManager, API Bridge)
 * - Important: Loaded soon after startup (Menu, Shortcuts)
 * - Optional: Loaded on-demand (Tray, Notifications, Updates)
 *
 * This manager ensures:
 * - Components load only once (singleton pattern)
 * - Concurrent requests share the same loading promise
 * - Failed loads don't crash the app
 * - Loading metrics are tracked
 */
class LazyLoadManager {
  constructor() {
    this.loadedComponents = new Set() // Track loaded modules
    this.loadingPromises = new Map() // Prevent duplicate loads
    this.componentFactories = new Map() // Module loader functions

    // Define how to load each component
    this.registerComponentFactories()
  }

  /**
   * Register factories for lazy-loaded components
   */
  registerComponentFactories() {
    // System Tray Manager - not critical for startup
    this.componentFactories.set('SystemTrayManager', () => {
      return require('./SystemTrayManager.cjs')
    })

    // Notification Manager - can be loaded when first notification is needed
    this.componentFactories.set('NotificationManager', () => {
      return require('./NotificationManager.cjs')
    })

    // Shortcut Manager - can be loaded after window is ready
    this.componentFactories.set('ShortcutManager', () => {
      return require('./ShortcutManager.cjs')
    })

    // Auto Updater - not needed immediately
    this.componentFactories.set('AutoUpdater', () => {
      return require('./AutoUpdater.cjs')
    })

    // Menu Manager - needed for application menu
    this.componentFactories.set('MenuManager', () => {
      return require('./MenuManager.cjs')
    })

    // System Integration Error Handler - can be loaded when needed
    this.componentFactories.set('SystemIntegrationErrorHandler', () => {
      return require('./SystemIntegrationErrorHandler.cjs')
    })

    // Deep Link Manager - handles URL scheme registration and processing
    this.componentFactories.set('DeepLinkManager', () => {
      return require('./DeepLinkManager.cjs')
    })
  }

  /**
   * Load a component lazily
   * @param {string} componentName - Name of the component to load
   * @returns {Promise<any>} The loaded component
   */
  async loadComponent(componentName) {
    // Return immediately if already loaded
    if (this.loadedComponents.has(componentName)) {
      return this.getLoadedComponent(componentName)
    }

    // Return existing promise if already loading
    if (this.loadingPromises.has(componentName)) {
      return this.loadingPromises.get(componentName)
    }

    // Create loading promise
    const loadingPromise = this.createLoadingPromise(componentName)
    this.loadingPromises.set(componentName, loadingPromise)

    try {
      const component = await loadingPromise
      this.loadedComponents.add(componentName)
      this.loadingPromises.delete(componentName)
      return component
    } catch (error) {
      this.loadingPromises.delete(componentName)
      throw error
    }
  }

  /**
   * Create a loading promise for a component
   * @param {string} componentName - Name of the component
   * @returns {Promise<any>} Loading promise
   */
  async createLoadingPromise(componentName) {
    const factory = this.componentFactories.get(componentName)

    if (!factory) {
      throw new Error(`Unknown component: ${componentName}`)
    }

    return performanceOptimizer.lazyLoad(componentName, factory)
  }

  /**
   * Get a loaded component (synchronous)
   * @param {string} componentName - Name of the component
   * @returns {any} The loaded component or null
   */
  getLoadedComponent(componentName) {
    if (!this.loadedComponents.has(componentName)) {
      return null
    }

    return performanceOptimizer.lazyModules.get(componentName)
  }

  /**
   * Preload critical components
   * @param {Array<string>} componentNames - Names of components to preload
   */
  async preloadCriticalComponents(componentNames) {
    const preloadPromises = componentNames.map(async (componentName) => {
      try {
        await this.loadComponent(componentName)
      } catch (error) {
        log.warn(`⚠️ Failed to preload ${componentName}:`, error.message)
      }
    })

    await Promise.allSettled(preloadPromises)
  }

  /**
   * Load components in background after startup
   * @param {Array<string>} componentNames - Names of components to load
   */
  loadInBackground(componentNames) {
    // Use setImmediate to defer loading until after current event loop
    setImmediate(async () => {
      for (const componentName of componentNames) {
        try {
          await this.loadComponent(componentName)

          // Small delay between loads to prevent blocking
          await new Promise((resolve) => setTimeout(resolve, 100))
        } catch (error) {
          log.warn(
            `⚠️ Background load failed for ${componentName}:`,
            error.message,
          )
        }
      }
    })
  }

  /**
   * Check if a component is loaded
   * @param {string} componentName - Name of the component
   * @returns {boolean} True if loaded
   */
  isLoaded(componentName) {
    return this.loadedComponents.has(componentName)
  }

  /**
   * Check if a component is currently loading
   * @param {string} componentName - Name of the component
   * @returns {boolean} True if loading
   */
  isLoading(componentName) {
    return this.loadingPromises.has(componentName)
  }

  /**
   * Get loading status for all components
   * @returns {Object} Status object
   */
  getStatus() {
    const allComponents = Array.from(this.componentFactories.keys())

    return {
      total: allComponents.length,
      loaded: this.loadedComponents.size,
      loading: this.loadingPromises.size,
      components: allComponents.map((name) => ({
        name,
        loaded: this.isLoaded(name),
        loading: this.isLoading(name),
      })),
    }
  }

  /**
   * Cleanup all loaded components
   */
  cleanup() {
    // Clear all loading promises
    this.loadingPromises.clear()

    // Clear loaded components set
    this.loadedComponents.clear()

    // Component cleanup is handled by performance optimizer
  }
}

// Component loading priorities
const LOADING_PRIORITIES = {
  // Critical components - load immediately
  critical: ['WindowManager', 'ConfigManager', 'WindowStateManager'],

  // High priority - load after critical components
  high: ['IPCErrorHandler', 'APIBridge', 'MenuManager'],

  // Medium priority - load in background after startup
  medium: ['SystemTrayManager', 'NotificationManager', 'ShortcutManager'],

  // Low priority - load when needed
  low: ['AutoUpdater', 'SystemIntegrationErrorHandler'],
}

// Export singleton instance
const lazyLoadManager = new LazyLoadManager()

module.exports = {
  LazyLoadManager,
  lazyLoadManager,
  LOADING_PRIORITIES,
}
