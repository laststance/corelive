'use client'

import { useMutation } from '@tanstack/react-query'
import { Undo2, ArrowRightLeft } from 'lucide-react'
import * as React from 'react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { orpc } from '@/lib/orpc/client-query'

import type { LastImport } from './PasteImport'

/**
 * Props for the inline post-import undo banner.
 */
export interface ImportUndoBannerProps {
  /** The most recent import, or null when there's nothing to offer undo for. */
  lastImport: LastImport | null
  /** Clears the parent's `lastImport` (called after undo, move, or expiry). */
  onDismiss: () => void
  /** Re-invalidate the caller's queries after a destructive action. */
  onChanged: () => void
}

/**
 * Discoverable 60s inline undo affordance (D5) shown above the relevant list:
 * `Imported N just now · Undo import`. For the Todo zone it also offers
 * `Move to Completed` (P2 wrong-zone recovery) — client-orchestrated, ordered
 * create-before-delete so a network blip on the delete step leaves recoverable
 * duplicates rather than irrecoverable loss: `completed.createMany` (new batch
 * id, full items with categoryIds) first; only on its success, `todo.deleteMany`
 * (old batch id). On create failure the banner stays mounted for retry.
 * Hides on undo, successful move, or window expiry.
 *
 * @param props - See {@link ImportUndoBannerProps}.
 * @returns The banner, or null when there is nothing to undo / the window expired.
 * @example
 * <ImportUndoBanner lastImport={batch} onDismiss={() => setBatch(null)} onChanged={invalidate} />
 */
export const ImportUndoBanner = React.memo(function ImportUndoBanner({
  lastImport,
  onDismiss,
  onChanged,
}: ImportUndoBannerProps) {
  // The banner shows no countdown — just "Imported N just now" — so a single
  // timer that flips an `expired` flag at the window edge is enough (no
  // per-second clock, no unstable `Date.now()` snapshot that would re-render
  // loop). Re-arms whenever a new batch (new `lastImport` object) arrives.
  const [expired, setExpired] = useState(false)
  useCycleEffect(() => {
    if (!lastImport) return
    const remainingMs = lastImport.expiresAt - Date.now()
    if (remainingMs <= 0) {
      setExpired(true)
      return
    }
    setExpired(false)
    const timeoutId = window.setTimeout(() => setExpired(true), remainingMs)
    return () => window.clearTimeout(timeoutId)
  }, [lastImport])

  const deleteCompletedMutation = useMutation(
    orpc.completed.deleteMany.mutationOptions({}),
  )
  const deleteTodoMutation = useMutation(
    orpc.todo.deleteMany.mutationOptions({}),
  )
  const createCompletedMutation = useMutation(
    orpc.completed.createMany.mutationOptions({}),
  )

  const isBusy =
    deleteCompletedMutation.isPending ||
    deleteTodoMutation.isPending ||
    createCompletedMutation.isPending

  const handleUndo = useCallback(() => {
    if (!lastImport) return
    const undo =
      lastImport.zone === 'completed'
        ? deleteCompletedMutation
        : deleteTodoMutation
    undo.mutate(
      { importBatchId: lastImport.importBatchId },
      {
        onSuccess: () => {
          onChanged()
          onDismiss()
        },
        onError: () => {
          toast.error("Couldn't undo — the import is still saved")
        },
      },
    )
  }, [
    deleteCompletedMutation,
    deleteTodoMutation,
    lastImport,
    onChanged,
    onDismiss,
  ])

  const handleMoveToCompleted = useCallback(() => {
    if (!lastImport || lastImport.zone !== 'todo') return
    // Create-before-delete: add to Completed first (new batch id, all categoryId
    // overrides retained). Only on create success do we delete the Todo batch.
    // If create fails → banner stays mounted for retry, todos untouched (no loss).
    // If delete fails after a successful create → duplicates in both zones, but
    // that is recoverable via Undo in either banner; irrecoverable loss is not.
    createCompletedMutation.mutate(
      {
        items: lastImport.items,
        importBatchId: crypto.randomUUID(),
      },
      {
        onSuccess: (createResult) => {
          deleteTodoMutation.mutate(
            { importBatchId: lastImport.importBatchId },
            {
              onSuccess: () => {
                toast.success(
                  `${createResult.count.toLocaleString()} moved — today's lit`,
                )
                onChanged()
                onDismiss()
              },
              onError: () => {
                // Create succeeded, delete failed → tasks appear in both zones.
                // Primary goal (Completed) is achieved. Dismiss cleanly and let
                // the user undo via either zone's banner. A second move attempt
                // would create another Completed batch, making it worse.
                toast.success(
                  `Added to Completed — your list may still show them too`,
                )
                onChanged()
                onDismiss()
              },
            },
          )
        },
        onError: () => {
          // Create failed → todos untouched, banner stays visible for retry.
          toast.error("Couldn't move — your tasks are still in the list")
        },
      },
    )
  }, [
    createCompletedMutation,
    deleteTodoMutation,
    lastImport,
    onChanged,
    onDismiss,
  ])

  // Nothing to show, or the 60s window has closed → render nothing. The
  // `expired` flag handles the live transition; the inline Date.now() guard
  // covers an already-expired batch on first render (a plain render read is
  // safe — unlike a useSyncExternalStore snapshot it never re-renders).
  if (!lastImport || lastImport.count === 0) return null
  if (expired || Date.now() >= lastImport.expiresAt) return null

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
      role="status"
    >
      <span className="text-sm text-muted-foreground">
        Imported {lastImport.count.toLocaleString()} just now
      </span>
      <div className="flex items-center gap-1">
        {lastImport.zone === 'todo' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleMoveToCompleted}
            disabled={isBusy}
          >
            <ArrowRightLeft className="size-4" aria-hidden="true" />
            Move to Completed
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={isBusy}
        >
          <Undo2 className="size-4" aria-hidden="true" />
          Undo import
        </Button>
      </div>
    </div>
  )
})
