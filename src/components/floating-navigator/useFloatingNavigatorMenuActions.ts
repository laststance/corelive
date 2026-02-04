import { useEffect, type SetState } from 'react'

import type { FloatingTodo } from '@/components/floating-navigator/FloatingNavigator'
import { isFloatingNavigatorEnvironment } from '@/electron/utils/electron-client'

interface UseFloatingNavigatorMenuActionsProps {
  inputRef: React.RefObject<HTMLInputElement | null>

  focusedTaskIndex: number
  setFocusedTaskIndex: SetState<number>
  pendingTodos: FloatingTodo[]
  completedTodos: FloatingTodo[]
  onTaskToggle: (id: string) => void
  onTaskDelete: (id: string) => void
  startEditing: (todo: FloatingTodo) => void
}

// Listen for IPC messages from Electron menu
export function useFloatingNavigatorMenuActions({
  inputRef,
  focusedTaskIndex,
  setFocusedTaskIndex,
  pendingTodos,
  completedTodos,
  onTaskToggle,
  onTaskDelete,
  startEditing,
}: UseFloatingNavigatorMenuActionsProps) {
  useEffect(() => {
    if (!isFloatingNavigatorEnvironment()) return

    const handleMenuAction = (event: CustomEvent) => {
      const action = event.detail?.action
      if (!action) return

      switch (action) {
        case 'focus-new-task':
          inputRef.current?.focus()
          break
        case 'navigate-next-task':
          {
            const allTodos = [...pendingTodos, ...completedTodos]
            if (focusedTaskIndex < allTodos.length - 1) {
              setFocusedTaskIndex(focusedTaskIndex + 1)
            }
          }
          break
        case 'navigate-previous-task':
          {
            if (focusedTaskIndex > 0) {
              setFocusedTaskIndex(focusedTaskIndex - 1)
            } else if (focusedTaskIndex === 0) {
              setFocusedTaskIndex(-1)
              inputRef.current?.focus()
            }
          }
          break
        case 'toggle-task-completion':
          {
            const allTodos = [...pendingTodos, ...completedTodos]
            if (focusedTaskIndex >= 0 && focusedTaskIndex < allTodos.length) {
              const task = allTodos[focusedTaskIndex]
              if (task) {
                onTaskToggle(task.id)
              }
            }
          }
          break
        case 'edit-task':
          {
            const allTodos = [...pendingTodos, ...completedTodos]
            if (focusedTaskIndex >= 0 && focusedTaskIndex < allTodos.length) {
              const task = allTodos[focusedTaskIndex]
              if (task) {
                startEditing(task)
              }
            }
          }
          break
        case 'delete-task':
          {
            const allTodos = [...pendingTodos, ...completedTodos]
            if (focusedTaskIndex >= 0 && focusedTaskIndex < allTodos.length) {
              const task = allTodos[focusedTaskIndex]
              if (task) {
                onTaskDelete(task.id)
                // Adjust focus after deletion
                if (focusedTaskIndex >= allTodos.length - 1) {
                  setFocusedTaskIndex(Math.max(0, allTodos.length - 2))
                }
              }
            }
          }
          break
        case 'return-to-input':
          setFocusedTaskIndex(-1)
          inputRef.current?.focus()
          break
        case 'show-help':
          break
      }
    }

    // Listen for custom events dispatched from preload script
    const eventHandler = handleMenuAction as EventListener
    window.addEventListener('floating-navigator-menu-action', eventHandler)
    return () => {
      window.removeEventListener('floating-navigator-menu-action', eventHandler)
    }
  }, [
    focusedTaskIndex,
    pendingTodos,
    completedTodos,
    inputRef,
    onTaskToggle,
    onTaskDelete,
    startEditing,
  ])
}
