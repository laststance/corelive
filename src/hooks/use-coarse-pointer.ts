import { useSyncExternalStore } from 'react'

const COARSE_POINTER_QUERY = '(pointer: coarse)'

/**
 * Subscribes to the primary pointer changing between fine and coarse (e.g. a
 * tablet keyboard dock), mirroring `use-mobile.ts`.
 * @param callback - Listener React calls to re-read the snapshot.
 * @returns Cleanup that unsubscribes; a no-op where `matchMedia` is missing.
 * @example
 * const unsubscribe = subscribeToPointerChange(() => {})
 */
function subscribeToPointerChange(callback: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const mediaQueryList = window.matchMedia(COARSE_POINTER_QUERY)
  mediaQueryList.addEventListener('change', callback)
  return () => mediaQueryList.removeEventListener('change', callback)
}

/**
 * Reads whether the primary pointer is coarse (touch).
 * @returns true on touch-first devices; false on mouse/trackpad or without `matchMedia`.
 * @example
 * getSnapshot() // => true on a phone
 */
function getSnapshot(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia(COARSE_POINTER_QUERY).matches
}

/**
 * Server snapshot — assume a fine pointer so the touch-only controls never flash on desktop.
 * @returns false
 * @example
 * getServerSnapshot() // => false
 */
function getServerSnapshot(): boolean {
  return false
}

/**
 * Whether the visitor's primary pointer is touch, gating touch-only controls such
 * as the LiveEditor "Keep line" button (a phone has no Cmd+Enter).
 * @returns true on touch-first devices, false otherwise and during SSR.
 * @example
 * const isCoarsePointer = useCoarsePointer()
 * if (isCoarsePointer) return <Button>Keep line</Button>
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeToPointerChange,
    getSnapshot,
    getServerSnapshot,
  )
}
