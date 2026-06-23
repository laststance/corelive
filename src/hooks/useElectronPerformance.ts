import { useState, useEffect } from 'react'

import { log } from '../lib/logger'

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
    current: unknown
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

const NOT_ELECTRON_ERROR = 'Not running in Electron environment'

function buildMockMetrics(): PerformanceMetrics {
  return {
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
}

async function fetchPerformanceSnapshot(): Promise<{
  metrics: PerformanceMetrics
  startupTime: number
}> {
  return {
    metrics: buildMockMetrics(),
    startupTime: performance.now(),
  }
}

export function useElectronPerformance(): UseElectronPerformanceReturn {
  const isElectron =
    typeof window !== 'undefined' && Boolean(window.electronAPI)

  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(isElectron)
  const [error, setError] = useState<string | null>(
    isElectron ? null : NOT_ELECTRON_ERROR,
  )
  const [startupTime, setStartupTime] = useState<number | null>(null)

  const refreshMetrics = async () => {
    if (!isElectron) {
      return
    }

    try {
      const { metrics: metricsData, startupTime: startupTimeData } =
        await fetchPerformanceSnapshot()

      setMetrics(metricsData)
      setStartupTime(startupTimeData)
      setError(null)
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch performance metrics'
      setError(errorMessage)
      log.error('Failed to fetch performance metrics:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const triggerCleanup = async () => {
    if (!isElectron) {
      throw new Error(NOT_ELECTRON_ERROR)
    }

    try {
      // Mock cleanup for now — refresh metrics after cleanup
      await refreshMetrics()
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to trigger cleanup'
      setError(errorMessage)
      throw err
    }
  }

  // Initial load and periodic refresh — state updates happen after await
  useEffect(() => {
    if (!isElectron) {
      return
    }

    let cancelled = false

    const loadMetrics = async () => {
      try {
        const { metrics: metricsData, startupTime: startupTimeData } =
          await fetchPerformanceSnapshot()

        if (cancelled) {
          return
        }

        setMetrics(metricsData)
        setStartupTime(startupTimeData)
        setError(null)
      } catch (err) {
        if (cancelled) {
          return
        }

        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to fetch performance metrics'
        setError(errorMessage)
        log.error('Failed to fetch performance metrics:', err)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadMetrics()

    const interval = setInterval(() => {
      void loadMetrics()
    }, 30000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isElectron])

  return {
    metrics,
    isLoading: isElectron ? isLoading : false,
    error: isElectron ? error : NOT_ELECTRON_ERROR,
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
