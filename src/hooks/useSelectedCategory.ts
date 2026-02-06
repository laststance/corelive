'use client'

import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'corelive-selected-category'

/**
 * Set of listeners that are notified when the selected category changes.
 * Used by useSyncExternalStore to trigger re-renders across all subscribers.
 */
const listeners = new Set<() => void>()

/**
 * Notifies all subscribed components that the selected category changed.
 */
const emitChange = () => {
  for (const listener of listeners) {
    listener()
  }
}

/**
 * Reads the selected category ID from localStorage.
 * @returns The selected category ID, or null for "All" categories
 */
const getSnapshot = (): number | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return null
    const parsed = Number(stored)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * SSR fallback — always returns null (show all categories).
 */
const getServerSnapshot = (): number | null => null

/**
 * Subscribe to external storage changes.
 * @param callback - Function to call when storage changes
 * @returns Cleanup function
 */
const subscribe = (callback: () => void): (() => void) => {
  listeners.add(callback)

  // Also listen for cross-tab changes via StorageEvent
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback()
    }
  }
  window.addEventListener('storage', handleStorage)

  return () => {
    listeners.delete(callback)
    window.removeEventListener('storage', handleStorage)
  }
}

/**
 * Hook for managing the selected category filter state.
 * Persisted to localStorage and synchronized across tabs via StorageEvent.
 * Uses useSyncExternalStore for SSR-safe subscription.
 *
 * @returns [selectedCategoryId, setSelectedCategoryId]
 * - selectedCategoryId: number | null (null = "All" categories)
 * - setSelectedCategoryId: (id: number | null) => void
 *
 * @example
 * const [categoryId, setCategoryId] = useSelectedCategory()
 * // Select a category
 * setCategoryId(3)
 * // Show all categories
 * setCategoryId(null)
 */
export function useSelectedCategory(): [
  number | null,
  (id: number | null) => void,
] {
  const selectedCategoryId = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  const setSelectedCategoryId = useCallback((id: number | null) => {
    try {
      if (id === null) {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        localStorage.setItem(STORAGE_KEY, String(id))
      }
    } catch {
      // localStorage unavailable (e.g. private browsing quota exceeded)
    }
    emitChange()
  }, [])

  return [selectedCategoryId, setSelectedCategoryId]
}
