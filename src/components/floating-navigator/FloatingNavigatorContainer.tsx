'use client'

import React, { useState, useEffect } from 'react'

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

export function FloatingNavigatorContainer() {
  const [todos, setTodos] = useState<FloatingTodo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if we're in Electron floating navigator environment
  const isFloatingNavigator =
    typeof window !== 'undefined' && window.floatingNavigatorAPI

  // Load todos from Floating Navigator API
  const loadTodos = async () => {
    if (!isFloatingNavigator) {
      setError('Floating Navigator API not available')
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const todoData = await window.floatingNavigatorAPI!.todos.getTodos()

      // Transform the data to match our interface
      const transformedTodos: FloatingTodo[] = todoData.map((todo: any) => ({
        id: todo.id.toString(),
        text: todo.text || todo.title,
        completed: todo.completed,
        createdAt: new Date(todo.createdAt),
      }))

      setTodos(transformedTodos)
      setError(null)
    } catch (err) {
      log.error('Failed to load todos:', err)
      setError('Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }

  // Initialize and set up event listeners
  useEffect(() => {
    loadTodos()

    // Listen for todo updates from main process
    if (isFloatingNavigator) {
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
      <div className="bg-background flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground text-sm">
          Floating navigator only available in desktop app
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-background flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading tasks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-background flex h-full w-full flex-col items-center justify-center p-4">
        <p className="text-destructive mb-2 text-sm">{error}</p>
        <button
          onClick={loadTodos}
          className="text-muted-foreground hover:text-foreground text-xs underline"
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
