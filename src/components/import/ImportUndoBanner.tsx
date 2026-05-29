'use client'

import { useMutation } from '@tanstack/react-query'
import { Undo2, ArrowRightLeft } from 'lucide-react'
import * as React from 'react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useComponentEffect } from '@/hooks/useComponentEffect'
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
 * `Move to Completed` (P2 wrong-zone recovery) — client-orchestrated:
 * `todo.deleteMany(oldBatch)` then `completed.createMany` of the retained
 * titles under a NEW batch id (no new server proc). Hides on undo, move, or
 * window expiry. Complements the transient success toast.
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
  useComponentEffect(() => {
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
    // Re-route: delete the Todo batch, then re-create the SAME titles in
    // Completed under a fresh batch id. We still hold the parsed titles.
    deleteTodoMutation.mutate(
      { importBatchId: lastImport.importBatchId },
      {
        onSuccess: () => {
          createCompletedMutation.mutate(
            {
              items: lastImport.titles.map((title) => ({ title })),
              importBatchId: crypto.randomUUID(),
            },
            {
              onSuccess: (result) => {
                toast.success(
                  `${result.count.toLocaleString()} moved — today's lit`,
                )
                onChanged()
                onDismiss()
              },
              onError: () => {
                // The Todo rows are already gone; surface a clear recovery hint.
                toast.error(
                  "Moved out of your list but couldn't add to Completed — paste them again",
                )
                onChanged()
                onDismiss()
              },
            },
          )
        },
        onError: () => {
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
