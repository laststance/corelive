/**
 * @fileoverview Performance Optimization Configuration for Electron
 *
 * This module manages performance-critical aspects of the Electron app:
 * - Lazy loading of heavy modules
 * - Memory usage monitoring and cleanup
 * - Startup time optimization
 * - Resource management strategies
 * 
 * Why performance optimization matters in Electron:
 * - Electron apps use more memory than native apps (Chromium + Node.js)
 * - Startup time affects user perception of app quality
 * - Memory leaks are common with long-running desktop apps
 * - Users expect desktop apps to be responsive
 * 
 * Key strategies implemented:
 * 1. Lazy loading: Load modules only when needed
 * 2. Memory monitoring: Track and respond to high usage
 * 3. Garbage collection: Force cleanup when needed
 * 4. Module caching: Balance memory vs performance
 * 
 * @module electron/performance-config
 */

require('path')
const { app } = require('electron')

const { log } = require('../src/lib/logger.cjs')

/**
 * Manages performance optimizations throughout the application lifecycle.
 * 
 * This class is instantiated once and provides:
 * - Lazy module loading system
 * - Memory usage monitoring
 * - Automatic cleanup triggers
 * - Performance metrics tracking
 */
class PerformanceOptimizer {
  constructor() {
    // Cache for lazily loaded modules
    this.lazyModules = new Map()
    
    // Memory usage thresholds (in bytes)
    this.memoryThresholds = {
      warning: 100 * 1024 * 1024,  // 100MB - log warning
      critical: 200 * 1024 * 1024, // 200MB - force cleanup
    }
    
    // Tracks active monitoring intervals for cleanup
    this.cleanupIntervals = new Map()
    
    // Startup performance metrics
    this.startupMetrics = {
      startTime: Date.now(),      // App start timestamp
      modulesLoaded: 0,           // Count of lazy-loaded modules
      windowsCreated: 0,          // Count of windows created
    }
  }

  /**
   * Implements lazy loading pattern for heavy modules.
   * 
   * Benefits:
   * - Faster initial startup (load only what's needed)
   * - Lower initial memory footprint
   * - Better perceived performance
   * 
   * Usage example:
   * ```js
   * const autoUpdater = performanceOptimizer.lazyLoad(
   *   'AutoUpdater',
   *   () => require('./AutoUpdater.cjs')
   * )
   * ```
   * 
   * The module is loaded on first access and cached for subsequent calls.
   * 
   * @param {string} moduleName - Identifier for the module (for caching)
   * @param {Function} loader - Function that requires/imports the module
   * @returns {any} The loaded module (cached after first load)
   * @throws {Error} If module fails to load
   */
  lazyLoad(moduleName, loader) {
    // Check cache first
    if (!this.lazyModules.has(moduleName)) {
      const startTime = Date.now()

      try {
        // Load module for the first time
        const module = loader()
        this.lazyModules.set(moduleName, module)
        this.startupMetrics.modulesLoaded++

        // Track load time for performance analysis
        const loadTime = Date.now() - startTime
        if (loadTime > 100) {
          // Warn if module takes too long to load
          log.warn(`Module ${moduleName} took ${loadTime}ms to load`)
        }

        return module
      } catch (error) {
        log.error(`❌ Failed to lazy load ${moduleName}:`, error)
        throw error // Re-throw for caller to handle
      }
    }

    // Return cached module
    return this.lazyModules.get(moduleName)
  }

  /**
   * Starts monitoring memory usage and triggers cleanup when needed.
   * 
   * Memory management is crucial for Electron apps because:
   * - Each renderer process uses its own memory
   * - Chromium's memory usage can grow over time
   * - Node.js heap has limits
   * - Users notice when apps consume too much RAM
   * 
   * Monitoring strategy:
   * - Check every 30 seconds (balanced interval)
   * - Warning at 100MB heap usage
   * - Critical/cleanup at 200MB heap usage
   * 
   * These thresholds are conservative and may need adjustment
   * based on your app's specific needs.
   */
  startMemoryMonitoring() {
    const interval = setInterval(() => {
      // Get current memory statistics
      const memoryUsage = process.memoryUsage()
      const heapUsed = memoryUsage.heapUsed

      // Check against thresholds
      if (heapUsed > this.memoryThresholds.critical) {
        log.warn(
          `🚨 Critical memory usage: ${Math.round(heapUsed / 1024 / 1024)}MB`,
        )
        // Force immediate cleanup
        this.performMemoryCleanup()
      } else if (heapUsed > this.memoryThresholds.warning) {
        // Just warn, don't cleanup yet
        log.warn(
          `⚠️ High memory usage: ${Math.round(heapUsed / 1024 / 1024)}MB`,
        )
      }
    }, 30000) // Check every 30 seconds

    // Store interval for later cleanup
    this.cleanupIntervals.set('memory', interval)
  }

  /**
   * Perform memory cleanup operations
   */
  performMemoryCleanup() {
    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    // Clear module cache for non-essential modules
    this.clearNonEssentialModuleCache()

    // Emit cleanup event for other components
    if (app) {
      app.emit('memory-cleanup')
    }
  }

