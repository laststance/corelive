/**
 * @fileoverview Memory Profiler for Electron Application
 *
 * Monitors and manages memory usage to prevent common Electron memory issues.
 *
 * Why memory management is critical in Electron:
 * - Each renderer process uses separate memory (Chromium multiprocess)
 * - JavaScript garbage collection isn't always aggressive enough
 * - Memory leaks accumulate over time in long-running apps
 * - Users notice when apps consume excessive RAM
 * - OS may kill app if memory usage is too high
 *
 * Common memory issues in Electron:
 * - Event listener leaks (not removing listeners)
 * - DOM node leaks (keeping references to removed elements)
 * - Large data caching without limits
 * - Multiple renderer processes not being cleaned up
 * - IPC message queuing without bounds
 *
 * This profiler helps by:
 * - Monitoring memory usage across all processes
 * - Triggering cleanup at thresholds
 * - Providing memory usage statistics
 * - Forcing garbage collection when needed
 * - Alerting when memory is critically high
 *
 * @module electron/MemoryProfiler
 */

const { EventEmitter } = require('events')

const { app, BrowserWindow } = require('electron')

const { log } = require('../src/lib/logger.cjs')

/**
 * Monitors memory usage and triggers cleanup operations.
 *
 * Features:
 * - Real-time memory monitoring
 * - Automatic garbage collection
 * - Memory usage history tracking
 * - Renderer process memory tracking
 * - Cleanup callback system
 * - Memory pressure event handling
 *
 * Extends EventEmitter to notify components of memory events.
 */
class MemoryProfiler extends EventEmitter {
  constructor(options = {}) {
    super()

    // Configuration with sensible defaults
    this.options = {
      monitoringInterval: options.monitoringInterval || 30000, // Check every 30s
      warningThreshold: options.warningThreshold || 100 * 1024 * 1024, // Warn at 100MB
      criticalThreshold: options.criticalThreshold || 200 * 1024 * 1024, // Critical at 200MB
      enableGC: options.enableGC !== false, // Force GC when needed
      enableLogging: options.enableLogging !== false,
      maxHistorySize: options.maxHistorySize || 100, // Keep last 100 snapshots
    }

    this.memoryHistory = []
    this.monitoringInterval = null
    this.isMonitoring = false
    this.cleanupCallbacks = new Set()

    // Bind methods
    this.handleMemoryWarning = this.handleMemoryWarning.bind(this)
    this.performCleanup = this.performCleanup.bind(this)
  }

  /**
   * Start memory monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true

    // Set up monitoring interval
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage()
    }, this.options.monitoringInterval)

    // Listen for system memory pressure events
    if (process.platform === 'darwin') {
      process.on('SIGTERM', this.handleMemoryWarning)
    }

    // Listen for app events
    app.on('memory-warning', this.handleMemoryWarning)
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    // Remove event listeners
    process.removeListener('SIGTERM', this.handleMemoryWarning)
    app.removeListener('memory-warning', this.handleMemoryWarning)
  }

  /**
   * Check current memory usage
   */
  checkMemoryUsage() {
    const mainProcessMemory = process.memoryUsage()
    const rendererMemory = this.getRendererMemoryUsage()

    const memorySnapshot = {
      timestamp: Date.now(),
      mainProcess: {
        heapUsed: mainProcessMemory.heapUsed,
        heapTotal: mainProcessMemory.heapTotal,
        external: mainProcessMemory.external,
        rss: mainProcessMemory.rss,
      },
      rendererProcesses: rendererMemory,
      totalHeapUsed: mainProcessMemory.heapUsed + rendererMemory.totalHeapUsed,
    }

    // Add to history
    this.addToHistory(memorySnapshot)

    // Check thresholds
    this.checkThresholds(memorySnapshot)

    // Emit memory update event
    this.emit('memory-update', memorySnapshot)

    if (this.options.enableLogging) {
      this.logMemoryUsage(memorySnapshot)
    }

    return memorySnapshot
  }

  /**
   * Get memory usage from all renderer processes
   */
  getRendererMemoryUsage() {
    const windows = BrowserWindow.getAllWindows()
    const rendererMemory = {
      processes: [],
      totalHeapUsed: 0,
    }

    windows.forEach((window, index) => {
      try {
        const webContents = window.webContents
        if (webContents && !webContents.isDestroyed()) {
          // Note: getProcessMemoryInfo is async, but we'll use a simplified approach
          const processInfo = {
            id: webContents.getProcessId(),
            type: 'renderer',
            windowId: window.id,
            // Estimated memory usage (actual measurement would require async call)
            estimatedHeapUsed: 20 * 1024 * 1024, // 20MB estimate per window
          }

          rendererMemory.processes.push(processInfo)
          rendererMemory.totalHeapUsed += processInfo.estimatedHeapUsed
        }
      } catch (error) {
        log.warn(
          `Failed to get memory info for window ${index}:`,
          error.message,
        )
      }
    })

    return rendererMemory
  }

  /**
   * Add memory snapshot to history
   * @param {Object} snapshot - Memory snapshot
   */
  addToHistory(snapshot) {
    this.memoryHistory.push(snapshot)

    // Limit history size
    if (this.memoryHistory.length > this.options.maxHistorySize) {
      this.memoryHistory.shift()
    }
  }

