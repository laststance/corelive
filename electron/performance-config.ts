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

import { app } from 'electron'

import { log } from './logger'

// ============================================================================
// Type Definitions
// ============================================================================

/** Memory threshold configuration */
interface MemoryThresholds {
  /** Warning threshold in bytes (log warning) */
  warning: number
  /** Critical threshold in bytes (force cleanup) */
  critical: number
}

/** Startup performance metrics */
interface StartupMetrics {
  /** App start timestamp */
  startTime: number
  /** Count of lazy-loaded modules */
  modulesLoaded: number
  /** Count of windows created */
  windowsCreated: number
}

/** Memory metrics in MB */
interface MemoryMetrics {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
}

/** Module metrics */
interface ModuleMetrics {
  loaded: number
  cached: number
  lazyLoaded: number
}

/** Complete performance metrics */
export interface PerformanceMetrics {
  uptime: number
  memory: MemoryMetrics
  modules: ModuleMetrics
  windows: number
}

/** Optimization level configuration */
export interface OptimizationLevel {
  /** Enable lazy loading of modules */
  enableLazyLoading: boolean
  /** Enable memory usage monitoring */
  enableMemoryMonitoring: boolean
  /** Memory check interval in milliseconds (0 = disabled) */
  memoryCheckInterval: number
  /** Enable module caching */
  enableModuleCaching: boolean
}

/** Module loader function type */
type ModuleLoader<T> = () => T

// ============================================================================
// Performance Optimizer Class
// ============================================================================

/**
 * Manages performance optimizations throughout the application lifecycle.
 *
 * This class is instantiated once and provides:
 * - Lazy module loading system
 * - Memory usage monitoring
 * - Automatic cleanup triggers
 * - Performance metrics tracking
 */
export class PerformanceOptimizer {
  /** Cache for lazily loaded modules */
  private lazyModules: Map<string, unknown>

  /** Memory usage thresholds (in bytes) */
  private memoryThresholds: MemoryThresholds

  /** Tracks active monitoring intervals for cleanup */
  private cleanupIntervals: Map<string, ReturnType<typeof setInterval>>

  /** Startup performance metrics */
  public startupMetrics: StartupMetrics

