'use client'

import { useSyncExternalStore } from 'react'

/**
 * Returns `true` when the user has `prefers-reduced-motion: reduce` set.
 * Uses `useSyncExternalStore` so it is SSR-safe and free of hydration bugs.
 *
 * @returns `true` when the OS/browser has reduced-motion preference active,
 *   `false` when motion is allowed or when rendering on the server (SSR default).
 *
 * @example
 * ```tsx
 * function AnimatedStar() {
 *   const reducedMotion = useReducedMotion()
 *   return (
 *     <circle
 *       className={reducedMotion ? 'opacity-60' : 'animate-twinkle'}
 *     />
 *   )
 * }
 * ```
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false, // SSR default: assume motion is allowed
  )
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', onStoreChange)
  return () => {
    mq.removeEventListener('change', onStoreChange)
  }
}
