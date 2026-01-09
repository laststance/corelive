'use client'

import React, { useState, useEffect, useSyncExternalStore } from 'react'

import { log } from '../../lib/logger'

import { FloatingNavigator, type FloatingTodo } from './FloatingNavigator'

// Extend window interface for floating navigator API
declare global {
  interface Window {
    floatingNavigatorAPI?: {
      todos: {
        getTodos(): Promise<any[]>
        quickCreate(title: string): Promise<any>
        updateTodo(id: string, updates: any): Promise<any>
        deleteTodo(id: string): Promise<void>
        toggleComplete(id: string): Promise<any>
      }
      auth: {
        ensureUserSync(): Promise<void>
      }
      window: {
        close(): Promise<void>
        minimize(): Promise<void>
        toggleAlwaysOnTop(): Promise<boolean>
        focusMainWindow(): Promise<void>
      }
      on(channel: string, callback: Function): () => void
      removeListener(channel: string, callback: Function): void
    }
    floatingNavigatorEnv?: {
      isElectron: boolean
      isFloatingNavigator: boolean
      platform: string
    }
  }
}

/**
 * Creates a store for tracking mount state (SSR-safe)
 * @returns Store interface for useSyncExternalStore
 */
function createMountStore() {
  let isMounted = false
  const listeners = new Set<() => void>()

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      // Set mounted on first subscription (client-side only)
      if (!isMounted && typeof window !== 'undefined') {
        isMounted = true
        // Notify after microtask to avoid setState during render
        queueMicrotask(() => listeners.forEach((l) => l()))
      }
      return () => listeners.delete(listener)
    },
    getSnapshot: () => isMounted,
    getServerSnapshot: () => false,
  }
}

// Singleton mount store to avoid recreation
const mountStore = createMountStore()

export function FloatingNavigatorContainer() {
  const [todos, setTodos] = useState<FloatingTodo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // SSR-safe mount detection using useSyncExternalStore
  const isMounted = useSyncExternalStore(
    mountStore.subscribe,
    mountStore.getSnapshot,
    mountStore.getServerSnapshot,
  )

  // Check if we're in Electron floating navigator environment
  // Only after component mounts to avoid hydration mismatch
  const isFloatingNavigator =
    isMounted && typeof window !== 'undefined' && window.floatingNavigatorAPI

  // Load todos from Floating Navigator API
  const loadTodos = async () => {
    if (!isFloatingNavigator) {
      setError('Floating Navigator API not available')
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)

      // First, ensure user is synced with the Electron API bridge
      try {
        await window.floatingNavigatorAPI!.auth.ensureUserSync()
      } catch (authError) {
        log.warn('Auth sync warning (will retry on getData):', authError)
        // Continue anyway - getTodos will try to sync if needed
      }

      const todoData =
        (await window.floatingNavigatorAPI!.todos.getTodos()) as any

      // Transform the data to match our interface
      const todosArray = Array.isArray(todoData)
        ? todoData
        : todoData?.todos || []
      const transformedTodos: FloatingTodo[] = todosArray.map((todo: any) => ({
        id: todo.id.toString(),
        text: todo.text || todo.title,
        completed: todo.completed,
        createdAt: new Date(todo.createdAt),
      }))

      setTodos(transformedTodos)
      setError(null)
    } catch (err) {
      log.error('Failed to load todos:', err)
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load tasks'

      // Check if it's an authentication issue
      if (
        errorMessage.includes('Active user not set') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('Unauthorized')
      ) {
        setError('Please open the main app first to authenticate')
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Load todos after mounting and Electron API is detected
  useEffect(() => {
    if (!isFloatingNavigator) return
    loadTodos()

    // Listen for todo updates from main process
    const handleTodoUpdate = () => {
      loadTodos()
    }

    const handleTodoCreated = () => {
      loadTodos()
    }

    const handleTodoDeleted = () => {
      loadTodos()
    }

    // Set up event listeners
    const cleanupUpdate = window.floatingNavigatorAPI!.on(
      'todo-updated',
      handleTodoUpdate,
    )
    const cleanupCreated = window.floatingNavigatorAPI!.on(
      'todo-created',
      handleTodoCreated,
    )
    const cleanupDeleted = window.floatingNavigatorAPI!.on(
      'todo-deleted',
      handleTodoDeleted,
    )

    return () => {
      cleanupUpdate?.()
      cleanupCreated?.()
      cleanupDeleted?.()
    }
  }, [isFloatingNavigator])

  const handleTaskToggle = async (id: string) => {
    if (!isFloatingNavigator) return

    try {
      const todo = todos.find((t) => t.id === id)
      if (!todo) return

      await window.floatingNavigatorAPI!.todos.toggleComplete(id)

      // Optimistically update local state
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
      )
    } catch (err) {
      log.error('Failed to toggle todo:', err)
      // Reload to get correct state
      loadTodos()
    }
  }

  const handleTaskCreate = async (title: string) => {
    if (!isFloatingNavigator) return

    try {
      const newTodo =
        await window.floatingNavigatorAPI!.todos.quickCreate(title)

      // Add to local state
      setTodos((prev) => [
        ...prev,
        {
          id: newTodo.id.toString(),
          text: newTodo.text || newTodo.title,
          completed: newTodo.completed,
          createdAt: new Date(newTodo.createdAt),
        },
      ])
    } catch (err) {
      log.error('Failed to create todo:', err)
      // Reload to get correct state
      loadTodos()
    }
  }

  const handleTaskEdit = async (id: string, title: string) => {
    if (!isFloatingNavigator) return

    try {
      await window.floatingNavigatorAPI!.todos.updateTodo(id, { title })

      // Update local state
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, text: title } : t)),
      )
    } catch (err) {
      log.error('Failed to update todo:', err)
      // Reload to get correct state
      loadTodos()
    }
  }

  const handleTaskDelete = async (id: string) => {
    if (!isFloatingNavigator) return

    try {
      await window.floatingNavigatorAPI!.todos.deleteTodo(id)

      // Remove from local state
      setTodos((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      log.error('Failed to delete todo:', err)
      // Reload to get correct state
      loadTodos()
    }
  }

  if (!isFloatingNavigator) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          Floating navigator only available in desktop app
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading tasks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background p-4">
        <p className="mb-2 text-sm text-destructive">{error}</p>
        <button
          onClick={loadTodos}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <FloatingNavigator
      todos={todos}
      onTaskToggle={handleTaskToggle}
      onTaskCreate={handleTaskCreate}
      onTaskEdit={handleTaskEdit}
      onTaskDelete={handleTaskDelete}
    />
  )
}
