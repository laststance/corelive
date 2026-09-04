'use client'

import { useUser } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  addLocalCompletion,
  removeLocalCompletion,
} from '@/lib/live-editor/localCompletionStore'
import { orpc } from '@/lib/orpc/client-query'
import type { Completed } from '@/server/schemas/completed'

/** A keep's id: the server row id when signed in, the device-local uuid when signed out. */
export type LiveEditorCompletionId = Completed['id'] | string

/** The one write seam for LiveEditor completions, whichever store they land in. */
export type CompletionWriter = {
  /** Records a keep; resolves with the id Undo must pass to `remove`. */
  create: (input: {
    categoryId: number
    title: string
  }) => Promise<{ id: LiveEditorCompletionId }>
  /** Deletes a keep (the Undo path). Routed by id shape, so a local keep undone after sign-in still resolves. */
  remove: (input: { id: LiveEditorCompletionId }) => Promise<void>
}

/**
 * Query key of the one-day heatmap window whose `total` the Today Ember reads.
 * @returns The exact TanStack key `useHeatmapData(1)` subscribes to.
 * @example
 * getTodayHeatmapQueryKey() // => ['completed', 'heatmap', { input: { days: 1, timezone: 'Asia/Tokyo' } }, …]
 */
function getTodayHeatmapQueryKey() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return orpc.completed.heatmap.queryOptions({ input: { days: 1, timezone } })
    .queryKey
}

/**
 * Routes LiveEditor completion writes: signed in → `completed.create` / `.delete`
 * plus a ±1 bump on today's cached heatmap total (the ember moves before the
 * refetch settles the real number); signed out → the device-local store. Called
 * by `LiveEditor` in place of its former direct mutations.
 * @returns A {@link CompletionWriter} whose `create` / `remove` reject exactly like the mutations did.
 * @example
 * const writer = useCompletionWriter()
 * const { id } = await writer.create({ categoryId: 1, title: 'buy milk' })
 * await writer.remove({ id })
 */
export function useCompletionWriter(): CompletionWriter {
  const { isSignedIn } = useUser()
  const queryClient = useQueryClient()
  const createCompletedMutation = useMutation(
    orpc.completed.create.mutationOptions({}),
  )
  const deleteCompletedMutation = useMutation(
    orpc.completed.delete.mutationOptions({}),
  )

  /**
   * Shifts today's cached total so the ember answers at once; the caller's
   * invalidation refetch then overwrites it with the server value. A missing
   * cache entry is left missing (nothing to lie about).
   * @param delta - +1 after a create resolves, −1 after a delete resolves.
   * @returns Nothing.
   * @example
   * bumpTodayTotal(1)
   */
  const bumpTodayTotal = (delta: number): void => {
    queryClient.setQueryData(getTodayHeatmapQueryKey(), (cached) =>
      cached === undefined
        ? cached
        : { ...cached, total: Math.max(0, cached.total + delta) },
    )
  }

  return {
    create: async ({ categoryId, title }) => {
      // Signed out: the keep never leaves the device (no category on the local store).
      if (!isSignedIn) return { id: addLocalCompletion(title).id }
      const created = await createCompletedMutation.mutateAsync({
        categoryId,
        title,
      })
      bumpTodayTotal(1)
      return { id: created.id }
    },
    remove: async ({ id }) => {
      // A string id is a device-local keep, whatever the sign-in state is now.
      if (typeof id === 'string') {
        removeLocalCompletion(id)
        return
      }
      await deleteCompletedMutation.mutateAsync({ id })
      bumpTodayTotal(-1)
    },
  }
}
