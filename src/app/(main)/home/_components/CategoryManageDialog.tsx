'use client'

import { useQuery } from '@tanstack/react-query'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import {
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCategoryMutations } from '@/hooks/useCategoryMutations'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { getColorDotClass } from '@/lib/category-colors'
import { getLiveEditorHost } from '@/lib/live-editor/liveEditorHost'
import { orpc } from '@/lib/orpc/client-query'
import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryWithCount,
} from '@/server/schemas/category'

interface CategoryManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Tells a settled category from one whose create is still in flight.
 * {@link useCategoryMutations} gives an optimistic row `id: -Date.now()`, and the
 * server only answers to real ids, so a pending row must stay inert.
 * @param category - Any row from the category list cache.
 * @returns true once the server has assigned a real id.
 * @example
 * hasServerId({ id: -1788781333000, … }) // => false
 */
const hasServerId = (category: CategoryWithCount): boolean => category.id > 0

/**
 * Dialog for managing categories: create, inline rename, color change, and
 * delete with confirmation. Deleting a category reassigns its tasks to the
 * default category and carries its unsaved draft over with them.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Callback to toggle dialog visibility
 */
export const CategoryManageDialog = function CategoryManageDialog({
  open,
  onOpenChange,
}: CategoryManageDialogProps) {
  const { createMutation, updateMutation, deleteMutation } =
    useCategoryMutations()
  const isClerkQueryReady = useClerkQueryReady()

  // Create row state
  const [newName, setNewName] = useState('')

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<CategoryColor>('blue')

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<CategoryWithCount | null>(
    null,
  )

  // Fetch categories
  const { data } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: open && isClerkQueryReady,
  })
  const categories: CategoryWithCount[] = data?.categories ?? []
  const defaultCategory = categories.find((category) => category.isDefault)
  const defaultCategoryName = defaultCategory?.name ?? 'the default category'

  /**
   * Wraps onOpenChange to reset editing state when the dialog closes.
   * Prevents stale inline-edit UI from reappearing on reopen.
   */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setEditingId(null)
      setEditName('')
      setEditColor('blue')
      setNewName('')
    }
    onOpenChange(nextOpen)
  }

  /**
   * Adds the typed category. Colour is omitted on purpose — the schema defaults
   * it to blue and the pencil row recolours afterwards.
   */
  const createCategory = () => {
    const name = newName.trim()
    if (!name) return

    createMutation.mutate({ name })
    // Cleared here, not in onSuccess: the add is optimistic, so an onSuccess
    // clear lands a round trip later and would wipe a second name mid-typing.
    setNewName('')
  }

  const handleNewNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewName(event.target.value)
  }

  const handleNewNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') createCategory()
  }

  /**
   * Enters inline edit mode for a category.
   */
  const startEditing = (category: CategoryWithCount) => {
    setEditingId(category.id)
    setEditName(category.name)
    setEditColor(category.color)
  }

  /**
   * Saves the edited category name/color.
   */
  const saveEdit = () => {
    if (editingId === null || !editName.trim()) return

    updateMutation.mutate(
      {
        id: editingId,
        data: { name: editName.trim(), color: editColor },
      },
      { onSuccess: () => setEditingId(null) },
    )
  }

  /**
   * Cancels inline editing.
   */
  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditColor('blue')
  }

  /**
   * Moves the doomed category's unsaved draft into the default category before
   * the row disappears. The server reassigns Todo and Completed rows, but the
   * in-progress text lives per-category on the device (localStorage on the web,
   * config.json in the panel) and nothing would ever reach it again.
   * @param doomedCategoryId - The category about to be deleted.
   * @returns Nothing; resolves once the draft has been carried over.
   * @example
   * await rescueDraft(12) // appends category 12's draft to the default's
   */
  const rescueDraft = async (doomedCategoryId: number) => {
    if (!defaultCategory || defaultCategory.id === doomedCategoryId) return

    // ponytail: per-host rescue — deleting from a browser tab carries the
    // browser's draft, not the Electron panel's copy in config.json. Upgrade
    // when the two note stores are unified.
    const host = getLiveEditorHost()
    const doomedDraft = (await host.note.get(doomedCategoryId)).trim()
    if (!doomedDraft) return

    const keptDraft = await host.note.get(defaultCategory.id)
    await host.note.set(
      defaultCategory.id,
      keptDraft ? `${keptDraft.trimEnd()}\n${doomedDraft}` : doomedDraft,
    )
    await host.note.set(doomedCategoryId, '')
  }

  /**
   * Confirms and executes category deletion.
   */
  const confirmDelete = () => {
    if (!deleteTarget || deleteMutation.isPending) return

    const doomedCategoryId = deleteTarget.id
    // The draft moves first: if the delete lands and this had not run, the text
    // would still be on disk with no category left to reach it from.
    void rescueDraft(doomedCategoryId).finally(() => {
      deleteMutation.mutate(
        { id: doomedCategoryId },
        { onSuccess: () => setDeleteTarget(null) },
      )
    })
  }

  const handleEditNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEditName(event.target.value)
  }

  const handleEditNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') saveEdit()
    if (event.key === 'Escape') cancelEdit()
  }

  const handleEditCategoryClick = (event: MouseEvent<HTMLButtonElement>) => {
    const categoryId = Number(event.currentTarget.dataset.categoryId)
    const category = categories.find((candidate) => candidate.id === categoryId)
    if (category) startEditing(category)
  }

  const handleDeleteCategoryClick = (event: MouseEvent<HTMLButtonElement>) => {
    const categoryId = Number(event.currentTarget.dataset.categoryId)
    const category = categories.find((candidate) => candidate.id === categoryId)
    if (category) setDeleteTarget(category)
  }

  const handleDeleteDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setDeleteTarget(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Add, rename, recolor, or delete categories. Nothing you wrote is
              lost — deleting a category moves its tasks to{' '}
              {defaultCategoryName}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={handleNewNameChange}
              onKeyDown={handleNewNameKeyDown}
              className="h-8 flex-1"
              maxLength={30}
              placeholder="New category"
              aria-label="New category name"
            />
            <Button
              size="sm"
              className="h-8"
              onClick={createCategory}
              disabled={!newName.trim() || createMutation.isPending}
            >
              Add
            </Button>
          </div>

          {/* The panel floor is 320px tall (WindowManager minHeight), and
              DialogContent sets no height cap, so a long list would push the
              confirm controls off-screen with no way back. A viewport-relative
              cap is the point here — no spacing token can express "half of
              whatever window this dialog happens to be in". */}
          <div
            className="max-h-[50vh] space-y-2 overflow-y-auto py-4" // eslint-disable-line dslint/token-only -- viewport-relative by necessity
          >
            {categories.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No categories yet. Add your first one above.
              </p>
            ) : (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="hover:bg-accent/50 flex items-center gap-2 rounded-md p-2"
                >
                  {editingId === category.id ? (
                    /* Inline edit mode */
                    <>
                      {/* Color picker */}
                      <div className="flex gap-1">
                        {CATEGORY_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setEditColor(color)}
                            className={`h-4 w-4 rounded-full ${getColorDotClass(color)} ${
                              editColor === color
                                ? 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                                : ''
                            }`}
                            aria-label={`Select ${color}`}
                          />
                        ))}
                      </div>
                      <Input
                        value={editName}
                        onChange={handleEditNameChange}
                        onKeyDown={handleEditNameKeyDown}
                        className="h-8 flex-1"
                        maxLength={30}
                        autoFocus
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={saveEdit}
                        disabled={!editName.trim()}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={cancelEdit}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    /* Display mode */
                    <>
                      <span
                        className={`h-3 w-3 rounded-full ${getColorDotClass(category.color)}`}
                      />

                      <span className="flex-1 text-sm">{category.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {category._count.todos} tasks
                      </span>
                      {/* A row still waiting on its real id has nothing the
                          server would answer to — rename and delete would come
                          back "Category not found" on a row just created. */}
                      {hasServerId(category) && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            data-category-id={category.id}
                            onClick={handleEditCategoryClick}
                            aria-label={`Rename ${category.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!category.isDefault && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              data-category-id={category.id}
                              onClick={handleDeleteCategoryClick}
                              aria-label={`Delete ${category.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{deleteTarget.name}</strong> will be removed. Your
                  record stays — its tasks move to{' '}
                  <strong>{defaultCategoryName}</strong>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="text-destructive-foreground hover:bg-destructive/90 bg-destructive" // eslint-disable-line dslint/token-only -- shadcn destructive tokens
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
