'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste } from 'lucide-react'
import { memo, useCallback, useState } from 'react'

import { ImportUndoBanner } from '@/components/import/ImportUndoBanner'
import { PasteImport, type LastImport } from '@/components/import/PasteImport'
import { Button } from '@/components/ui/button'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { orpc } from '@/lib/orpc/client-query'
import { subscribeToOpenCompletedImport } from '@/lib/paste-import-channel'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'

/**
 * Completed-zone paste-import entry point (D4). Renders the Import button +
 * dialog and the 60s inline undo banner (D5), owns the dialog open state, and
 * re-invalidates the heatmap + day-detail + todo caches on import/undo so the
 * heatmap fill (the celebration) and the Completed list update immediately.
 * Subscribes to the cross-window open-intent so the Floating Navigator's Import
 * (D7) can open this dialog after focusing the main window.
 *
 * @param props.variant - `'button'` for the toolbar affordance (default),
 *   `'inline'` for the empty-state discoverability surface.
 * @returns The Completed Import button + dialog + undo banner.
 * @example
 * <CompletedImportEntry />
 * @example
 * <CompletedImportEntry variant="inline" />
 */
export const CompletedImportEntry = memo(function CompletedImportEntry({
  variant = 'button',
}: {
  variant?: 'button' | 'inline'
}) {
  const queryClient = useQueryClient()
  const isClerkQueryReady = useClerkQueryReady()
  const [open, setOpen] = useState(false)
  const [lastImport, setLastImport] = useState<LastImport | null>(null)

  // Categories injected as a prop into PasteImport (never fetched inside it).
  const { data: categoryData } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: isClerkQueryReady,
  })
  const categories = categoryData?.categories ?? []

  // Semantic open handler (instead of passing the raw setOpen setter down).
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
  }, [])

  const dismissBanner = useCallback(() => {
    setLastImport(null)
  }, [])

  // Cross-window D7: the floating navigator broadcasts an open-intent after it
  // focuses the main window; only this main-window entry opens the dialog.
  useCycleEffect(() => {
    return subscribeToOpenCompletedImport(() => setOpen(true))
  }, [])

  // Invalidate everything the Completed import touches: heatmap (fill), the
  // day-detail dialog cache, the journal (the Completed Tasks list — imports
  // write the Completed table it reads), and the todo list; broadcast so the
  // floating navigator + braindump windows stay in lockstep. The journal key is
  // invalidated DIRECTLY here, not via broadcast, because the importing window
  // never receives its own BroadcastChannel message.
  const invalidateCompleted = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
    queryClient.invalidateQueries({ queryKey: orpc.completed.dayDetail.key() })
    queryClient.invalidateQueries({ queryKey: orpc.completed.journal.key() })
    queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
    broadcastTodoSync()
  }, [queryClient])

  const handleImported = useCallback(
    (result: LastImport) => {
      invalidateCompleted()
      // count===0 marks an undo → drop the banner; otherwise arm the 60s undo.
      setLastImport(result.count === 0 ? null : result)
    },
    [invalidateCompleted],
  )

  const trigger =
    variant === 'inline' ? (
      <Button type="button" variant="outline" size="sm">
        <ClipboardPaste className="size-4" aria-hidden="true" />
        Import past wins
      </Button>
    ) : (
      <Button type="button" variant="outline" size="sm">
        <ClipboardPaste className="size-4" aria-hidden="true" />
        Import
      </Button>
    )

  return (
    <div className="flex flex-col gap-2">
      <PasteImport
        zone="completed"
        categories={categories}
        trigger={trigger}
        open={open}
        onOpenChange={handleOpenChange}
        onImported={handleImported}
      />
      <ImportUndoBanner
        lastImport={lastImport}
        onDismiss={dismissBanner}
        onChanged={invalidateCompleted}
      />
    </div>
  )
})
