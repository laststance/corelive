'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { LastImport } from '@/components/import/PasteImport'
import { broadcastCategorySync } from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'

/**
 * Controller returned by {@link useTodoPasteImport} — spread its fields across
 * `AddTodoForm` (onBulkPaste), the controlled `PasteImport`, and `ImportUndoBanner`.
 */
export interface TodoPasteImportController {
  /** Controlled open state for the seeded dialog → `PasteImport open`. */
  isOpen: boolean
  /** Controlled open setter → `PasteImport onOpenChange`. */
  setOpen: (open: boolean) => void
  /** Pasted text that seeds the dialog's textarea → `PasteImport initialText`. */
  seedText: string
  /** Bumped per paste; re-keys the dialog so a still-mounted one re-seeds → `PasteImport key`. */
  seedNonce: number
  /** The just-imported batch driving the inline undo banner, or null → `ImportUndoBanner lastImport`. */
  lastImport: LastImport | null
  /** Open the dialog seeded with a freshly pasted list → `AddTodoForm onBulkPaste`. */
  openWithPaste: (pastedText: string) => void
  /** Record the import + refresh queries/windows → `PasteImport onImported`. */
  handleImported: (result: LastImport) => void
  /** Refresh this window's queries, then broadcast to others → `ImportUndoBanner onChanged`. */
  invalidate: () => void
  /** Clear the undo banner → `ImportUndoBanner onDismiss`. */
  dismissBanner: () => void
}

/**
 * Drives todo bulk-paste import for both todo-input surfaces (main list +
 * Floating Navigator): a multi-line paste opens the seeded confirm dialog, and a
 * confirmed import refreshes THIS window's queries directly then broadcasts so
 * other windows refresh too (a window never receives its own broadcast). Shared
 * so both surfaces re-create the identical invalidate+broadcast wiring the
 * retired `TodoImportEntry` owned (Issue #110).
 *
 * @returns A {@link TodoPasteImportController} to wire into `AddTodoForm`,
 *   `PasteImport`, and `ImportUndoBanner`.
 * @example
 * const paste = useTodoPasteImport()
 * <AddTodoForm onBulkPaste={paste.openWithPaste} ... />
 * <PasteImport zone="todo" key={paste.seedNonce} initialText={paste.seedText}
 *   open={paste.isOpen} onOpenChange={paste.setOpen} onImported={paste.handleImported} ... />
 * <ImportUndoBanner lastImport={paste.lastImport} onDismiss={paste.dismissBanner} onChanged={paste.invalidate} />
 */
export function useTodoPasteImport(): TodoPasteImportController {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [seedText, setSeedText] = useState('')
  // Bumped on each paste so re-keying the controlled dialog re-runs its
  // `useState(initialText)` seed even though it stays mounted between pastes.
  const [seedNonce, setSeedNonce] = useState(0)
  const [lastImport, setLastImport] = useState<LastImport | null>(null)

  // The importing window refreshes its own todo list + category counts + heatmap
  // directly (it never receives its own broadcast), then broadcasts so the other
  // windows' sync subscribers refresh too. Mirrors the retired TodoImportEntry.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
    queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
    queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
    broadcastTodoSync()
    broadcastCategorySync()
  }

  // A multi-line paste seeds + opens the dialog; the nonce bump forces a re-seed.
  const openWithPaste = (pastedText: string) => {
    setSeedText(pastedText)
    setSeedNonce((nonce) => nonce + 1)
    setIsOpen(true)
  }

  const handleImported = (result: LastImport) => {
    invalidate()
    // count === 0 is the Undo result — clear the banner instead of showing it.
    setLastImport(result.count === 0 ? null : result)
  }

  const dismissBanner = () => {
    setLastImport(null)
  }

  return {
    isOpen,
    setOpen: setIsOpen,
    seedText,
    seedNonce,
    lastImport,
    openWithPaste,
    handleImported,
    invalidate,
    dismissBanner,
  }
}
