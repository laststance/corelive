'use client'

import { ORPCError } from '@orpc/client'
import { useQuery } from '@tanstack/react-query'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'

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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateEffect } from '@/hooks/use-update-effect'
import { useCategoryMutations } from '@/hooks/useCategoryMutations'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { getColorDotClass } from '@/lib/category-colors'
import { broadcastCategorySync } from '@/lib/category-sync-channel'
import {
  createCategoryHierarchy,
  getCategoryPath,
} from '@/lib/categoryHierarchy'
import {
  appendCategoryDraft,
  flushCategoryDraft,
} from '@/lib/live-editor/appendCategoryDraft'
import {
  getCategoryDraftRescueReceipt,
  prepareCategoryDraftRescueReceipt,
  hasCategoryDraftRescueLanded,
  recordCategoryDraftRescueReceipt,
} from '@/lib/live-editor/categoryDraftRescueReceipts'
import { getLiveEditorHost } from '@/lib/live-editor/liveEditorHost'
import { getLocalStorageAvailability } from '@/lib/live-editor/localStorageSlot'
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
 * Blocks composition control keys before forms or cmdk treat them as commands.
 * @returns Whether the browser is composing, including Safari's 229 fallback.
 * @example
 * if (isCategoryComposing(event)) return
 */
export function isCategoryComposing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

/**
 * Offers root destinations for organization forms, preventing third-level nesting.
 * @example
 * <CategoryParentSelect categories={categories} value={null} onChange={setParent} />
 */
