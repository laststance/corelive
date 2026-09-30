'use client'

import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  subscribeToCategorySync,
  invalidateCategoryViews,
} from '@/lib/category-sync-channel'
import { refreshCategoryDraft } from '@/lib/live-editor/appendCategoryDraft'

import { useCycleEffect } from './use-cycle-effect'

/**
 * Refetches the category list whenever another window mutates categories, so a
 * category renamed or deleted elsewhere never lingers in this window's picker.
 * Mounted by every surface that reads `category.list`; the broadcast half lives
 * in {@link useCategoryMutations}' `onSettled`.
 * @returns Nothing; subscribes for the component's lifetime.
 * @example
 * useCategorySync() // in /write, /live-editor and the /home sidebar
 */
export function useCategorySync(): void {
  const queryClient = useQueryClient()

  useCycleEffect(() => {
    return subscribeToCategorySync((draftCategoryId, draftRescue) => {
      void invalidateCategoryViews(queryClient)
      if (draftCategoryId !== undefined) {
        const refresh = () => {
          void refreshCategoryDraft(draftCategoryId, draftRescue)
            .then(() => toast.dismiss(`category-rescue-${draftCategoryId}`))
            .catch(() => {
              toast.error(
                'Could not refresh the moved writing. Retry before editing this category.',
                {
                  id: `category-rescue-${draftCategoryId}`,
                  action: { label: 'Retry', onClick: refresh },
                  duration: Infinity,
                },
              )
            })
        }
        refresh()
      }
    })
  }, [queryClient])
}
