'use client'

import { useMutation } from '@tanstack/react-query'
import * as React from 'react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'

import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import { COMPLETED_UNDO_WINDOW_MS } from '@/lib/constants/import'
import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'

import {
  type PasteImportItem,
  type PasteImportZone,
} from './paste-import-types'
import { PasteImportDialog } from './PasteImportDialog'

/** How long the success toast (with Undo) stays up. */
const UNDO_TOAST_MS = 10000

/**
 * The 60s undo window the banner's expiry is keyed to. Single-sourced from the
 * server constant so the UI window can never drift from the server's
 * window-guarded `deleteMany` (plan eng fold-in).
 */
const UNDO_WINDOW_MS = COMPLETED_UNDO_WINDOW_MS

/**
 * Records the just-imported batch so the caller can render a 60s inline undo
 * banner (D5) and, for the Todo zone, a Move-to-Completed recovery (P2). The
 * full `items` (title + categoryId) are retained so Move-to-Completed can
 * re-route the same items — including per-row categories — under a new batch
 * id without re-parsing or discarding user overrides.
 *
 * @example
 * { importBatchId: 'b2c1…', zone: 'todo', count: 3, items: [{title:'a'},{title:'gym',categoryId:3}], expiresAt: 1717000000000 }
 */
export type LastImport = {
  importBatchId: string
  zone: PasteImportZone
  count: number
  /** Full parsed items (title + optional categoryId per row) for undo and Move-to-Completed replay. */
  items: PasteImportItem[]
  /** Epoch ms when the 60s undo window closes. */
  expiresAt: number
}

/**
 * Props for the paste-import container. The caller supplies the `trigger`, the
 * `categories` list (injected, never fetched here — matches BrainDumpEditor),
 * and `onImported` (where the caller invalidates the right react-query keys so
 * the heatmap fill / list update happens). `open`/`onOpenChange` are optional:
 * pass them to make the dialog controllable (D7 opens it without a trigger).
 */
export interface PasteImportProps {
  /** Destination zone — selects copy + which `createMany` runs. */
  zone: PasteImportZone
  /** The element that opens the dialog (e.g. an "Import" button). */
  trigger?: React.ReactNode
  /** Categories for the shared + per-row Select. */
  categories: CategoryWithCount[]
  /** Called after a successful import so the caller invalidates its queries. */
  onImported?: (result: LastImport) => void
  /** Controlled open state (optional — omit for trigger-only usage). */
  open?: boolean
  /** Controlled open setter (optional). */
  onOpenChange?: (open: boolean) => void
  /**
   * Pre-fills the dialog's textarea on mount (Issue #110: the pasted list seeds
   * the confirm step). The dialog reads this once via `useState`, so callers
   * re-seed a still-mounted controlled dialog by re-keying it (see TodoList /
   * FloatingNavigatorContainer's `key={seedNonce}`).
   */
  initialText?: string
}

/**
 * oRPC container for paste-import. Wires `completed.createMany` /
 * `todo.createMany` to the presentational {@link PasteImportDialog}, owns the
 * idempotent `importBatchId` lifecycle (generated at first confirm, REUSED on
 * retry so a committed-but-timed-out submit is a P2002 no-op, cleared on
 * success + close), fires the success toast with bulk Undo, and reports the
 * batch up via `onImported`. Triggered from each zone's Import entry point.
 *
 * @param props - See {@link PasteImportProps}.
 * @returns The wired paste-import dialog.
 * @example
 * <PasteImport zone="completed" categories={cats} trigger={<Button>Import</Button>}
 *   onImported={(batch) => invalidateHeatmap()} />
 */
export const PasteImport = function PasteImport({
  zone,
  trigger,
  categories,
  onImported,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialText,
}: PasteImportProps) {
  const [selectedCategoryId] = useSelectedCategory()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Support both controlled (D7) and uncontrolled (trigger-only) usage.
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (isControlled) controlledOnOpenChange?.(next)
    else setUncontrolledOpen(next)
  }

  // The batch id persists across retries (idempotency) and is cleared on
  // success + close so a fresh paste gets a new id.
  const batchIdRef = useRef<string | null>(null)

  const createCompletedMutation = useMutation(
    orpc.completed.createMany.mutationOptions({}),
  )
  const createTodoMutation = useMutation(
    orpc.todo.createMany.mutationOptions({}),
  )
  const deleteCompletedMutation = useMutation(
    orpc.completed.deleteMany.mutationOptions({}),
  )
  const deleteTodoMutation = useMutation(
    orpc.todo.deleteMany.mutationOptions({}),
  )

  const isSubmitting =
    createCompletedMutation.isPending || createTodoMutation.isPending

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Fresh id + cleared error on every close so a reopen is a new batch.
      batchIdRef.current = null
      setError(null)
    }
    setOpen(next)
  }

  /**
   * Fire the success toast with a 10s Undo that deletes the whole batch by id.
   * Undo re-invalidates via `onImported` so the heatmap/list snap back.
   */
  const showUndoToast = (batch: LastImport) => {
    const successCopy =
      batch.zone === 'completed'
        ? `${batch.count.toLocaleString()} added — today's lit`
        : `${batch.count.toLocaleString()} added to your list`

    const toastId = toast.success(successCopy, {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          const undo =
            batch.zone === 'completed'
              ? deleteCompletedMutation
              : deleteTodoMutation
          undo.mutate(
            { importBatchId: batch.importBatchId },
            {
              onSuccess: () => {
                toast.dismiss(toastId)
                // Re-invalidate so the undone rows disappear immediately.
                onImported?.({ ...batch, count: 0 })
              },
              onError: () => {
                toast.error("Couldn't undo — the import is still saved")
              },
            },
          )
        },
      },
    })
  }

  const handleConfirm = async (items: PasteImportItem[]) => {
    setError(null)
    // Generate once; reuse on retry → idempotent on the server (P2002 no-op).
    if (batchIdRef.current === null) {
      batchIdRef.current = crypto.randomUUID()
    }
    const importBatchId = batchIdRef.current

    try {
      const result = await match(zone)
        .with('completed', async () =>
          createCompletedMutation.mutateAsync({ items, importBatchId }),
        )
        .with('todo', async () =>
          createTodoMutation.mutateAsync({ items, importBatchId }),
        )
        .exhaustive()

      const batch: LastImport = {
        importBatchId,
        zone,
        count: result.count,
        // Retain full items (title + categoryId) so Move-to-Completed can
        // replay them with all per-row overrides intact, not just titles.
        items,
        expiresAt: Date.now() + UNDO_WINDOW_MS,
      }

      // Success: clear the id (next open = new batch), close, notify, toast.
      batchIdRef.current = null
      setOpen(false)
      onImported?.(batch)
      showUndoToast(batch)
    } catch {
      // Offline / server error: keep the dialog open, preserve the paste, and
      // keep the SAME batch id so "Try again" is idempotent. The error line
      // renders inside the dialog; a toast mirrors it for discoverability.
      setError("Couldn't reach the server — your paste is safe")
      toast.error("Couldn't reach the server — your paste is safe")
    }
  }

  return (
    <PasteImportDialog
      zone={zone}
      categories={categories}
      defaultCategoryId={selectedCategoryId}
      initialText={initialText}
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      isSubmitting={isSubmitting}
      error={error}
      onConfirm={handleConfirm}
    />
  )
}
