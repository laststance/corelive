import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Subscribe to window resize changes for mobile detection
 * @param callback - Listener function called on resize
 * @returns Cleanup function to unsubscribe
 */
function subscribeToResize(callback: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

/**
 * Get current mobile state from window width
 * @returns true if viewport is mobile-sized
 */
function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/**
 * Server-side fallback for mobile detection
 * @returns false (default to desktop on server)
 */
function getServerSnapshot(): boolean {
  return false
}

/**
 * Hook to detect if the current viewport is mobile-sized
 * Uses useSyncExternalStore for SSR-safe, tear-free subscriptions
 * @returns true if viewport width is less than 768px
 * @example
 * const isMobile = useIsMobile()
 * if (isMobile) return <MobileView />
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeToResize, getSnapshot, getServerSnapshot)
}
