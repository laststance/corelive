'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste } from 'lucide-react'
import { memo, useCallback, useState } from 'react'

import { ImportUndoBanner } from '@/components/import/ImportUndoBanner'
import { PasteImport, type LastImport } from '@/components/import/PasteImport'
import { Button } from '@/components/ui/button'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { broadcastCategorySync } from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'

/**
 * Active-Todo-zone paste-import entry point (D4). Renders the Import button +
 * dialog and the 60s inline undo banner (D5, which for Todo also offers
 * Move-to-Completed — P2 wrong-zone recovery), owns the dialog open state, and
 * re-invalidates the todo list + category counts on import/undo/move. Todo
 * imports are incomplete tasks (bulk entry), so they do NOT light the heatmap —
 * the dialog's pre-confirm note sets that expectation.
 *
 * @param props.variant - `'button'` for the toolbar affordance (default),
 *   `'inline'` for the empty-state discoverability surface.
 * @returns The Todo Import button + dialog + undo banner.
 * @example
 * <TodoImportEntry />
 */
export const TodoImportEntry = memo(function TodoImportEntry({
  variant = 'button',
}: {
  variant?: 'button' | 'inline'
}) {
  const queryClient = useQueryClient()
  const isClerkQueryReady = useClerkQueryReady()
  const [open, setOpen] = useState(false)
  const [lastImport, setLastImport] = useState<LastImport | null>(null)

  const { data: categoryData } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: isClerkQueryReady,
  })
  const categories = categoryData?.categories ?? []

  // Todo import touches the todo list + category counts. Move-to-Completed also
  // touches the heatmap, so invalidate it too (cheap; covers the recovery path).
  const invalidateTodo = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
    queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
    queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
    broadcastTodoSync()
    broadcastCategorySync()
  }, [queryClient])

  // Semantic open handler (instead of passing the raw setOpen setter down).
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
  }, [])

  const dismissBanner = useCallback(() => {
    setLastImport(null)
  }, [])

  const handleImported = useCallback(
    (result: LastImport) => {
      invalidateTodo()
      setLastImport(result.count === 0 ? null : result)
    },
    [invalidateTodo],
  )

  const trigger =
    variant === 'inline' ? (
      <Button type="button" variant="outline" size="sm">
        <ClipboardPaste className="size-4" aria-hidden="true" />
        Import a list
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
        zone="todo"
        categories={categories}
        trigger={trigger}
        open={open}
        onOpenChange={handleOpenChange}
        onImported={handleImported}
      />
      <ImportUndoBanner
        lastImport={lastImport}
        onDismiss={dismissBanner}
        onChanged={invalidateTodo}
      />
    </div>
  )
})
