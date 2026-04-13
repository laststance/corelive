'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

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
 * @returns The selected category ID, or null when no category is selected yet
 */
const getSnapshot = (): number | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return null
    const parsed = Number(stored)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

/**
 * SSR fallback — always returns null (no category selected during SSR).
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
 * - selectedCategoryId: number | null (null = no category selected yet)
 * - setSelectedCategoryId: (id: number | null) => void
 *
 * @example
 * const [categoryId, setCategoryId] = useSelectedCategory()
 * // Select a category
 * setCategoryId(3)
 * // Clear selection
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

/**
 * Auto-selects the default (isDefault=true) category when none is selected.
 * Extracts the shared auto-select logic used by both Category sidebar and FloatingNavigator.
 *
 * @param selectedCategoryId - Current selected category ID from useSelectedCategory
 * @param setSelectedCategoryId - Setter from useSelectedCategory
 * @param categories - Categories with an isDefault flag
 *
 * @example
 * const [selectedCategoryId, setSelectedCategoryId] = useSelectedCategory()
 * const categories = useCategoryQuery()
 * useAutoSelectDefaultCategory(selectedCategoryId, setSelectedCategoryId, categories)
 */
export function useAutoSelectDefaultCategory(
  selectedCategoryId: number | null,
  setSelectedCategoryId: (id: number | null) => void,
  categories: { id: number; isDefault: boolean }[],
) {
  /* eslint-disable react-you-might-not-need-an-effect/no-pass-data-to-parent -- writes to localStorage external store, not React parent state */
  useEffect(() => {
    if (selectedCategoryId === null && categories.length > 0) {
      const defaultCategory = categories.find((c) => c.isDefault)
      if (defaultCategory) {
        setSelectedCategoryId(defaultCategory.id)
      }
    }
  }, [selectedCategoryId, categories, setSelectedCategoryId])
  /* eslint-enable react-you-might-not-need-an-effect/no-pass-data-to-parent */
}
