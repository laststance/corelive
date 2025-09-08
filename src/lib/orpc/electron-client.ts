// import { createORPCClient } from '@orpc/client'
import type { RouterClient } from '@orpc/server'

import type { AppRouter } from '@/server/router'

import { log } from '../logger'

// Electron IPC Link for ORPC
class ElectronIPCLink {
  async call(path: string[], input: any) {
    // Check if we're in Electron environment
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('Electron API not available')
    }

    try {
      // Convert ORPC path to procedure call
      const [namespace, method] = path

      if (namespace === 'todo') {
        if (!window.electronAPI!.todos) {
          throw new Error('Todos API not available')
        }

        switch (method) {
          case 'list':
            return await window.electronAPI!.todos.getTodos()
          case 'create':
            return await window.electronAPI!.todos.createTodo(input)
          case 'update':
            return await window.electronAPI!.todos.updateTodo(input.id, input)
          case 'delete':
            return await window.electronAPI!.todos.deleteTodo(input.id)
          case 'toggle':
            return await window.electronAPI!.todos.updateTodo(input.id, {
              completed: !input.completed,
            })
          case 'clearCompleted':
            // Get all todos, filter completed ones, and delete them
            const todos = await window.electronAPI!.todos.getTodos()
            const completedTodos = todos.filter((todo: any) => todo.completed)
            await Promise.all(
              completedTodos.map(async (todo: any) =>
                window.electronAPI!.todos!.deleteTodo(todo.id),
              ),
            )
            return { deletedCount: completedTodos.length }
          default:
            throw new Error(`Unknown todo method: ${method}`)
        }
      }

      throw new Error(`Unknown namespace: ${namespace}`)
    } catch (error) {
      log.error('Electron IPC call failed:', error)
      throw error
    }
  }
}

// Create Electron-specific client
export const createElectronClient = (): RouterClient<AppRouter> => {
  const link = new ElectronIPCLink()

  // Create a proxy that mimics ORPC client behavior
  return new Proxy({} as RouterClient<AppRouter>, {
    get(target, namespace: string) {
      return new Proxy(
        {},
        {
          get(target, method: string) {
            return async (input?: any) => link.call([namespace, method], input)
          },
        },
      )
    },
  })
}

// Check if running in Electron environment
export const isElectronEnvironment = (): boolean => {
  return (
    typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'
  )
}