  constructor() {
    this.lazyModules = new Map()

    this.memoryThresholds = {
      warning: 100 * 1024 * 1024, // 100MB - log warning
      critical: 200 * 1024 * 1024, // 200MB - force cleanup
    }

    this.cleanupIntervals = new Map()

    this.startupMetrics = {
      startTime: Date.now(),
      modulesLoaded: 0,
      windowsCreated: 0,
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
   * The module is loaded on first access and cached for subsequent calls.
   *
   * @param moduleName - Identifier for the module (for caching)
   * @param loader - Function that requires/imports the module
   * @returns The loaded module (cached after first load)
   * @throws Error if module fails to load
   *
   * @example
   * ```typescript
   * const autoUpdater = performanceOptimizer.lazyLoad(
   *   'AutoUpdater',
   *   () => require('./AutoUpdater')
   * )
   * ```
   */
  lazyLoad<T>(moduleName: string, loader: ModuleLoader<T>): T {
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
    return this.lazyModules.get(moduleName) as T
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
   */
  startMemoryMonitoring(): void {
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
   * Perform memory cleanup operations.
   */
  performMemoryCleanup(): void {
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
   * Clear non-essential modules from require cache.
   *
   * Protects:
   * - Essential Node.js/Electron modules
   * - node_modules dependencies
   * - Lazy-loaded singleton components (to preserve their instances)
   */
  private clearNonEssentialModuleCache(): void {
    const essentialModules = ['electron', 'path', 'fs', 'os', 'crypto']

    // Get names of lazy-loaded modules to protect them from cache clearing
    // These are singleton components that must not be re-imported
    const lazyLoadedModuleNames = Array.from(this.lazyModules.keys())

    Object.keys(require.cache).forEach((modulePath) => {
      // Protect essential Node.js/Electron modules and node_modules
      const isEssential = essentialModules.some(
        (essential) =>
          modulePath.includes(essential) || modulePath.includes('node_modules'),
      )

      // Protect lazy-loaded singleton components
      // Check if the module path contains any of the lazy-loaded module names
      const isLazyLoaded = lazyLoadedModuleNames.some((name) =>
        modulePath.includes(name),
      )

      if (!isEssential && !isLazyLoaded) {
        delete require.cache[modulePath]
      }
    })
  }

  /**
   * Optimize startup by deferring non-critical operations.
   *
   * @param criticalInit - Critical initialization function
   * @param deferredInit - Deferred initialization function
   */
  async optimizeStartup(
    criticalInit: () => Promise<void>,
    deferredInit: () => Promise<void>,
  ): Promise<void> {
    // Run critical initialization first
    await criticalInit()

    // Defer non-critical initialization
    setImmediate(async () => {
      try {
        await deferredInit()
        // Log startup completion time for performance analysis
        const totalTime = Date.now() - this.startupMetrics.startTime
        log.info(`✅ Startup complete in ${totalTime}ms`)
      } catch (error) {
        log.error('❌ Deferred initialization failed:', error)
      }
    })
  }

  /**
   * Create a debounced function to prevent excessive calls.
   * Preserves the caller's `this` context.
   *
   * @param func - Function to debounce
   * @param delay - Delay in milliseconds
   * @returns Debounced function
   */
  debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    delay: number,
  ): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    // Use regular function to preserve `this` context
    return function (this: unknown, ...args: Parameters<T>): void {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => func.apply(this, args), delay)
    }
  }

  /**
   * Create a throttled function to limit call frequency.
   * Preserves the caller's `this` context.
   *
   * @param func - Function to throttle
   * @param limit - Time limit in milliseconds
   * @returns Throttled function
   */
  throttle<T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number,
  ): (...args: Parameters<T>) => void {
    let inThrottle = false

    // Use regular function to preserve `this` context
    return function (this: unknown, ...args: Parameters<T>): void {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => (inThrottle = false), limit)
      }
    }
  }

  /**
   * Preload critical resources.
   *
   * @param resources - Array of resource paths
   */
  async preloadResources(resources: string[]): Promise<void> {
    const preloadPromises = resources.map(async (resource) => {
      try {
        if (resource.endsWith('.js') || resource.endsWith('.cjs')) {
          require(resource)
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        log.warn(`⚠️ Failed to preload ${resource}:`, errorMessage)
      }
    })

    await Promise.allSettled(preloadPromises)
  }

  /**
   * Get performance metrics.
   *
   * @returns Performance metrics object
   */
  getMetrics(): PerformanceMetrics {
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
   * Cleanup all performance monitoring.
   */
  cleanup(): void {
    // Clear all intervals
    this.cleanupIntervals.forEach((interval) => {
      clearInterval(interval)
    })
    this.cleanupIntervals.clear()

    // Clear lazy modules
    this.lazyModules.clear()
  }
}

// ============================================================================
// Optimization Level Configurations
// ============================================================================

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
export const OPTIMIZATION_LEVELS: Record<string, OptimizationLevel> = {
  /**
   * Development mode - prioritizes debugging over performance.
   *
   * Settings:
   * - Lazy loading OFF: All modules load immediately for easier debugging
   * - Memory monitoring ON: Helps catch memory leaks during development
   * - Check interval: 60s (less frequent to reduce noise)
   * - Module caching OFF: Support hot reload
   */
  development: {
    enableLazyLoading: false,
    enableMemoryMonitoring: true,
    memoryCheckInterval: 60000,
    enableModuleCaching: false,
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
    enableLazyLoading: true,
    enableMemoryMonitoring: true,
    memoryCheckInterval: 30000,
    enableModuleCaching: true,
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
    enableLazyLoading: true,
    enableMemoryMonitoring: false,
    memoryCheckInterval: 0,
    enableModuleCaching: true,
  },
} as const

// ============================================================================
// Exports
// ============================================================================

/** Singleton instance */
export const performanceOptimizer = new PerformanceOptimizer()
