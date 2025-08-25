import { useState, useEffect, useCallback } from 'react'

interface PerformanceMetrics {
  optimizer: {
    uptime: number
    memory: {
      heapUsed: number
      heapTotal: number
      external: number
      rss: number
    }
    modules: {
      loaded: number
      cached: number
      lazyLoaded: number
    }
    windows: number
  }
  memory: {
    current: any
    average: number
    peak: number
    minimum: number
    trend: string
    historySize: number
  } | null
  lazyLoad: {
    total: number
    loaded: number
    loading: number
    components: Array<{
      name: string
      loaded: boolean
      loading: boolean
    }>
  }
}

interface UseElectronPerformanceReturn {
  metrics: PerformanceMetrics | null
  isLoading: boolean
  error: string | null
  refreshMetrics: () => Promise<void>
  triggerCleanup: () => Promise<void>
  startupTime: number | null
}

export function useElectronPerformance(): UseElectronPerformanceReturn {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startupTime, setStartupTime] = useState<number | null>(null)

  // Check if we're in Electron environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI

  const refreshMetrics = useCallback(async () => {
    if (!isElectron) {
      setError('Not running in Electron environment')
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // For now, return mock data since performance APIs aren't exposed yet
      const metricsData = {
        optimizer: {
          uptime: Date.now() - performance.now(),
          memory: {
            heapUsed: 50,
            heapTotal: 100,
            external: 10,
            rss: 120,
          },
          modules: {
            loaded: 15,
            cached: 50,
            lazyLoaded: 5,
          },
          windows: 1,
        },
        memory: null,
        lazyLoad: {
          total: 10,
          loaded: 8,
          loading: 0,
          components: [],
        },
      }
      const startupTimeData = performance.now()

      setMetrics(metricsData)
      setStartupTime(startupTimeData)
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch performance metrics'
      setError(errorMessage)
      console.error('Failed to fetch performance metrics:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isElectron])

  const triggerCleanup = useCallback(async () => {
    if (!isElectron) {
      throw new Error('Not running in Electron environment')
    }

    try {
      // Mock cleanup for now
      console.log('Performance cleanup triggered')
      // Refresh metrics after cleanup
      await refreshMetrics()
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to trigger cleanup'
      setError(errorMessage)
      throw err
    }
  }, [isElectron, refreshMetrics])

  // Initial load and periodic refresh
  useEffect(() => {
    if (!isElectron) {
      setError('Not running in Electron environment')
      setIsLoading(false)
      return
    }

    // Initial load
    refreshMetrics()

    // Set up periodic refresh (every 30 seconds)
    const interval = setInterval(refreshMetrics, 30000)

    return () => {
      clearInterval(interval)
    }
  }, [isElectron, refreshMetrics])

  return {
    metrics,
    isLoading,
    error,
    refreshMetrics,
    triggerCleanup,
    startupTime,
  }
}

// Helper functions for formatting metrics
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function formatUptime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

export function getMemoryTrendColor(trend: string): string {
  switch (trend) {
    case 'increasing':
      return 'text-red-500'
    case 'decreasing':
      return 'text-green-500'
    case 'stable':
    default:
      return 'text-blue-500'
  }
}

export function getMemoryTrendIcon(trend: string): string {
  switch (trend) {
    case 'increasing':
      return '↗️'
    case 'decreasing':
      return '↘️'
    case 'stable':
    default:
      return '➡️'
  }
}
