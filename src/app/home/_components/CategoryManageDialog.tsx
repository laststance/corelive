'use client'

import { useQuery } from '@tanstack/react-query'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { useState } from 'react'

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
import { orpc } from '@/lib/orpc/client-query'
import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryWithCount,
} from '@/server/schemas/category'

/** Tailwind background color classes mapped to category color names */
const COLOR_DOT_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
}

const getColorDotClass = (color: string): string =>
  COLOR_DOT_CLASSES[color] ?? 'bg-muted-foreground'

interface CategoryManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Dialog for managing categories: inline rename, color change, and delete with confirmation.
 * When a category is deleted, its tasks become uncategorized.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Callback to toggle dialog visibility
 */
export function CategoryManageDialog({
  open,
  onOpenChange,
}: CategoryManageDialogProps) {
  const { updateMutation, deleteMutation } = useCategoryMutations()

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<CategoryColor>('blue')

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<CategoryWithCount | null>(
    null,
  )

  // Fetch categories
  const { data } = useQuery(orpc.category.list.queryOptions({}))
  const categories: CategoryWithCount[] = data?.categories ?? []

  /**
   * Enters inline edit mode for a category.
   */
  const startEditing = (category: CategoryWithCount) => {
    setEditingId(category.id)
    setEditName(category.name)
    setEditColor(category.color as CategoryColor)
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
   * Confirms and executes category deletion.
   */
  const confirmDelete = () => {
    if (!deleteTarget) return

    deleteMutation.mutate(
      { id: deleteTarget.id },
      { onSuccess: () => setDeleteTarget(null) },
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Rename, recolor, or delete categories. Deleting a category makes
              its tasks uncategorized.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            {categories.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No categories yet. Add one from the sidebar.
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
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit()
                          if (e.key === 'Escape') cancelEdit()
                        }}
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
                      {/* eslint-disable-next-line dslint/token-only -- tabular-nums is standard Tailwind utility */}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {category._count.todos} tasks
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() => startEditing(category)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(category)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{deleteTarget.name}</strong> will be deleted.
                  {deleteTarget._count.todos > 0 && (
                    <>
                      {' '}
                      {deleteTarget._count.todos} task
                      {deleteTarget._count.todos > 1 ? 's' : ''} will become
                      uncategorized.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="text-destructive-foreground hover:bg-destructive/90 bg-destructive" // eslint-disable-line dslint/token-only -- shadcn destructive tokens
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
