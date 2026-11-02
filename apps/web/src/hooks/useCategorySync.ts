'use client'

import { useQueryClient } from '@tanstack/react-query'

import {
  subscribeToCategorySync,
  invalidateCategoryViews,
} from '@/lib/category-sync-channel'

import { useCycleEffect } from './use-cycle-effect'

/**
 * Refetches the category list whenever another window mutates categories, so a
 * category renamed or deleted elsewhere never lingers in this window's sidebar.
 * Mounted by every surface that reads `category.list`; the broadcast half lives
 * in {@link useCategoryMutations}' `onSettled`.
 * @returns Nothing; subscribes for the component's lifetime.
 * @example
 * useCategorySync() // in the /home sidebar
 */
export function useCategorySync(): void {
  const queryClient = useQueryClient()

  useCycleEffect(() => {
    return subscribeToCategorySync(() => {
      void invalidateCategoryViews(queryClient)
    })
  }, [queryClient])
}
