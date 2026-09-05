'use client'

import { useUser } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useLocalDayKey } from '@/hooks/useLocalDayKey'
import { MAX_LOCAL_MERGE_PASSES } from '@/lib/live-editor/constants'
import {
  countLocalCompletionsOnDay,
  readUnmergedLocalCompletions,
  tagLocalCompletionsMerged,
} from '@/lib/live-editor/localCompletionStore'
import {
  clearPendingMerge,
  readForeignPendingMerge,
  readOrCreatePendingMerge,
} from '@/lib/live-editor/pendingMergeStore'
import { log } from '@/lib/logger'
import { orpc } from '@/lib/orpc/client-query'
import { getTodayHeatmapQueryKey } from '@/lib/query/todayHeatmapQuery'
import { getViewerTimeZone } from '@/lib/utils/getViewerTimeZone'
import {
  IMPORT_LOCAL_MAX_ITEMS,
  type HeatmapResponse,
} from '@/server/schemas/completed'

/**
 * Merges this device's signed-out keeps into the account once per session, right
 * after sign-in. Mounted at the root rather than on `/write` because sign-up
 * force-redirects to `/home`: a page-scoped trigger would never run for the
 * visitor who just made an account, which is the exact person whose keeps are
 * waiting. Renders nothing.
 *
 * Fires at most once per session (a ref latch, since `useUser` flips through
 * loading states and refreshes auth on its own). A failure leaves the pending
 * record in place, so the next session retries the same batch under the same
 * idempotency key instead of importing it twice.
 *
 * @returns null — this is a side-effect component.
 * @example
 * <LocalKeepMergeSync />
 */
export function LocalKeepMergeSync(): null {
  const { isLoaded, isSignedIn, user } = useUser()
  const queryClient = useQueryClient()
  const dayKey = useLocalDayKey()
  const timezone = getViewerTimeZone()
  const hasRunRef = useRef(false)
  const importLocalMutation = useMutation(
    orpc.completed.importLocal.mutationOptions({}),
  )

  /**
   * Sends ONE claimed batch and settles the ember. Split from the effect so the
   * await chain reads top-to-bottom, and from the loop so the cap applies per
   * pass rather than per sign-in.
   * @param clerkId - The account the claim is filed under.
   * @returns Whether a batch actually reached the server.
   */
  const mergeOneBatch = async (clerkId: string): Promise<boolean> => {
    const unmerged = readUnmergedLocalCompletions()
    // Claimed (and persisted) BEFORE the request: a tab closed mid-flight must
    // resume with the SAME batch id, or the retry double-counts what landed.
    const pending = readOrCreatePendingMerge(
      clerkId,
      unmerged.slice(0, IMPORT_LOCAL_MAX_ITEMS).map((item) => item.id),
    )
    if (pending === null) return false

    // Deliberately resolved from the claimed ids, not from whatever the store
    // holds now — keeps added since the claim belong to the NEXT batch.
    const byId = new Map(unmerged.map((item) => [item.id, item]))
    const items = pending.ids
      .map((id) => byId.get(id))
      .filter((item) => item !== undefined)
    if (items.length === 0) {
      // Every claimed keep is already tagged or gone; release the claim.
      clearPendingMerge()
      return false
    }

    const result = await importLocalMutation.mutateAsync({
      batchId: pending.batchId,
      items: items.map(({ title, completedAt }) => ({
        title,
        completedAt: new Date(completedAt),
      })),
    })

    // A heatmap fetch that started before the import committed answers with a
    // total short by exactly this batch, and it lands AFTER the tag below —
    // painting a number LOWER than the one the visitor was just looking at.
    // (Measured: a brand-new account sat on "Nothing kept yet today" until the
    // refetch returned.) Dropping that answer first leaves the ember on its
    // resolving word for a moment, which is honest, instead of a wrong count.
    await queryClient.cancelQueries({ queryKey: orpc.completed.key() })

    // Tag and bump in ONE synchronous block. Tagging alone drops the local term
    // before the refetch lands (the ember dips); bumping alone counts the same
    // keeps twice (it spikes). Both writes in one turn are batched into a single
    // render, so the number never moves wrong. On `alreadyImported` the rows
    // landed on an earlier attempt and the server already owns them — tag only.
    const landedToday = result.alreadyImported
      ? 0
      : countLocalCompletionsOnDay(items, dayKey, timezone)
    tagLocalCompletionsMerged(pending.ids, pending.batchId)
    if (landedToday > 0) {
      queryClient.setQueryData<HeatmapResponse>(
        getTodayHeatmapQueryKey(dayKey),
        (previous) =>
          previous === undefined
            ? previous
            : { ...previous, total: previous.total + landedToday },
      )
    }
    clearPendingMerge()
    return true
  }

  /**
   * Drains this device's unmerged keeps, one capped batch per pass. A store
   * holding more than {@link IMPORT_LOCAL_MAX_ITEMS} needs several passes, and
   * the effect latches after its first run — without the loop the overflow would
   * sit unmerged until the next page load.
   * @param clerkId - The account the keeps are being filed under.
   * @returns Nothing; throws only what the mutation throws.
   */
  const mergeLocalKeeps = async (clerkId: string): Promise<void> => {
    // A claim left by another account covers keeps that may already sit in THAT
    // account. Retiring them locally is the only way to stop this user re-sending
    // someone else's wins — there is no signal here to tell landed from lost.
    const foreign = readForeignPendingMerge(clerkId)
    if (foreign !== null) {
      tagLocalCompletionsMerged(foreign.ids, foreign.batchId)
      clearPendingMerge()
    }

    let imported = false
    let remaining = readUnmergedLocalCompletions().length
    for (let pass = 0; pass < MAX_LOCAL_MERGE_PASSES && remaining > 0; pass++) {
      if (!(await mergeOneBatch(clerkId))) break
      // Progress, not count, is the exit condition: a pass that tags nothing
      // (ids drifted under us) would otherwise re-claim the same batch forever.
      const left = readUnmergedLocalCompletions().length
      imported = true
      if (left >= remaining) break
      remaining = left
    }

    // Settle every completed-derived view (heatmap windows, journal, day detail)
    // against the rows that just landed.
    if (imported) {
      await queryClient.invalidateQueries({ queryKey: orpc.completed.key() })
    }
  }

  useCycleEffect(() => {
    if (!isLoaded || isSignedIn !== true || hasRunRef.current) return
    const clerkId = user?.id
    if (clerkId === undefined) return
    hasRunRef.current = true
    // Swallowed on purpose: a failed merge must not take the app down, and the
    // pending record already guarantees the next session retries it.
    void mergeLocalKeeps(clerkId).catch((error: unknown) => {
      log.error('Failed to merge local completions:', error)
    })
  }, [isLoaded, isSignedIn, user?.id])

  return null
}
