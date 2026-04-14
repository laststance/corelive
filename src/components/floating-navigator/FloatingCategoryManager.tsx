'use client'

import React, { lazy, Suspense, useState } from 'react'

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
import { Input } from '@/components/ui/input'
import { getColorDotClass } from '@/lib/category-colors'
import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryWithCount,
} from '@/server/schemas/category'

// Lazy load icons (same pattern as FloatingNavigator)
const Check = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Check })),
)
const X = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.X })),
)
const Pencil = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Pencil })),
)
const Trash2 = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Trash2 })),
)
const Plus = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Plus })),
)
const ArrowLeft = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.ArrowLeft })),
)

/** Shared loading placeholder for lazy-loaded icons */
const IconFallback = () => (
  <div className="h-3 w-3 animate-pulse rounded bg-muted" />
)

interface FloatingCategoryManagerProps {
  categories: CategoryWithCount[]
  onCategoryCreate: (name: string, color: CategoryColor) => void
  onCategoryUpdate: (
    id: number,
    data: { name?: string; color?: CategoryColor },
  ) => void
  onCategoryDelete: (id: number) => void
  onClose: () => void
  isCreatePending?: boolean
  isUpdatePending?: boolean
  isDeletePending?: boolean
}

/**
 * Compact category management panel for the Floating Navigator.
 * Provides inline editing, color picker, add form, and delete confirmation.
 * Reuses the same optimistic mutation pattern as the main app's CategoryManageDialog.
 *
 * @param categories - List of categories with todo counts
 * @param onCategoryCreate - Callback to create a new category
 * @param onCategoryUpdate - Callback to update category name/color
 * @param onCategoryDelete - Callback to delete a category
 * @param onClose - Callback to close the manage panel and return to task list
 * @param isCreatePending - Whether a create mutation is in flight
 * @param isUpdatePending - Whether an update mutation is in flight
 * @param isDeletePending - Whether a delete mutation is in flight
 * @returns
 * - Category list with inline edit/delete actions
 * - Add new category form with color picker
 * - AlertDialog for delete confirmation
 * @example
 * <FloatingCategoryManager
 *   categories={categories}
 *   onCategoryCreate={(name, color) => createMutation.mutate({ name, color })}
 *   onCategoryUpdate={(id, data) => updateMutation.mutate({ id, data })}
 *   onCategoryDelete={(id) => deleteMutation.mutate({ id })}
 *   onClose={() => setShowManagePanel(false)}
 * />
 */
