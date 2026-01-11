/**
 * @fileoverview Memory Profiler for Electron Application
 *
 * Monitors and manages memory usage to prevent common Electron memory issues.
 *
 * @module electron/MemoryProfiler
 */

import { EventEmitter } from 'events'

import { app, BrowserWindow } from 'electron'

import { log } from './logger'

// ============================================================================
// Type Definitions
// ============================================================================

/** Memory profiler options */
export interface MemoryProfilerOptions {
  monitoringInterval?: number
  warningThreshold?: number
  criticalThreshold?: number
  enableGC?: boolean
  enableLogging?: boolean
  maxHistorySize?: number
}

/** Main process memory info */
interface MainProcessMemory {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
}

/** Renderer process info */
interface RendererProcessInfo {
  id: number
  type: string
  windowId: number
  estimatedHeapUsed: number
}

/** Renderer memory info */
interface RendererMemory {
  processes: RendererProcessInfo[]
  totalHeapUsed: number
}

/** Memory snapshot */
export interface MemorySnapshot {
  timestamp: number
  mainProcess: MainProcessMemory
  rendererProcesses: RendererMemory
  totalHeapUsed: number
}

/** Memory statistics */
export interface MemoryStatistics {
  current: MemorySnapshot
  average: number
  peak: number
  minimum: number
  trend: 'increasing' | 'decreasing' | 'stable'
  historySize: number
}

/** Memory report */
export interface MemoryReport {
  timestamp: number
  statistics: MemoryStatistics | null
  history: MemorySnapshot[]
  options: Required<MemoryProfilerOptions>
  isMonitoring: boolean
}

/** Cleanup level */
type CleanupLevel = 'warning' | 'critical' | 'system-warning' | 'manual'

/** Cleanup callback */
type CleanupCallback = (level: CleanupLevel) => void

// ============================================================================
// Memory Profiler Class
// ============================================================================

/**
 * Monitors memory usage and triggers cleanup operations.
 */
export class MemoryProfiler extends EventEmitter {
  /** Configuration options */
  private options: Required<MemoryProfilerOptions>

  /** Memory history */
  private memoryHistory: MemorySnapshot[]

  /** Monitoring interval handle */
  private monitoringInterval: ReturnType<typeof setInterval> | null

  /** Whether monitoring is active */
  private isMonitoring: boolean

  /** Registered cleanup callbacks */
  private cleanupCallbacks: Set<CleanupCallback>

  constructor(options: MemoryProfilerOptions = {}) {
    super()

    this.options = {
      monitoringInterval: options.monitoringInterval ?? 30000,
      warningThreshold: options.warningThreshold ?? 100 * 1024 * 1024,
      criticalThreshold: options.criticalThreshold ?? 200 * 1024 * 1024,
      enableGC: options.enableGC !== false,
      enableLogging: options.enableLogging !== false,
      maxHistorySize: options.maxHistorySize ?? 100,
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
   * Start memory monitoring.
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage()
    }, this.options.monitoringInterval)

    if (process.platform === 'darwin') {
      process.on('SIGTERM', this.handleMemoryWarning)
    }

    // memory-warning is a macOS-specific event not in TS types
     
