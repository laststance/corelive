/**
 * Memory Profiler for Electron Application
 *
 * This module provides memory monitoring, profiling, and cleanup
 * functionality to optimize memory usage and prevent memory leaks.
 */

const { EventEmitter } = require('events')

const { app, BrowserWindow } = require('electron')

class MemoryProfiler extends EventEmitter {
  constructor(options = {}) {
    super()

    this.options = {
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      warningThreshold: options.warningThreshold || 100 * 1024 * 1024, // 100MB
      criticalThreshold: options.criticalThreshold || 200 * 1024 * 1024, // 200MB
      enableGC: options.enableGC !== false, // Enable by default
      enableLogging: options.enableLogging !== false,
      maxHistorySize: options.maxHistorySize || 100,
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

    console.log('🔍 Starting memory monitoring...')
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

    console.log('⏹️ Stopping memory monitoring...')
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
        console.warn(
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
      console.warn(`🚨 Critical memory usage: ${this.formatBytes(totalMemory)}`)
      this.emit('memory-critical', snapshot)
      this.performCleanup('critical')
    } else if (totalMemory > this.options.warningThreshold) {
      console.warn(`⚠️ High memory usage: ${this.formatBytes(totalMemory)}`)
      this.emit('memory-warning', snapshot)
      this.performCleanup('warning')
    }
  }

  /**
   * Handle memory warning events
   */
  handleMemoryWarning() {
    console.warn('⚠️ System memory warning received')
    this.performCleanup('system-warning')
  }

  /**
   * Perform memory cleanup
   * @param {string} level - Cleanup level ('warning', 'critical', 'system-warning')
   */
  performCleanup(level = 'warning') {
    console.log(`🧹 Performing ${level} memory cleanup...`)

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
      const afterCleanup = this.checkMemoryUsage()
      console.log(
        `✅ Cleanup completed. Memory usage: ${this.formatBytes(afterCleanup.totalHeapUsed)}`,
      )
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
      console.log(`🗑️ Cleared ${clearedCount} modules from cache`)
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
        console.error('Cleanup callback failed:', error)
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
    const main = snapshot.mainProcess
    const total = snapshot.totalHeapUsed

    console.log(
      `📊 Memory: Main ${this.formatBytes(main.heapUsed)} | Total ${this.formatBytes(total)} | RSS ${this.formatBytes(main.rss)}`,
    )
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
    console.log('🧹 Cleaning up memory profiler...')

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
