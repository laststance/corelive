'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import React, { useSyncExternalStore } from 'react'

import { useORPCUtils } from '@/lib/orpc/react-query'

import { FloatingNavigator, type FloatingTodo } from './FloatingNavigator'

/**
 * Window interface for Electron floating navigator window controls.
 *
 * In WebView architecture, data operations use oRPC (same as web).
 * This interface only exposes window controls via Electron IPC.
 */
declare global {
  interface Window {
    floatingNavigatorAPI?: {
      window: {
        close(): Promise<void>
        minimize(): Promise<void>
        toggleAlwaysOnTop(): Promise<boolean>
        focusMainWindow(): Promise<void>
        getBounds(): Promise<{
          x: number
          y: number
          width: number
          height: number
        } | null>
        setBounds(bounds: {
          x?: number
          y?: number
          width?: number
          height?: number
        }): Promise<void>
        isAlwaysOnTop(): Promise<boolean>
      }
      on(channel: string, callback: (...args: unknown[]) => void): () => void
      removeListener(
        channel: string,
        callback: (...args: unknown[]) => void,
      ): void
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
 * Uses useSyncExternalStore for proper SSR hydration.
 *
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

/**
 * FloatingNavigatorContainer - Container component for Floating Navigator.
 *
 * In WebView architecture:
 * - Data operations use oRPC (same as web app via https://corelive.app/api/orpc)
 * - Window controls use Electron IPC (close, minimize, always-on-top)
 *
 * This component provides the same functionality as the web app's todo list,
 * but in a compact floating window format with Electron-specific controls.
 */
export function FloatingNavigatorContainer() {
  const orpc = useORPCUtils()
  const queryClient = useQueryClient()

  // SSR-safe mount detection using useSyncExternalStore
  const isMounted = useSyncExternalStore(
    mountStore.subscribe,
    mountStore.getSnapshot,
    mountStore.getServerSnapshot,
  )

  // Check if we're in Electron floating navigator environment (for window controls)
  const isFloatingNavigator =
    isMounted && typeof window !== 'undefined' && window.floatingNavigatorAPI

  // Fetch todos using oRPC (same as web app)
  const { data, isLoading, error } = useQuery(
    orpc.todo.list.queryOptions({
      input: { completed: false, limit: 100, offset: 0 },
    }),
  )

  // Todo toggle mutation
  const toggleMutation = useMutation(
    orpc.todo.toggle.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  // Todo create mutation
  const createMutation = useMutation(
    orpc.todo.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  // Todo update mutation
  const updateMutation = useMutation(
    orpc.todo.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  // Todo delete mutation
  const deleteMutation = useMutation(
    orpc.todo.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  /**
   * Handle task toggle - uses oRPC mutation
   */
  const handleTaskToggle = (id: string) => {
    const todoId = parseInt(id, 10)
    if (!isNaN(todoId)) {
      toggleMutation.mutate({ id: todoId })
    }
  }

  /**
   * Handle task creation - uses oRPC mutation
   */
  const handleTaskCreate = (title: string) => {
    createMutation.mutate({ text: title })
  }

  /**
   * Handle task edit - uses oRPC mutation
   */
  const handleTaskEdit = (id: string, title: string) => {
    const todoId = parseInt(id, 10)
    if (!isNaN(todoId)) {
      updateMutation.mutate({ id: todoId, data: { text: title } })
    }
  }

  /**
   * Handle task delete - uses oRPC mutation
   */
  const handleTaskDelete = (id: string) => {
    const todoId = parseInt(id, 10)
    if (!isNaN(todoId)) {
      deleteMutation.mutate({ id: todoId })
    }
  }

  // Transform todos to FloatingTodo format
  const todos: FloatingTodo[] = (data?.todos ?? []).map((todo) => ({
    id: todo.id.toString(),
    text: todo.text,
    completed: todo.completed,
    createdAt: new Date(todo.createdAt),
  }))

  // Show message if not in Electron floating navigator
  if (!isFloatingNavigator) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          Floating navigator only available in desktop app
        </p>
      </div>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading tasks...</p>
      </div>
    )
  }

  // Show error state
  if (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to load tasks'

    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background p-4">
        <p className="mb-2 text-sm text-destructive">{errorMessage}</p>
        <button
          onClick={async () =>
            queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
          }
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
