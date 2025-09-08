import { useRouter } from 'next/navigation'
import { useEffect, useCallback, useRef } from 'react'

import { log } from '../lib/logger'

interface DeepLinkTask {
  id: string
  title: string
  description?: string
  completed: boolean
  priority?: string
  dueDate?: string
}

interface DeepLinkEventData {
  task?: DeepLinkTask
  params?: Record<string, any>
  view?: string
  query?: string
  filter?: string
  title?: string
  description?: string
  priority?: string
  dueDate?: string
}

interface UseElectronDeepLinkOptions {
  onTaskFocus?: (task: DeepLinkTask, params?: Record<string, any>) => void
  onTaskCreate?: (data: Partial<DeepLinkTask>) => void
  onTaskCreated?: (task: DeepLinkTask) => void
  onNavigate?: (view: string, params?: Record<string, any>) => void
  onSearch?: (query: string, filter?: string) => void
}

/**
 * Hook for handling Electron deep linking events
 * Provides utilities for generating and handling deep links
 */
export function useElectronDeepLink(options: UseElectronDeepLinkOptions = {}) {
  const router = useRouter()
  const optionsRef = useRef(options)

  // Update options ref when options change
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  // Handle task focus event
  const handleTaskFocus = useCallback(
    (event: any, data: DeepLinkEventData) => {
      if (data.task && optionsRef.current.onTaskFocus) {
        optionsRef.current.onTaskFocus(data.task, data.params)
      } else if (data.task) {
        // Default behavior: navigate to task
        router.push(`/home?focus=${data.task.id}`)
      }
    },
    [router],
  )

  // Handle task creation event
  const handleTaskCreate = useCallback(
    (event: any, data: DeepLinkEventData) => {
      if (optionsRef.current.onTaskCreate) {
        optionsRef.current.onTaskCreate({
          title: data.title,
          description: data.description,
          priority: data.priority,
          dueDate: data.dueDate,
        })
      } else {
        // Default behavior: navigate to create task with pre-filled data
        const params = new URLSearchParams()
        if (data.title) params.set('title', data.title)
        if (data.description) params.set('description', data.description)
        if (data.priority) params.set('priority', data.priority)
        if (data.dueDate) params.set('dueDate', data.dueDate)

        router.push(`/home?create=true&${params.toString()}`)
      }
    },
    [router],
  )

  // Handle task created event
  const handleTaskCreated = useCallback(
    (event: any, data: DeepLinkEventData) => {
      if (data.task && optionsRef.current.onTaskCreated) {
        optionsRef.current.onTaskCreated(data.task)
      } else if (data.task) {
        // Default behavior: navigate to the created task
        router.push(`/home?focus=${data.task.id}`)
      }
    },
    [router],
  )

  // Handle navigation event
  const handleNavigate = useCallback(
    (event: any, data: DeepLinkEventData) => {
      if (data.view && optionsRef.current.onNavigate) {
        optionsRef.current.onNavigate(data.view, data.params)
      } else if (data.view) {
        // Default behavior: navigate to view
        const params = data.params
          ? `?${new URLSearchParams(data.params).toString()}`
          : ''
        router.push(`/${data.view}${params}`)
      }
    },
    [router],
  )

  // Handle search event
  const handleSearch = useCallback(
    (event: any, data: DeepLinkEventData) => {
      if (optionsRef.current.onSearch) {
        optionsRef.current.onSearch(data.query || '', data.filter)
      } else {
        // Default behavior: navigate to home with search
        const params = new URLSearchParams()
        if (data.query) params.set('search', data.query)
        if (data.filter) params.set('filter', data.filter)

        router.push(`/home?${params.toString()}`)
      }
    },
    [router],
  )

  // Set up event listeners
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return
    }

    // Register event listeners
    const cleanupFunctions = [
      window.electronAPI.on('deep-link-focus-task', handleTaskFocus),
      window.electronAPI.on('deep-link-create-task', handleTaskCreate),
      window.electronAPI.on('deep-link-task-created', handleTaskCreated),
      window.electronAPI.on('deep-link-navigate', handleNavigate),
      window.electronAPI.on('deep-link-search', handleSearch),
    ].filter(Boolean)

    // Cleanup function
    return () => {
      cleanupFunctions.forEach((cleanup) => {
        if (typeof cleanup === 'function') {
          cleanup()
        }
      })
    }
  }, [
    handleTaskFocus,
    handleTaskCreate,
    handleTaskCreated,
    handleNavigate,
    handleSearch,
  ])

  // Generate deep link URL
  const generateDeepLink = useCallback(
    async (action: string, params: Record<string, any> = {}) => {
      if (typeof window === 'undefined' || !window.electronAPI?.deepLink) {
        return null
      }

      try {
        return await window.electronAPI.deepLink.generateUrl(action, params)
      } catch (error) {
        log.error('Failed to generate deep link:', error)
        return null
      }
    },
    [],
  )

  // Get example deep link URLs
  const getExampleUrls = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.deepLink) {
      return {}
    }

    try {
      return await window.electronAPI.deepLink.getExamples()
    } catch (error) {
      log.error('Failed to get deep link examples:', error)
      return {}
    }
  }, [])

  // Handle deep link URL manually
  const handleDeepLinkUrl = useCallback(async (url: string) => {
    if (typeof window === 'undefined' || !window.electronAPI?.deepLink) {
      return false
    }

    try {
      return await window.electronAPI.deepLink.handleUrl(url)
    } catch (error) {
      log.error('Failed to handle deep link URL:', error)
      return false
    }
  }, [])

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  return {
    isElectron,
    generateDeepLink,
    getExampleUrls,
    handleDeepLinkUrl,
  }
}

// Utility functions for common deep link patterns
export const deepLinkUtils = {
  /**
   * Generate a task deep link
   */
  taskLink: (taskId: string) => `corelive://task/${taskId}`,

  /**
   * Generate a create task deep link
   */
  createTaskLink: (title?: string, description?: string, priority?: string) => {
    const params = new URLSearchParams()
    if (title) params.set('title', title)
    if (description) params.set('description', description)
    if (priority) params.set('priority', priority)

    return `corelive://create?${params.toString()}`
  },

  /**
   * Generate a search deep link
   */
  searchLink: (query: string, filter?: string) => {
    const params = new URLSearchParams()
    params.set('query', query)
    if (filter) params.set('filter', filter)

    return `corelive://search?${params.toString()}`
  },

  /**
   * Generate a view deep link
   */
  viewLink: (view: string, params?: Record<string, string>) => {
    const searchParams = params
      ? `?${new URLSearchParams(params).toString()}`
      : ''
    return `corelive://view/${view}${searchParams}`
  },

  /**
   * Parse a deep link URL
   */
  parseUrl: (url: string) => {
    try {
      const parsedUrl = new URL(url)

      if (parsedUrl.protocol !== 'corelive:') {
        return null
      }

      const action = parsedUrl.hostname
      const path = parsedUrl.pathname
      const params = Object.fromEntries(parsedUrl.searchParams)

      return {
        action,
        path,
        params,
        hash: parsedUrl.hash,
      }
    } catch (error) {
      log.error('Failed to parse deep link URL:', error)
      return null
    }
  },
}
