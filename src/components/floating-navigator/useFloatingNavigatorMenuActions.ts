import { useEffect } from 'react'

import { isFloatingNavigatorEnvironment } from '@/electron/utils/electron-client'

interface UseFloatingNavigatorMenuActionsProps {
  inputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Listens for IPC messages from Electron menu and handles menu actions.
 * Currently only supports focusing the new task input.
 * @param props.inputRef - Reference to the new task input element.
 */
export function useFloatingNavigatorMenuActions({
  inputRef,
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
      }
    }

    // Listen for custom events dispatched from preload script
    const eventHandler = handleMenuAction as EventListener
    window.addEventListener('floating-navigator-menu-action', eventHandler)
    return () => {
      window.removeEventListener('floating-navigator-menu-action', eventHandler)
    }
  }, [inputRef])
}