    ;(app as any).on('memory-warning', this.handleMemoryWarning)
  }

  /**
   * Stop memory monitoring.
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    process.removeListener('SIGTERM', this.handleMemoryWarning)
     
    ;(app as any).removeListener('memory-warning', this.handleMemoryWarning)
  }

  /**
   * Check current memory usage.
   */
  checkMemoryUsage(): MemorySnapshot {
    const mainProcessMemory = process.memoryUsage()
    const rendererMemory = this.getRendererMemoryUsage()

    const memorySnapshot: MemorySnapshot = {
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

    this.addToHistory(memorySnapshot)
    this.checkThresholds(memorySnapshot)
    this.emit('memory-update', memorySnapshot)

    if (this.options.enableLogging) {
      this.logMemoryUsage(memorySnapshot)
    }

    return memorySnapshot
  }

  /**
   * Get memory usage from all renderer processes.
   */
  private getRendererMemoryUsage(): RendererMemory {
    const windows = BrowserWindow.getAllWindows()
    const rendererMemory: RendererMemory = {
      processes: [],
      totalHeapUsed: 0,
    }

    windows.forEach((window, index) => {
      try {
        const webContents = window.webContents
        if (webContents && !webContents.isDestroyed()) {
          const processInfo: RendererProcessInfo = {
            id: webContents.getProcessId(),
            type: 'renderer',
            windowId: window.id,
            estimatedHeapUsed: 20 * 1024 * 1024, // 20MB estimate
          }

          rendererMemory.processes.push(processInfo)
          rendererMemory.totalHeapUsed += processInfo.estimatedHeapUsed
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        log.warn(`Failed to get memory info for window ${index}:`, errorMessage)
      }
    })

    return rendererMemory
  }

  /**
   * Add memory snapshot to history.
   */
  private addToHistory(snapshot: MemorySnapshot): void {
    this.memoryHistory.push(snapshot)

    if (this.memoryHistory.length > this.options.maxHistorySize) {
      this.memoryHistory.shift()
    }
  }

  /**
   * Check memory thresholds and trigger actions.
   */
  private checkThresholds(snapshot: MemorySnapshot): void {
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
   * Handle memory warning events.
   */
  private handleMemoryWarning(): void {
    log.warn('⚠️ System memory warning received')
    this.performCleanup('system-warning')
  }

  /**
   * Perform memory cleanup.
   */
  performCleanup(level: CleanupLevel = 'warning'): void {
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
      this.memoryHistory = this.memoryHistory.slice(-10)
    }

    // Emit cleanup event
    this.emit('cleanup-performed', { level, timestamp: Date.now() })

    // Log memory usage after cleanup
    setTimeout(() => {
      this.checkMemoryUsage()
    }, 1000)
  }

  /**
   * Clear non-essential modules from require cache.
   */
  private clearModuleCache(): void {
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
      const isEssential =
        essentialModules.some((essential) => modulePath.includes(essential)) ||
        modulePath.includes('node_modules')

      if (!isEssential) {
        delete require.cache[modulePath]
        clearedCount++
      }
    })

    if (clearedCount > 0) {
      // Module cache cleared
    }
  }

  /**
   * Register a cleanup callback.
   */
  registerCleanupCallback(callback: CleanupCallback): void {
    this.cleanupCallbacks.add(callback)
  }

  /**
   * Unregister a cleanup callback.
   */
  unregisterCleanupCallback(callback: CleanupCallback): void {
    this.cleanupCallbacks.delete(callback)
  }

  /**
   * Run all registered cleanup callbacks.
   */
  private runCleanupCallbacks(level: CleanupLevel): void {
    this.cleanupCallbacks.forEach((callback) => {
      try {
        callback(level)
      } catch (error) {
        log.error('Cleanup callback failed:', error)
      }
    })
  }

  /**
   * Get memory statistics.
   */
  getStatistics(): MemoryStatistics | null {
    if (this.memoryHistory.length === 0) {
      return null
    }

    const recent = this.memoryHistory.slice(-10)
    const totalMemoryValues = recent.map((s) => s.totalHeapUsed)
    const current = this.memoryHistory[this.memoryHistory.length - 1]!

    return {
      current,
      average:
        totalMemoryValues.reduce((a, b) => a + b, 0) / totalMemoryValues.length,
      peak: Math.max(...totalMemoryValues),
      minimum: Math.min(...totalMemoryValues),
      trend: this.calculateTrend(totalMemoryValues),
      historySize: this.memoryHistory.length,
    }
  }

  /**
   * Calculate memory usage trend.
   */
  private calculateTrend(
    values: number[],
  ): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable'

    const first = values[0]!
    const last = values[values.length - 1]!
    const change = (last - first) / first

    if (change > 0.1) return 'increasing'
    if (change < -0.1) return 'decreasing'
    return 'stable'
  }

  /**
   * Log memory usage.
   */
  private logMemoryUsage(snapshot: MemorySnapshot): void {
    if (snapshot.mainProcess && snapshot.totalHeapUsed) {
      // Memory logging implementation
    }
  }

  /**
   * Format bytes to human readable string.
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  /**
   * Export memory report.
   */
  exportReport(): MemoryReport {
    return {
      timestamp: Date.now(),
      statistics: this.getStatistics(),
      history: this.memoryHistory,
      options: this.options,
      isMonitoring: this.isMonitoring,
    }
  }

  /**
   * Cleanup profiler.
   */
  cleanup(): void {
    this.stopMonitoring()
    this.memoryHistory = []
    this.cleanupCallbacks.clear()
    this.removeAllListeners()
  }
}

// ============================================================================
// Exports
// ============================================================================

/** Singleton instance */
export const memoryProfiler = new MemoryProfiler()
