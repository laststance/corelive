'use client'

import { ORPCError } from '@orpc/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { broadcastCategorySync } from '@/lib/category-sync-channel'
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
 * Custom hook providing category mutations with optimistic updates.
 *
 * Follows the same optimistic update pattern as useTodoMutations:
 * 1. onMutate: Cancel queries -> Snapshot -> Apply optimistic update
 * 2. onError: Rollback using snapshot, then say why via {@link notifyCategoryWriteFailed}
 * 3. onSettled: Always invalidate to sync with server + broadcast
 *
 * @returns Object containing all category mutations
 * @returns createMutation - Add new category with instant UI feedback
 * @returns updateMutation - Rename/recolor category with instant update
 * @returns deleteMutation - Remove category with instant disappearance
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
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey: categoryKey })

      const previousCategories =
        queryClient.getQueryData<CategoryListResponse>(categoryKey)

      const optimisticCategory: CategoryWithCount = {
        id: -Date.now(),
        name: newCategory.name,
        color: newCategory.color ?? 'blue',
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

      return { previousCategories }
    },
    onError: (error, _newCategory, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(categoryKey, context.previousCategories)
      }
      notifyCategoryWriteFailed(error)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: categoryKey })
      broadcastCategorySync()
    },
  })

  // ============================================
  // UPDATE MUTATION - Rename/recolor in-place
  // ============================================
  const updateMutation = useMutation({
    ...orpc.category.update.mutationOptions({}),
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

      return { previousCategories }
    },
    onError: (error, _input, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(categoryKey, context.previousCategories)
      }
      notifyCategoryWriteFailed(error)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: categoryKey })
      broadcastCategorySync()
    },
  })

  // ============================================
  // DELETE MUTATION - Remove with optimistic update
  // ============================================
  const deleteMutation = useMutation({
    ...orpc.category.delete.mutationOptions({}),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: categoryKey })

      const previousCategories =
        queryClient.getQueryData<CategoryListResponse>(categoryKey)

      queryClient.setQueryData<CategoryListResponse>(categoryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          categories: old.categories.filter((c) => c.id !== id),
        }
      })

      return { previousCategories }
    },
    onError: (error, _input, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(categoryKey, context.previousCategories)
      }
      notifyCategoryWriteFailed(error)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: categoryKey })
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
