'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useSyncExternalStore } from 'react'

import { orpc } from '@/lib/orpc/client-query'

import { useCycleEffect } from './use-cycle-effect'

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
 * Selects General initially and verifies an unknown positive ID before replacing shared selection.
 *
 * Sidebar and {@link LiveEditor} observers can hold different category snapshots:
 * a peer's old list must not undo a confirmed creation in another tab.
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
  const queryClient = useQueryClient()
  const latestSelection = useRef(selectedCategoryId)
  useCycleEffect(() => {
    latestSelection.current = selectedCategoryId
  }, [selectedCategoryId])

  useCycleEffect(() => {
    if (categories.length === 0) return
    if (categories.some((category) => category.id === selectedCategoryId))
      return

    // First selection needs no verification; only confirmed defaults are writing destinations.
    if (selectedCategoryId === null) {
      const defaultCategory = categories.find(
        (category) => category.isDefault && category.id > 0,
      )
      if (defaultCategory) setSelectedCategoryId(defaultCategory.id)
      return
    }

    let cancelled = false
    // A cached miss can mean a recent peer creation; force a fresh owned list before falling back.
    void queryClient
      .fetchQuery({ ...orpc.category.list.queryOptions({}), staleTime: 0 })
      .then(({ categories: freshCategories }) => {
        if (cancelled || latestSelection.current !== selectedCategoryId) return
        if (
          freshCategories.some((category) => category.id === selectedCategoryId)
        )
          return
        const defaultCategory = freshCategories.find(
          (category) => category.isDefault && category.id > 0,
        )
        if (defaultCategory) setSelectedCategoryId(defaultCategory.id)
      })
      .catch(() => {
        // Offline or unauthenticated verification cannot prove deletion; preserve the writing selection.
      })
    return () => {
      cancelled = true
    }
  }, [selectedCategoryId, categories, setSelectedCategoryId, queryClient])
}