export function FloatingCategoryManager({
  categories,
  onCategoryCreate,
  onCategoryUpdate,
  onCategoryDelete,
  onClose,
  isCreatePending = false,
  isUpdatePending = false,
  isDeletePending = false,
}: FloatingCategoryManagerProps) {
  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<CategoryColor>('blue')

  // Add new category state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<CategoryColor>('blue')

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<CategoryWithCount | null>(
    null,
  )

  /**
   * Enters inline edit mode for a category.
   * @param category - The category to edit
   */
  const startEditing = (category: CategoryWithCount) => {
    setEditingId(category.id)
    setEditName(category.name)
    setEditColor(category.color as CategoryColor)
  }

  /**
   * Saves the inline edit and exits edit mode.
   */
  const saveEdit = () => {
    if (editingId === null || !editName.trim()) return
    onCategoryUpdate(editingId, { name: editName.trim(), color: editColor })
    setEditingId(null)
  }

  /**
   * Cancels inline editing and resets state.
   */
  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditColor('blue')
  }

  /**
   * Creates a new category and resets the add form.
   */
  const handleCreate = () => {
    if (!newName.trim()) return
    onCategoryCreate(newName.trim(), newColor)
    setNewName('')
    setNewColor('blue')
    setShowAddForm(false)
  }

  /**
   * Confirms and executes category deletion.
   */
  const confirmDelete = () => {
    if (!deleteTarget) return
    onCategoryDelete(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Manager header with back and add buttons */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0"
            aria-label="Back to tasks"
            title="Back to tasks"
          >
            <Suspense fallback={<IconFallback />}>
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            </Suspense>
          </Button>
          <h2 className="flex-1 text-sm font-medium">Manage Categories</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="h-6 w-6 p-0"
            aria-label="Add new category"
            title="Add new category"
          >
            <Suspense fallback={<IconFallback />}>
              <Plus className="h-3 w-3" aria-hidden="true" />
            </Suspense>
          </Button>
        </div>

        {/* Add new category form (toggled by + button) */}
        {showAddForm && (
          <div className="space-y-2 border-b p-3">
            <div
              className="flex gap-1"
              role="radiogroup"
              aria-label="Category color"
            >
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  className={`h-4 w-4 rounded-full ${getColorDotClass(color)} ${
                    newColor === color
                      ? 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                      : ''
                  }`}
                  role="radio"
                  aria-checked={newColor === color}
                  aria-label={`${color} color`}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') setShowAddForm(false)
                }}
                placeholder="Category name"
                className="h-7 flex-1 text-xs"
                maxLength={30}
                autoFocus
                aria-label="New category name"
              />
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newName.trim() || isCreatePending}
                className="h-7 px-2 text-xs"
              >
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Category list */}
        <div
          className="flex-1 overflow-y-auto p-2"
          role="list"
          aria-label="Categories"
        >
          <div className="space-y-1">
            {categories.map((category) => (
              <div
                key={category.id}
                className="hover:bg-muted/50 group flex items-center gap-2 rounded p-2"
                role="listitem"
              >
                {editingId === category.id ? (
                  /* Inline edit mode: color picker + name input + save/cancel */
                  <>
                    <div
                      className="flex gap-1"
                      role="radiogroup"
                      aria-label="Category color"
                    >
                      {CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEditColor(color)}
                          className={`h-3 w-3 rounded-full ${getColorDotClass(color)} ${
                            editColor === color
                              ? 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                              : ''
                          }`}
                          role="radio"
                          aria-checked={editColor === color}
                          aria-label={`${color} color`}
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
                      className="h-6 flex-1 text-xs"
                      maxLength={30}
                      autoFocus
                      aria-label="Edit category name"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={saveEdit}
                      disabled={!editName.trim() || isUpdatePending}
                      className="h-6 w-6 p-0"
                      aria-label="Save changes"
                      title="Save (Enter)"
                    >
                      <Suspense fallback={<IconFallback />}>
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </Suspense>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelEdit}
                      className="h-6 w-6 p-0"
                      aria-label="Cancel editing"
                      title="Cancel (Escape)"
                    >
                      <Suspense fallback={<IconFallback />}>
                        <X className="h-3 w-3" aria-hidden="true" />
                      </Suspense>
                    </Button>
                  </>
                ) : (
                  /* Display mode: color dot + name + count + edit/delete */
                  <>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${getColorDotClass(category.color)}`}
                    />
                    <span className="flex-1 truncate text-xs">
                      {category.name}
                    </span>
                    {/* eslint-disable-next-line dslint/token-only -- tabular-nums is standard Tailwind utility */}
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {category._count.todos}
                    </span>
                    <div className="flex gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(category)}
                        className="h-6 w-6 p-0 text-muted-foreground"
                        aria-label={`Edit ${category.name}`}
                        title="Edit category"
                      >
                        <Suspense fallback={<IconFallback />}>
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                        </Suspense>
                      </Button>
                      {!category.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(category)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          aria-label={`Delete ${category.name}`}
                          title="Delete category"
                        >
                          <Suspense fallback={<IconFallback />}>
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </Suspense>
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Delete category?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {deleteTarget && (
                <>
                  <strong>{deleteTarget.name}</strong> will be deleted.
                  {deleteTarget._count.todos > 0 && (
                    <>
                      {' '}
                      {deleteTarget._count.todos} task
                      {deleteTarget._count.todos > 1 ? 's' : ''} will be moved
                      to the default category.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeletePending}
              className="text-destructive-foreground hover:bg-destructive/90 h-7 bg-destructive text-xs" // eslint-disable-line dslint/token-only -- shadcn destructive tokens
            >
              {isDeletePending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
