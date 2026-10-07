'use client'

import { ORPCError } from '@orpc/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  broadcastCategorySync,
  invalidateCategoryViews,
} from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'

/**
 * Response structure for category list queries.
 * Must match CategoryListResponseSchema from server/schemas/category.
 */
interface CategoryListResponse {
  categories: CategoryWithCount[]
}

/** Shown when the failure never reached a handler, so no server sentence exists. */
let nextOptimisticCategoryId = -Date.now()

const CATEGORY_WRITE_FALLBACK_MESSAGE = "Couldn't save that change — try again."

/**
 * Explains a failed category write in the user's language, so an optimistic row
 * never just appears and vanishes. Called from every mutation's `onError`.
 * @param error - Whatever the mutation rejected with.
 * @returns Nothing; raises a toast.
 * @example
 * notifyCategoryWriteFailed(new ORPCError('CONFLICT', { message: 'Category "Work" already exists' }))
 * // => toast: 'Category "Work" already exists'
 */
const notifyCategoryWriteFailed = (error: unknown): void => {
  // Server messages are written for humans and oRPC transmits them by design;
  // a transport failure ("Failed to fetch") is not, so it gets our own words.
  toast.error(
    error instanceof ORPCError
      ? error.message
      : CATEGORY_WRITE_FALLBACK_MESSAGE,
  )
}

/**
 * Serializes category writes per QueryClient and keeps every retrospective in sync.
 *
 * Follows the same optimistic update pattern as useTodoMutations:
 * 1. onMutate: Cancel queries -> Snapshot -> Apply optimistic update
 * 2. onError: Restore only the failed row, then explain it via {@link notifyCategoryWriteFailed}
 * 3. onSettled: Always invalidate to sync with server + broadcast
 *
 * Delete remains pessimistic: parent removal and child promotion appear together after confirmation.
 * @returns Create/update with guarded optimistic rows and delete with an atomic confirmed cache update.
 *
 * @example
 * const { createMutation, updateMutation, deleteMutation } = useCategoryMutations()
 * createMutation.mutate({ name: 'Work', color: 'blue' })
 * updateMutation.mutate({ id: 1, data: { name: 'Personal' } })
 * deleteMutation.mutate({ id: 1 })
 */
export function useCategoryMutations() {
  const queryClient = useQueryClient()

  // Query key for category list cache operations
  const categoryKey = orpc.category.list.queryOptions({}).queryKey

  // ============================================
  // CREATE MUTATION - Optimistic add to list
  // ============================================
  const createMutation = useMutation({
    ...orpc.category.create.mutationOptions({}),
    scope: { id: 'category-writes' },
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey: categoryKey })

      const previousCategories =
        queryClient.getQueryData<CategoryListResponse>(categoryKey)

      const optimisticCategory: CategoryWithCount = {
        id: nextOptimisticCategoryId--,
        name: newCategory.name,
        color:
          newCategory.color ??
          previousCategories?.categories.find(
            (category) => category.id === newCategory.parentId,
          )?.color ??
          'blue',
        parentId: newCategory.parentId ?? null,
        recordCount: 0,
        isDefault: false,
        userId: 0,
        _count: { todos: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      queryClient.setQueryData<CategoryListResponse>(categoryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          categories: [...old.categories, optimisticCategory],
        }
      })

      return { previousCategories, optimisticId: optimisticCategory.id }
    },
    onSuccess: (created, _input, context) => {
      queryClient.setQueryData<CategoryListResponse>(categoryKey, (old) =>
        old
          ? {
              ...old,
              categories: old.categories.map((category) =>
                category.id === context?.optimisticId
                  ? { ...created, _count: { todos: 0 }, recordCount: 0 }
                  : category,
              ),
            }
          : old,
      )
    },
    onError: (error, _newCategory, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData<CategoryListResponse>(categoryKey, (old) =>
          old
            ? {
                ...old,
                categories: old.categories.filter(
                  (category) => category.id !== context.optimisticId,
                ),
              }
            : context.previousCategories,
        )
      }
      notifyCategoryWriteFailed(error)
    },
    onSettled: async () => {
      await invalidateCategoryViews(queryClient)
      broadcastCategorySync()
    },
  })

  // ============================================
  // UPDATE MUTATION - Rename/recolor in-place
  // ============================================
  const updateMutation = useMutation({
    ...orpc.category.update.mutationOptions({}),
    scope: { id: 'category-writes' },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: categoryKey })

      const previousCategories =
        queryClient.getQueryData<CategoryListResponse>(categoryKey)

      queryClient.setQueryData<CategoryListResponse>(categoryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          categories: old.categories.map((c) =>
            c.id === id ? { ...c, ...data, updatedAt: new Date() } : c,
          ),
        }
      })

      return { previousCategories, id }
    },
    onError: (error, _input, context) => {
      if (context?.previousCategories) {
        const previous = context.previousCategories.categories.find(
          (category) => category.id === context.id,
        )
        queryClient.setQueryData<CategoryListResponse>(categoryKey, (old) =>
          old && previous
            ? {
                ...old,
                categories: old.categories.map((category) =>
                  category.id === context.id ? previous : category,
                ),
              }
            : old,
        )
      }
      notifyCategoryWriteFailed(error)
    },
    onSettled: async () => {
      await invalidateCategoryViews(queryClient)
      broadcastCategorySync()
    },
  })

  // ============================================
  // DELETE MUTATION - Apply confirmed parent removal and child promotion
  // ============================================
  const deleteMutation = useMutation({
    ...orpc.category.delete.mutationOptions({}),
    scope: { id: 'category-writes' },
    // Keep parent and children together until the server confirms the entire transaction.
    onSuccess: (response, { id }) => {
      queryClient.setQueryData<CategoryListResponse>(categoryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          categories: old.categories
            .filter((category) => category.id !== id)
            .map((category) =>
              response.promotedCategoryIds.includes(category.id)
                ? { ...category, parentId: null }
                : category,
            ),
        }
      })
    },
    onError: (error) => notifyCategoryWriteFailed(error),
    onSettled: async () => {
      await invalidateCategoryViews(queryClient)
      // Other windows hold their own category list; the delete reassigns
      // rows to the default category, so their copy is stale until told.
      broadcastCategorySync()
    },
  })

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  }
}
