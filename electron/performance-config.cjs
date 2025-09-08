/**
 * Performance optimization configuration for Electron
 *
 * This module provides configuration and utilities for optimizing
 * Electron application performance, including lazy loading, memory management,
 * and startup optimization.
 */

require('path')

const { app } = require('electron')

const { log } = require('../src/lib/logger.cjs')

class PerformanceOptimizer {
  constructor() {
    this.lazyModules = new Map()
    this.memoryThresholds = {
      warning: 100 * 1024 * 1024, // 100MB
      critical: 200 * 1024 * 1024, // 200MB
    }
    this.cleanupIntervals = new Map()
    this.startupMetrics = {
      startTime: Date.now(),
      modulesLoaded: 0,
      windowsCreated: 0,
    }
  }

  /**
   * Lazy load a module only when needed
   * @param {string} moduleName - Name of the module to load
   * @param {Function} loader - Function that returns the module
   * @returns {any} The loaded module
   */
  lazyLoad(moduleName, loader) {
    if (!this.lazyModules.has(moduleName)) {
      const startTime = Date.now()

      try {
        const module = loader()
        this.lazyModules.set(moduleName, module)
        this.startupMetrics.modulesLoaded++

        // Calculate load time for potential future use
        const loadTime = Date.now() - startTime
        if (loadTime) {
          /* Load time available for logging */
        }

        return module
      } catch (error) {
        log.error(`❌ Failed to lazy load ${moduleName}:`, error)
        throw error
      }
    }

    return this.lazyModules.get(moduleName)
  }

  /**
   * Monitor memory usage and trigger cleanup if needed
   */
  startMemoryMonitoring() {
    const interval = setInterval(() => {
      const memoryUsage = process.memoryUsage()
      const heapUsed = memoryUsage.heapUsed

      if (heapUsed > this.memoryThresholds.critical) {
        log.warn(
          `🚨 Critical memory usage: ${Math.round(heapUsed / 1024 / 1024)}MB`,
        )
        this.performMemoryCleanup()
      } else if (heapUsed > this.memoryThresholds.warning) {
        log.warn(
          `⚠️ High memory usage: ${Math.round(heapUsed / 1024 / 1024)}MB`,
        )
      }
    }, 30000) // Check every 30 seconds

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

// Configuration for different optimization levels
const OPTIMIZATION_LEVELS = {
  development: {
    enableLazyLoading: false,
    enableMemoryMonitoring: true,
    memoryCheckInterval: 60000, // 1 minute
    enableModuleCaching: false,
  },
  production: {
    enableLazyLoading: true,
    enableMemoryMonitoring: true,
    memoryCheckInterval: 30000, // 30 seconds
    enableModuleCaching: true,
  },
  minimal: {
    enableLazyLoading: true,
    enableMemoryMonitoring: false,
    memoryCheckInterval: 0,
    enableModuleCaching: true,
  },
}

// Export singleton instance
const performanceOptimizer = new PerformanceOptimizer()

module.exports = {
  PerformanceOptimizer,
  performanceOptimizer,
  OPTIMIZATION_LEVELS,
}