  /**
   * Check memory thresholds and trigger actions
   * @param {Object} snapshot - Memory snapshot
   */
  checkThresholds(snapshot) {
    const totalMemory = snapshot.totalHeapUsed

    if (totalMemory > this.options.criticalThreshold) {
      log.warn(`🚨 Critical memory usage: ${this.formatBytes(totalMemory)}`)
      this.emit('memory-critical', snapshot)
      this.performCleanup('critical')
    } else if (totalMemory > this.options.warningThreshold) {
      log.warn(`⚠️ High memory usage: ${this.formatBytes(totalMemory)}`)
      this.emit('memory-warning', snapshot)
      this.performCleanup('warning')
    }
  }

  /**
   * Handle memory warning events
   */
  handleMemoryWarning() {
    log.warn('⚠️ System memory warning received')
    this.performCleanup('system-warning')
  }

  /**
   * Perform memory cleanup
   * @param {string} level - Cleanup level ('warning', 'critical', 'system-warning')
   */
  performCleanup(level = 'warning') {
    // Force garbage collection if available
    if (this.options.enableGC && global.gc) {
      global.gc()
    }

    // Clear require cache for non-essential modules
    this.clearModuleCache()

    // Run registered cleanup callbacks
    this.runCleanupCallbacks(level)

    // Clear old memory history
    if (level === 'critical') {
      this.memoryHistory = this.memoryHistory.slice(-10) // Keep only last 10 entries
    }

    // Emit cleanup event
    this.emit('cleanup-performed', { level, timestamp: Date.now() })

    // Log memory usage after cleanup
    setTimeout(() => {
      this.checkMemoryUsage()
    }, 1000)
  }

  /**
   * Clear non-essential modules from require cache
   */
  clearModuleCache() {
    const essentialModules = [
      'electron',
      'path',
      'fs',
      'os',
      'crypto',
      'events',
      'util',
    ]

    let clearedCount = 0

    Object.keys(require.cache).forEach((modulePath) => {
      // Don't clear essential modules or node_modules
      const isEssential =
        essentialModules.some((essential) => modulePath.includes(essential)) ||
        modulePath.includes('node_modules')

      if (!isEssential) {
        delete require.cache[modulePath]
        clearedCount++
      }
    })

    if (clearedCount > 0) {
    }
  }

  /**
   * Register a cleanup callback
   * @param {Function} callback - Cleanup function
   */
  registerCleanupCallback(callback) {
    this.cleanupCallbacks.add(callback)
  }

  /**
   * Unregister a cleanup callback
   * @param {Function} callback - Cleanup function
   */
  unregisterCleanupCallback(callback) {
    this.cleanupCallbacks.delete(callback)
  }

  /**
   * Run all registered cleanup callbacks
   * @param {string} level - Cleanup level
   */
  runCleanupCallbacks(level) {
    this.cleanupCallbacks.forEach((callback) => {
      try {
        callback(level)
      } catch (error) {
        log.error('Cleanup callback failed:', error)
      }
    })
  }

  /**
   * Get memory statistics
   * @returns {Object} Memory statistics
   */
  getStatistics() {
    if (this.memoryHistory.length === 0) {
      return null
    }

    const recent = this.memoryHistory.slice(-10)
    const totalMemoryValues = recent.map((s) => s.totalHeapUsed)

    return {
      current: this.memoryHistory[this.memoryHistory.length - 1],
      average:
        totalMemoryValues.reduce((a, b) => a + b, 0) / totalMemoryValues.length,
      peak: Math.max(...totalMemoryValues),
      minimum: Math.min(...totalMemoryValues),
      trend: this.calculateTrend(totalMemoryValues),
      historySize: this.memoryHistory.length,
    }
  }

  /**
   * Calculate memory usage trend
   * @param {Array<number>} values - Memory values
   * @returns {string} Trend direction
   */
  calculateTrend(values) {
    if (values.length < 2) return 'stable'

    const first = values[0]
    const last = values[values.length - 1]
    const change = (last - first) / first

    if (change > 0.1) return 'increasing'
    if (change < -0.1) return 'decreasing'
    return 'stable'
  }

  /**
   * Log memory usage
   * @param {Object} snapshot - Memory snapshot
   */
  logMemoryUsage(snapshot) {
    // Access snapshot properties for potential future use
    if (snapshot.mainProcess && snapshot.totalHeapUsed) {
      // Memory logging implementation would go here
    }
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  /**
   * Export memory report
   * @returns {Object} Memory report
   */
  exportReport() {
    return {
      timestamp: Date.now(),
      statistics: this.getStatistics(),
      history: this.memoryHistory,
      options: this.options,
      isMonitoring: this.isMonitoring,
    }
  }

  /**
   * Cleanup profiler
   */
  cleanup() {
    this.stopMonitoring()
    this.memoryHistory = []
    this.cleanupCallbacks.clear()
    this.removeAllListeners()
  }
}

// Export singleton instance
const memoryProfiler = new MemoryProfiler()

module.exports = {
  MemoryProfiler,
  memoryProfiler,
}