function CategoryParentSelect({
  categories,
  value,
  onChange,
  disabled = false,
}: {
  categories: CategoryWithCount[]
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={value === null ? 'root' : String(value)}
      onValueChange={(selected) =>
        onChange(selected === 'root' ? null : Number(selected))
      }
      disabled={disabled}
    >
      <SelectTrigger aria-label="Parent category" className="min-h-11 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="root">None — main category</SelectItem>
        {categories
          .filter((category) => category.id > 0 && category.parentId === null)
          .map((category) => (
            <SelectItem key={category.id} value={String(category.id)}>
              {category.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Exposes the existing color choices in a touch-sized select for create/edit forms.
 * @example
 * <CategoryColorSelect value="blue" onChange={setColor} />
 */
function CategoryColorSelect({
  value,
  onChange,
}: {
  value: CategoryColor
  onChange: (color: CategoryColor) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(selected) => {
        const color = CATEGORY_COLORS.find(
          (candidate) => candidate === selected,
        )
        if (color) onChange(color)
      }}
    >
      <SelectTrigger aria-label="Category color" className="min-h-11 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORY_COLORS.map((color) => (
          <SelectItem key={color} value={color}>
            <span
              className={`size-3 rounded-full ${getColorDotClass(color)}`}
            />
            {color}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Checks local form input before submitting, leaving spelling and case untouched.
 * @returns A human-readable issue or null when the server can validate the write.
 * @example
 * categoryNameError('Work', null, categories) // 'A main category named "Work" already exists.'
 */
function categoryNameError(
  name: string,
  parentId: number | null,
  categories: CategoryWithCount[],
  excludingId?: number,
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a category name.'
  if (trimmed.length > 30) return 'Use 30 characters or fewer.'
  if (
    categories.some(
      (category) =>
        category.id !== excludingId &&
        category.name === trimmed &&
        (category.parentId ?? null) === parentId,
    )
  )
    return `A ${parentId === null ? 'main category' : 'subcategory'} named "${trimmed}" already exists.`
  return null
}

/**
 * Displays server conflict messages while keeping transport errors actionable.
 * @returns User-facing explanation without implying an uncertain write rolled back.
 * @example
 * categoryFormError(new Error('fetch')) // 'Could not confirm the change. Check the refreshed list and retry.'
 */
function categoryFormError(error: unknown): string {
  return error instanceof ORPCError
    ? error.message
    : 'Could not confirm the change. Check the refreshed list and retry.'
}

/**
 * Shared create form preserves input on failure and only reports a confirmed server category.
 * @param onCreated - Picker selects the result; management only clears its form.
 * @example
 * <CategoryCreationForm categories={categories} onCreated={(category) => select(category.id)} />
 */
function CategoryCreationForm({
  categories,
  initialName = '',
  initialParentId = null,
  onCreated,
  onCancel,
}: {
  categories: CategoryWithCount[]
  initialName?: string
  initialParentId?: number | null
  onCreated: (category: CategoryWithCount) => void
  onCancel?: () => void
}) {
  const { createMutation } = useCategoryMutations()
  const [form, setForm] = useState({
    name: initialName,
    parentId: initialParentId,
    color:
      categories.find((category) => category.id === initialParentId)?.color ??
      'blue',
    colorTouched: false,
    error: '',
  })
  const error = createMutation.isPending
    ? ''
    : form.error ||
      (form.name.trim()
        ? categoryNameError(form.name, form.parentId, categories)
        : null)
  const submit = async () => {
    const validation = categoryNameError(form.name, form.parentId, categories)
    if (validation || createMutation.isPending) {
      if (validation) setForm((current) => ({ ...current, error: validation }))
      return
    }
    setForm((current) => ({ ...current, error: '' }))
    try {
      const category = await createMutation.mutateAsync({
        name: form.name.trim(),
        parentId: form.parentId,
        color: form.colorTouched ? form.color : undefined,
      })
      // Server IDs alone can be used as writing destinations.
      if (category.id > 0) {
        onCreated({ ...category, _count: { todos: 0 }, recordCount: 0 })
        setForm((current) => ({ ...current, name: '', error: '' }))
      }
    } catch (failure) {
      setForm((current) => ({ ...current, error: categoryFormError(failure) }))
    }
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      onKeyDownCapture={(event) => {
        if (
          isCategoryComposing(event) &&
          (event.key === 'Enter' ||
            event.key === 'Escape' ||
            event.keyCode === 229)
        ) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="new-category-name">Name</Label>
        <Input
          id="new-category-name"
          autoFocus={initialParentId !== null}
          value={form.name}
          aria-label="New category name"
          placeholder="New category"
          disabled={createMutation.isPending}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              name: event.target.value,
              error: '',
            }))
          }
          className="min-h-11"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Parent</Label>
          <CategoryParentSelect
            categories={categories}
            value={form.parentId}
            disabled={createMutation.isPending}
            onChange={(parentId) =>
              setForm((current) => ({
                ...current,
                parentId,
                color: current.colorTouched
                  ? current.color
                  : (categories.find((category) => category.id === parentId)
                      ?.color ?? 'blue'),
                error: '',
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Color</Label>
          <CategoryColorSelect
            value={form.color}
            onChange={(color) =>
              setForm((current) => ({ ...current, color, colorTouched: true }))
            }
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={createMutation.isPending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          className="min-h-11"
          disabled={
            !form.name.trim() ||
            Boolean(categoryNameError(form.name, form.parentId, categories)) ||
            createMutation.isPending
          }
        >
          {createMutation.isPending ? 'Creating…' : 'Add'}
        </Button>
      </div>
    </form>
  )
}

/**
 * Gives the picker a focused creation dialog without changing the manager's writing selection.
 * @example
 * <CategoryCreateDialog open categories={categories} onOpenChange={setOpen} onCreated={selectCreated} />
 */
export function CategoryCreateDialog({
  open,
  onOpenChange,
  categories,
  initialName,
  onCreated,
}: CategoryManageDialogProps & {
  categories: CategoryWithCount[]
  initialName: string
  onCreated: (category: CategoryWithCount) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (event.isComposing || event.keyCode === 229) event.preventDefault()
        }}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
          <DialogDescription>
            Create a main category or add a subcategory.
          </DialogDescription>
        </DialogHeader>
        <CategoryCreationForm
          categories={categories}
          initialName={initialName}
          onCancel={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Keeps rename, recolor and reparent changes in one retained inline editor.
 * @example
 * <CategoryEditor category={work} categories={categories} onClose={cancelEditing} />
 */
function CategoryEditor({
  category,
  categories,
  onClose,
}: {
  category: CategoryWithCount
  categories: CategoryWithCount[]
  onClose: () => void
}) {
  const { updateMutation } = useCategoryMutations()
  const [form, setForm] = useState({
    name: category.name,
    color: category.color,
    parentId: category.parentId,
    error: '',
  })
  const hasChildren = categories.some(
    (candidate) => candidate.parentId === category.id,
  )
  const save = async () => {
    const validation = categoryNameError(
      form.name,
      form.parentId,
      categories,
      category.id,
    )
    if (validation || updateMutation.isPending) {
      if (validation) setForm((current) => ({ ...current, error: validation }))
      return
    }
    try {
      await updateMutation.mutateAsync({
        id: category.id,
        data: category.isDefault
          ? { color: form.color }
          : {
              name: form.name.trim(),
              color: form.color,
              parentId: form.parentId,
            },
      })
      onClose()
    } catch (failure) {
      setForm((current) => ({ ...current, error: categoryFormError(failure) }))
    }
  }
  return (
    <div className="w-full space-y-2">
      {category.isDefault ? (
        <p>{category.name}</p>
      ) : (
        <Input
          onKeyDown={(event) => {
            if (isCategoryComposing(event)) {
              if (
                event.key === 'Enter' ||
                event.key === 'Escape' ||
                event.keyCode === 229
              ) {
                event.preventDefault()
                event.stopPropagation()
              }
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape') {
              event.stopPropagation()
              onClose()
            }
          }}
          aria-label="Rename category"
          value={form.name}
          autoFocus
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              name: event.target.value,
              error: '',
            }))
          }
        />
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CategoryColorSelect
          value={form.color}
          onChange={(color) => setForm((current) => ({ ...current, color }))}
        />
        <CategoryParentSelect
          categories={categories.filter(
            (candidate) => candidate.id !== category.id,
          )}
          value={form.parentId}
          disabled={
            category.isDefault || hasChildren || updateMutation.isPending
          }
          onChange={(parentId) =>
            setForm((current) => ({ ...current, parentId, error: '' }))
          }
        />
      </div>
      {hasChildren && (
        <p className="text-xs text-muted-foreground">
          Move or promote the subcategories before changing this main category’s
          parent.
        </p>
      )}
      {form.parentId !== category.parentId && (
        <p className="text-xs text-muted-foreground">
          Past entries will be grouped under the new parent.
        </p>
      )}
      {form.error && (
        <p role="alert" className="text-sm text-destructive">
          {form.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={onClose}
          disabled={updateMutation.isPending}
          aria-label="Cancel editing"
        >
          <X className="size-4" />
        </Button>
        <Button
          size="icon"
          className="size-11"
          onClick={() => void save()}
          disabled={!form.name.trim() || updateMutation.isPending}
          aria-label="Save changes"
        >
          <Check className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Holds destructive confirmation until the current-device draft and server transaction succeed.
 * @example
 * <CategoryDeletion category={work} categories={categories} onClose={closeConfirmation} />
 */
function CategoryDeletion({
  category,
  categories,
  onClose,
}: {
  category: CategoryWithCount
  categories: CategoryWithCount[]
  onClose: () => void
}) {
  const { deleteMutation } = useCategoryMutations()
  const defaultId =
    category.parentId ??
    categories.find((candidate) => candidate.isDefault)?.id ??
    null
  const [state, setState] = useState({
    destinationId: defaultId,
    error: '',
    rescuing: false,
  })
  const isSubmitting = useRef(false)
  const children = categories.filter(
    (candidate) => candidate.parentId === category.id,
  )
  const conflicts = children.filter((child) =>
    categories.some(
      (candidate) =>
        candidate.id !== category.id &&
        candidate.id !== child.id &&
        candidate.parentId === null &&
        candidate.name === child.name,
    ),
  )
  const busy = state.rescuing || deleteMutation.isPending
  const destination = categories.find(
    (candidate) =>
      candidate.id === state.destinationId &&
      candidate.id !== category.id &&
      candidate.id > 0,
  )
  const confirm = async () => {
    if (isSubmitting.current || !destination || conflicts.length) return
    isSubmitting.current = true
    let didRequestDelete = false
    setState((current) => ({ ...current, rescuing: true, error: '' }))
    try {
      // Flush React's current note before reading the device store, then persist rescue before deleting.
      await flushCategoryDraft(category.id)
      await flushCategoryDraft(destination.id)
      const source = (await getLiveEditorHost().note.get(category.id)).trim()
      if (source) {
        // Destructive deletion requires durable writing and receipt storage, never memory fallback alone.
        if (getLocalStorageAvailability() !== 'ok')
          throw new Error('Device storage is unavailable')
        let rescue = getCategoryDraftRescueReceipt(
          category.id,
          destination.id,
          source,
        )
        const destinationText = await getLiveEditorHost().note.get(
          destination.id,
        )
        const hasExistingCopy =
          rescue !== undefined &&
          hasCategoryDraftRescueLanded(rescue, destinationText)
        // An earlier saved marker alone cannot justify deleting writing removed from the destination.
        if (!hasExistingCopy) {
          const renewReceipt =
            rescue !== undefined &&
            (rescue.state === 'saved' || rescue.baseText !== destinationText)
          rescue = prepareCategoryDraftRescueReceipt(
            category.id,
            destination.id,
            destinationText,
            source,
            renewReceipt,
          )
          if (getLocalStorageAvailability() !== 'ok')
            throw new Error('The rescue intent was not durably persisted')
          // Every missing/first copy is appended; text equality without existing evidence never skips one.
          await appendCategoryDraft(destination.id, source)
        }
        if (rescue === undefined)
          throw new Error('The rescue evidence was not prepared')
        if (rescue.state === 'prepared') {
          rescue = recordCategoryDraftRescueReceipt(
            category.id,
            destination.id,
            rescue.baseText,
            source,
          )
        }
        // Quota can expire during either destination or receipt persistence after the initial probe.
        if (getLocalStorageAvailability() !== 'ok')
          throw new Error('The moved writing was not durably persisted')
        // A retried delete re-notifies peers with the original base without appending again.
        broadcastCategorySync(destination.id, rescue)
      }
      setState((current) => ({ ...current, rescuing: false }))
      didRequestDelete = true
      await deleteMutation.mutateAsync({
        id: category.id,
        targetCategoryId: destination.id,
      })
      onClose()
    } catch (failure) {
      setState((current) => ({
        ...current,
        error: didRequestDelete
          ? categoryFormError(failure)
          : 'Could not move your writing on this device. Nothing was deleted. Retry.',
      }))
    } finally {
      isSubmitting.current = false
      setState((current) => ({ ...current, rescuing: false }))
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{category.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {category.recordCount} direct records will move to{' '}
            {destination?.name ?? 'your selected category'}. Your entries will
            be kept. Writing on this device will move too; drafts on other
            devices are not moved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children.length > 0 && (
          <p className="text-sm">
            {children.map((child) => child.name).join(', ')} will become main
            categories. Their entries and writing stay where they are.
          </p>
        )}
        {conflicts.length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            Rename these subcategories before deleting:{' '}
            {conflicts.map((child) => child.name).join(', ')}. Their names
            conflict with existing main categories.
          </p>
        )}
        <Label>Move direct entries to</Label>
        <Select
          value={
            state.destinationId === null ? '' : String(state.destinationId)
          }
          onValueChange={(value) =>
            setState((current) => ({
              ...current,
              destinationId: Number(value),
              error: '',
            }))
          }
          disabled={busy}
        >
          <SelectTrigger
            aria-label="Move entries to"
            className="min-h-11 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {createCategoryHierarchy(categories)
              .ordered.filter(
                (candidate) => candidate.id > 0 && candidate.id !== category.id,
              )
              .map((candidate) => (
                <SelectItem key={candidate.id} value={String(candidate.id)}>
                  {getCategoryPath(candidate, categories)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error} Your original draft is retained.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
            disabled={busy || !destination || conflicts.length > 0}
            className="text-destructive-foreground bg-destructive" // eslint-disable-line dslint/token-only -- inherited shadcn destructive token
          >
            {state.rescuing
              ? 'Moving writing…'
              : deleteMutation.isPending
                ? 'Deleting…'
                : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Shared hierarchy manager organizes categories without changing the active writing destination.
 * @example
 * <CategoryManageDialog open onOpenChange={setOpen} />
 */
export function CategoryManageDialog({
  open,
  onOpenChange,
}: CategoryManageDialogProps) {
  const ready = useClerkQueryReady()
  const { data, isPending, isError, refetch } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: open && ready,
  })
  const categories = data?.categories ?? []
  const hierarchy = createCategoryHierarchy(categories)
  const [state, setState] = useState<{
    editingId: number | null
    deletingId: number | null
    createParentId: number | null
    notice?: string
  }>({ editingId: null, deletingId: null, createParentId: null })
  const deleteTarget = categories.find(
    (category) => category.id === state.deletingId,
  )
  useUpdateEffect(() => {
    const editingRemoved =
      state.editingId !== null &&
      !categories.some((category) => category.id === state.editingId)
    const deletingRemoved =
      state.deletingId !== null &&
      !categories.some((category) => category.id === state.deletingId)
    if (editingRemoved || deletingRemoved) {
      setState((current) => ({
        ...current,
        editingId: editingRemoved ? null : current.editingId,
        deletingId: deletingRemoved ? null : current.deletingId,
        notice: 'This category is no longer available.',
      }))
      document.getElementById('new-category-name')?.focus()
    }
  }, [categories, state.editingId, state.deletingId])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (
              event.isComposing ||
              event.keyCode === 229 ||
              (state.editingId !== null &&
                categories.some((category) => category.id === state.editingId))
            )
              event.preventDefault()
          }}
          className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-md" // eslint-disable-line dslint/token-only -- viewport header and scroll body
        >
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Create main categories and subcategories, rename, recolor, move,
              or delete. Your entries stay.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto">
            <CategoryCreationForm
              key={state.createParentId ?? 'main'}
              categories={categories}
              initialParentId={state.createParentId}
              onCreated={() =>
                setState((current) => ({ ...current, createParentId: null }))
              }
            />
            {isPending && (
              <p role="status" className="text-sm text-muted-foreground">
                Loading categories…
              </p>
            )}
            {isError && (
              <div role="alert">
                Could not load categories.
                <Button variant="outline" onClick={() => void refetch()}>
                  Retry
                </Button>
              </div>
            )}
            <ul className="space-y-2">
              {hierarchy.ordered.map((category) => (
                <li
                  key={category.id}
                  className={`rounded-md p-2 ${category.parentId ? 'ml-4 border-l' : ''}`}
                >
                  {state.editingId === category.id ? (
                    <CategoryEditor
                      category={category}
                      categories={categories}
                      onClose={() =>
                        setState((current) => ({ ...current, editingId: null }))
                      }
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-3 shrink-0 rounded-full ${getColorDotClass(category.color)}`}
                      />
                      <span className="min-w-0 flex-1 break-words text-sm">
                        {category.name}
                        {category.id < 0 && (
                          <span className="text-muted-foreground">
                            {' — Creating…'}
                          </span>
                        )}
                      </span>
                      {category.id > 0 && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 shrink-0"
                            onClick={() =>
                              setState((current) => ({
                                ...current,
                                editingId: category.id,
                              }))
                            }
                            aria-label={`${category.isDefault ? 'Recolor' : 'Rename'} ${getCategoryPath(category, categories)}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {!category.isDefault && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-11 shrink-0 text-destructive"
                              onClick={() =>
                                setState((current) => ({
                                  ...current,
                                  deletingId: category.id,
                                }))
                              }
                              aria-label={`Delete ${getCategoryPath(category, categories)}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {category.id > 0 && category.parentId === null && (
                    <Button
                      variant="ghost"
                      className="min-h-11 text-xs text-muted-foreground"
                      onClick={() => {
                        setState((current) => ({
                          ...current,
                          createParentId: category.id,
                        }))
                      }}
                    >
                      <Plus className="size-3" />
                      Add subcategory to {category.name}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {!isPending && !isError && categories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No categories yet. Add your first one above.
              </p>
            )}
            {state.notice && <p role="status">{state.notice}</p>}
          </div>
        </DialogContent>
      </Dialog>
      {deleteTarget && (
        <CategoryDeletion
          category={deleteTarget}
          categories={categories}
          onClose={() =>
            setState((current) => ({ ...current, deletingId: null }))
          }
        />
      )}
    </>
  )
}