  /**
   * Clear non-essential modules from require cache
   */
  clearNonEssentialModuleCache() {
    const essentialModules = ['electron', 'path', 'fs', 'os', 'crypto']

    Object.keys(require.cache).forEach((modulePath) => {
      const isEssential = essentialModules.some(
        (essential) =>
          modulePath.includes(essential) || modulePath.includes('node_modules'),
      )

      if (!isEssential && modulePath.includes('electron')) {
        delete require.cache[modulePath]
      }
    })
  }

  /**
   * Optimize startup by deferring non-critical operations
   * @param {Function} criticalInit - Critical initialization function
   * @param {Function} deferredInit - Deferred initialization function
   */
  async optimizeStartup(criticalInit, deferredInit) {
    // Run critical initialization first
    await criticalInit()

    // Defer non-critical initialization
    setImmediate(async () => {
      try {
        await deferredInit()
        // Calculate total time for potential future use
        const totalTime = Date.now() - this.startupMetrics.startTime
        if (totalTime) {
          /* Total time available for logging */
        }
      } catch (error) {
        log.error('❌ Deferred initialization failed:', error)
      }
    })
  }

  /**
   * Create a debounced function to prevent excessive calls
   * @param {Function} func - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  debounce(func, delay) {
    let timeoutId
    return (...args) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => func.apply(this, args), delay)
    }
  }

  /**
   * Create a throttled function to limit call frequency
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  throttle(func, limit) {
    let inThrottle
    return (...args) => {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => (inThrottle = false), limit)
      }
    }
  }

  /**
   * Preload critical resources
   * @param {Array<string>} resources - Array of resource paths
   */
  async preloadResources(resources) {
    const preloadPromises = resources.map(async (resource) => {
      try {
        if (resource.endsWith('.js') || resource.endsWith('.cjs')) {
          require(resource)
        }
      } catch (error) {
        log.warn(`⚠️ Failed to preload ${resource}:`, error.message)
      }
    })

    await Promise.allSettled(preloadPromises)
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    const memoryUsage = process.memoryUsage()
    const uptime = Date.now() - this.startupMetrics.startTime

    return {
      uptime,
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      modules: {
        loaded: this.startupMetrics.modulesLoaded,
        cached: Object.keys(require.cache).length,
        lazyLoaded: this.lazyModules.size,
      },
      windows: this.startupMetrics.windowsCreated,
    }
  }

  /**
   * Cleanup all performance monitoring
   */
  cleanup() {
    // Clear all intervals
    this.cleanupIntervals.forEach((interval) => {
      clearInterval(interval)
    })
    this.cleanupIntervals.clear()

    // Clear lazy modules
    this.lazyModules.clear()
  }
}

/**
 * Optimization level configurations for different environments.
 * 
 * Each level represents a different balance between:
 * - Performance optimization aggressiveness
 * - Development experience
 * - Resource usage
 * - Debugging capability
 * 
 * Choose based on your deployment scenario.
 */
const OPTIMIZATION_LEVELS = {
  /**
   * Development mode - prioritizes debugging over performance.
   * 
   * Settings:
   * - Lazy loading OFF: All modules load immediately for easier debugging
   * - Memory monitoring ON: Helps catch memory leaks during development
   * - Check interval: 60s (less frequent to reduce noise)
   * - Module caching OFF: Always get fresh modules for hot reload
   */
  development: {
    enableLazyLoading: false,       // Load everything upfront
    enableMemoryMonitoring: true,   // Catch memory issues early
    memoryCheckInterval: 60000,     // 1 minute - less intrusive
    enableModuleCaching: false,     // Support hot reload
  },
  
  /**
   * Production mode - balanced performance and stability.
   * 
   * Settings:
   * - Lazy loading ON: Faster startup, lower initial memory
   * - Memory monitoring ON: Proactive cleanup for long-running apps
   * - Check interval: 30s (frequent checks for user-facing app)
   * - Module caching ON: Better performance, lower memory churn
   */
  production: {
    enableLazyLoading: true,        // Optimize startup time
    enableMemoryMonitoring: true,   // Maintain stability
    memoryCheckInterval: 30000,     // 30 seconds - responsive to issues
    enableModuleCaching: true,      // Cache for performance
  },
  
  /**
   * Minimal mode - maximum performance, minimum overhead.
   * 
   * Use when:
   * - Running on low-end hardware
   * - Memory monitoring causes issues
   * - Maximum performance is critical
   * 
   * Trade-offs:
   * - No automatic memory cleanup
   * - May use more memory over time
   */
  minimal: {
    enableLazyLoading: true,        // Still want fast startup
    enableMemoryMonitoring: false,  // No monitoring overhead
    memoryCheckInterval: 0,         // Disabled
    enableModuleCaching: true,      // Maximum caching
  },
}

// Export singleton instance
const performanceOptimizer = new PerformanceOptimizer()

module.exports = {
  PerformanceOptimizer,
  performanceOptimizer,
  OPTIMIZATION_LEVELS,
}
