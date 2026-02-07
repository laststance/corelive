'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { broadcastCategorySync } from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'

/**
 * Response structure for category list queries.
 * Must match CategoryListResponseSchema from server/schemas/category.
 */
interface CategoryListResponse {
  categories: CategoryWithCount[]
  uncategorizedCount: number
}

/**
 * Custom hook providing category mutations with optimistic updates.
 *
 * Follows the same optimistic update pattern as useTodoMutations:
 * 1. onMutate: Cancel queries -> Snapshot -> Apply optimistic update
 * 2. onError: Rollback using snapshot
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

  // Also invalidate todo queries when categories change (counts may differ)
  const todoBaseKey = orpc.todo.list.key()

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
    onError: (_err, _newCategory, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(categoryKey, context.previousCategories)
      }
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
    onError: (_err, _input, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(categoryKey, context.previousCategories)
      }
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
    onError: (_err, _input, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(categoryKey, context.previousCategories)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: categoryKey })
      // Also invalidate todos since deleted category's todos become uncategorized
      queryClient.invalidateQueries({ queryKey: todoBaseKey })
      broadcastCategorySync()
    },
  })

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  }
}
