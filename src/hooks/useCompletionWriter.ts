'use client'

import { useUser } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { getLocalTodayIsoDate } from '@/lib/getLocalTodayIsoDate'
import {
  addLocalCompletion,
  removeLocalCompletion,
} from '@/lib/live-editor/localCompletionStore'
import { orpc } from '@/lib/orpc/client-query'
import { getTodayHeatmapQueryKey } from '@/lib/query/todayHeatmapQuery'
import type { Completed, HeatmapResponse } from '@/server/schemas/completed'

/** How many recent keeps remember their day for Undo; the toast only ever offers the newest few. */
const REMEMBERED_COMPLETION_DAYS = 32

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
  // No `useLocalDayKey()` here on purpose, though the READER
  // (`useTodayKeeps`) subscribes to it. Both days agree except in the window
  // straddling local midnight, where the reader's `useSyncExternalStore`
  // snapshot can still be yesterday for the milliseconds before its timeout
  // fires. Resolving the day fresh after the await lands the +1 on the day the
  // keep actually belongs to; that entry is usually absent, so the bump is a
  // no-op and the ember simply does not animate for that one keep before the
  // refetch settles it. Bumping the reader's stale key instead would inflate
  // YESTERDAY's total for a keep filed today — a wrong number rather than a
  // missing animation.
  //
  // Which day each keep was filed under, so Undo credits the day the keep
  // HAPPENED rather than the day Undo was pressed. Only the Undo toast calls
  // `remove`, and only with an id `create` just returned, so this map answers
  // for every real call; anything else is treated as unknown. Capped because a
  // keep whose Undo is never pressed would otherwise sit here for the life of
  // an always-on-top panel. A ref, not state: nothing renders from it.
  const dayKeyByCompletionId = useRef(new Map<LiveEditorCompletionId, string>())
  const createCompletedMutation = useMutation(
    orpc.completed.create.mutationOptions({}),
  )
  const deleteCompletedMutation = useMutation(
    orpc.completed.delete.mutationOptions({}),
  )

  /**
   * Shifts one day's cached total so the ember answers at once; the caller's
   * invalidation refetch then overwrites it with the server value. A missing
   * cache entry is left missing (nothing to lie about), and `Math.max` keeps the
   * interim number sane.
   * @param targetDayKey - Local `YYYY-MM-DD` of the day the keep belongs to.
   * @param delta - +1 after a create resolves, −1 after a delete resolves.
   * @returns Nothing.
   * @example
   * bumpDayTotal('2026-09-05', 1)
   */
  const bumpDayTotal = (targetDayKey: string, delta: number): void => {
    // Stated rather than inferred: appending the day to the key spreads it into a
    // plain array, which drops TanStack's `DataTag` brand — the phantom type
    // `setQueryData` reads to know what `cached` holds. The schema is the source
    // of truth for that shape either way.
    queryClient.setQueryData<HeatmapResponse>(
      getTodayHeatmapQueryKey(targetDayKey),
      (cached) =>
        cached === undefined
          ? cached
          : { ...cached, total: Math.max(0, cached.total + delta) },
    )
  }

  /**
   * Files a keep's day for the Undo that may follow, evicting the oldest entry
   * past the cap so a long-lived panel cannot grow this without bound.
   * @param id - Server row id the Undo path will pass back.
   * @param createdDayKey - Local `YYYY-MM-DD` the keep was filed under.
   * @returns Nothing.
   * @example
   * rememberCompletionDay(42, '2026-09-05')
   */
  const rememberCompletionDay = (
    id: LiveEditorCompletionId,
    createdDayKey: string,
  ): void => {
    const remembered = dayKeyByCompletionId.current
    remembered.set(id, createdDayKey)
    while (remembered.size > REMEMBERED_COMPLETION_DAYS) {
      // Map iterates in insertion order, so the first key is the oldest keep.
      const oldest = remembered.keys().next()
      if (oldest.done) break
      remembered.delete(oldest.value)
    }
  }

  return {
    create: async ({ categoryId, title }) => {
      // Signed out: the keep never leaves the device (no category on the local store).
      if (!isSignedIn) return { id: addLocalCompletion(title).id }
      const created = await createCompletedMutation.mutateAsync({
        categoryId,
        title,
      })
      // Resolved after the await, not during render: the round trip can span
      // local midnight, and the keep belongs to the day it landed on.
      const createdDayKey = getLocalTodayIsoDate()
      rememberCompletionDay(created.id, createdDayKey)
      bumpDayTotal(createdDayKey, 1)
      return { id: created.id }
    },
    remove: async ({ id }) => {
      // A string id is a device-local keep, whatever the sign-in state is now.
      if (typeof id === 'string') {
        removeLocalCompletion(id)
        return
      }
      await deleteCompletedMutation.mutateAsync({ id })
      // Undoing across local midnight must not take one off TODAY for a keep
      // that now belongs to yesterday. With no remembered day there is nothing
      // safe to decrement, so the ember waits for the refetch instead of lying.
      const createdDayKey = dayKeyByCompletionId.current.get(id)
      dayKeyByCompletionId.current.delete(id)
      if (createdDayKey !== undefined) bumpDayTotal(createdDayKey, -1)
    },
  }
}
