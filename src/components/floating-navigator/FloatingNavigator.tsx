'use client'

import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import React, { useState, useRef, lazy, Suspense } from 'react'

import { useFloatingNavigatorMenuActions } from '@/components/floating-navigator/useFloatingNavigatorMenuActions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { isFloatingNavigatorEnvironment } from '@/electron/utils/electron-client'
import { useInitialEffect } from '@/hooks/use-initial-effect'
import { useCompletionFeedback } from '@/hooks/useCompletionFeedback'
import { COLOR_DOT_CLASSES } from '@/lib/category-colors'
import { todoSortableSensors } from '@/lib/dnd-kit-sensors'
import { interceptBulkPaste } from '@/lib/interceptBulkPaste'
import { log } from '@/lib/logger'
import { requestOpenCompletedImport } from '@/lib/paste-import-channel'
import { isEnterKeyPress } from '@/lib/utils'
import type {
  CategoryColor,
  CategoryWithCount,
} from '@/server/schemas/category'

import { FloatingCategoryManager } from './FloatingCategoryManager'
import { SortableFloatingTodoItem } from './SortableFloatingTodoItem'

// Lazy load icons to reduce initial bundle size
const Plus = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Plus })),
)
const Check = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Check })),
)
const X = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.X })),
)
const Edit2 = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Edit2 })),
)
const Trash2 = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Trash2 })),
)
const Archive = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Archive })),
)
const Minimize2 = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Minimize2 })),
)
const Pin = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Pin })),
)
const PinOff = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.PinOff })),
)
const ExternalLink = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.ExternalLink })),
)
const GripVertical = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.GripVertical })),
)
const Settings = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Settings })),
)
const Brain = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Brain })),
)
const ClipboardPaste = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.ClipboardPaste })),
)

// Icon fallback component for loading state
const IconFallback = () => (
  <div className="h-3 w-3 animate-pulse rounded bg-muted" />
)

IconFallback.displayName = 'IconFallback'

export interface FloatingTodo {
  id: string
  text: string
  completed: boolean
  createdAt: Date
}

interface FloatingNavigatorProps {
  todos: FloatingTodo[]
  onTaskToggle: (id: string) => void
  onTaskCreate: (title: string) => void
  /**
   * Called when a multi-line list is pasted into the (empty or fully-selected)
   * task input — the container opens the bulk import dialog seeded with the raw
   * text (Issue #110). When omitted, paste behaves natively.
   */
  onBulkPaste?: (pastedText: string) => void
  /**
   * Slot for the post-import undo banner, rendered above the task list (Issue
   * #110). Renders nothing when there's no recent import. Supplied by the
   * container so this presentational component stays decoupled from oRPC.
   */
  bulkImportBanner?: React.ReactNode
  onTaskEdit: (id: string, title: string) => void
  onTaskDelete: (id: string) => void
  onTaskReorder?: (activeId: string, overId: string) => void
  /** Categories for the filter dropdown */
  categories?: CategoryWithCount[]
  /** Currently selected category ID (null = no category selected yet) */
  selectedCategoryId?: number | null
  /** Callback when category filter changes */
  onCategoryChange?: (id: number | null) => void
  /** Category CRUD callbacks */
  onCategoryCreate?: (name: string, color: CategoryColor) => void
  onCategoryUpdate?: (
    id: number,
    data: { name?: string; color?: CategoryColor },
  ) => void
  onCategoryDelete?: (id: number) => void
  /** Mutation pending states for category CRUD */
  isCategoryCreatePending?: boolean
  isCategoryUpdatePending?: boolean
  isCategoryDeletePending?: boolean
  /**
   * #113 data-loss gate: true while a completion toggle is in flight. The
   * Completed-row "Tuck into Completed" button reuses the delete→archive path,
   * which only archives a row already completed in the DB; tuck a freshly-checked
   * row before its toggle commits and it is HARD-DELETED instead (the win is lost,
   * no heatmap credit). Disables that button until the completion is durable.
   */
  isTogglePending?: boolean
}

interface PendingFloatingTodoRowProps {
  todo: FloatingTodo
  isDragging?: boolean
  dragHandleRef?: React.Ref<HTMLButtonElement>
  isEditing: boolean
  editText: string
  editInputRef: React.RefObject<HTMLInputElement | null>
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStartEditing: (todo: FloatingTodo) => void
  onEditTextChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onEditKeyDown: (event: React.KeyboardEvent) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
}

interface CompletedFloatingTodoRowProps {
  todo: FloatingTodo
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  /**
   * #113: a completion toggle is in flight; disables the "Tuck into Completed"
   * button so a freshly-checked win can't be hard-deleted before its toggle
   * commits (see FloatingNavigatorProps.isTogglePending).
   */
  isTogglePending?: boolean
}

/**
 * Renders one pending floating todo row with stable handlers for custom UI.
 *
 * @param props - Todo data, edit state, refs, and task callbacks.
 * @returns A pending todo row for the floating navigator.
 * @example
 * <PendingFloatingTodoRow todo={todo} isEditing={false} editText="" editInputRef={editInputRef} onToggle={toggle} onDelete={remove} onStartEditing={startEditing} onEditTextChange={changeEditText} onEditKeyDown={handleKey} onSaveEdit={saveEdit} onCancelEdit={cancelEdit} />
 */
const PendingFloatingTodoRow = function PendingFloatingTodoRow({
  todo,
  isDragging = false,
  dragHandleRef,
  isEditing,
  editText,
  editInputRef,
  onToggle,
  onDelete,
  onStartEditing,
  onEditTextChange,
  onEditKeyDown,
  onSaveEdit,
  onCancelEdit,
}: PendingFloatingTodoRowProps): React.ReactNode {
  const { checkboxMotionClassName, fire } = useCompletionFeedback()
  const handleToggle = () => {
    // Fire the opt-in sound only on a real completion (false→true); the CSS
    // checkbox fill plays on the state change. Un-completing is quiet.
    if (!todo.completed) {
      fire()
    }
    onToggle(todo.id)
  }
  const handleDelete = () => {
    onDelete(todo.id)
  }
  const handleEditButtonClick = () => {
    onStartEditing(todo)
  }

  return (
    <div
      className={`hover:bg-muted/50 group flex items-center gap-2 rounded p-2 ${isDragging ? 'ring-primary/20 shadow-lg ring-2' : ''}`}
      role="listitem"
      aria-label={`Task: ${todo.text}, ${todo.completed ? 'completed' : 'pending'}`}
      aria-describedby={`task-${todo.id}-actions`}
    >
      {dragHandleRef && (
        <button
          ref={dragHandleRef}
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <Suspense fallback={<IconFallback />}>
            <GripVertical className="h-3 w-3" aria-hidden="true" />
          </Suspense>
        </button>
      )}

      <Checkbox
        checked={todo.completed}
        onCheckedChange={handleToggle}
        className={`tap-target-24 h-4 w-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${checkboxMotionClassName}`}
        aria-label={`Mark task "${todo.text}" as ${todo.completed ? 'incomplete' : 'complete'}`}
      />

      {isEditing ? (
        <div className="flex flex-1 gap-1" role="group" aria-label="Edit task">
          <Input
            ref={editInputRef}
            value={editText}
            onChange={onEditTextChange}
            onKeyDown={onEditKeyDown}
            className="h-6 flex-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Edit task title"
            aria-describedby={`edit-help-${todo.id}`}
          />

          <div id={`edit-help-${todo.id}`} className="sr-only">
            Press Enter to save, Escape to cancel
          </div>
          <Button
            size="sm"
            onClick={onSaveEdit}
            className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Save changes"
            title="Save (Enter)"
          >
            <Suspense fallback={<IconFallback />}>
              <Check className="h-3 w-3" aria-hidden="true" />
            </Suspense>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancelEdit}
            className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Cancel editing"
            title="Cancel (Escape)"
          >
            <Suspense fallback={<IconFallback />}>
              <X className="h-3 w-3" aria-hidden="true" />
            </Suspense>
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="flex-1 cursor-pointer overflow-scroll rounded px-1 text-left text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => onStartEditing(todo)}
            title={`${todo.text} - Click to edit`}
            aria-label={`Edit task: ${todo.text}`}
          >
            {todo.text}
          </button>
          <div
            id={`task-${todo.id}-actions`}
            className="flex gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100"
            role="group"
            aria-label="Task actions"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={handleEditButtonClick}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`Edit task: ${todo.text}`}
              title="Edit task (Enter)"
            >
              <Suspense fallback={<IconFallback />}>
                <Edit2 className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              className="h-6 w-6 p-0 text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`Delete task: ${todo.text}`}
              title="Delete task (Delete)"
            >
              <Suspense fallback={<IconFallback />}>
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Renders one completed floating todo row with stable custom component handlers.
 *
 * @param props - Completed todo data and task callbacks.
 * @returns A completed todo row.
 * @example
 * <CompletedFloatingTodoRow todo={todo} onToggle={toggle} onDelete={remove} />
 */
const CompletedFloatingTodoRow = function CompletedFloatingTodoRow({
  todo,
  onToggle,
  onDelete,
  isTogglePending = false,
}: CompletedFloatingTodoRowProps): React.ReactNode {
  const { checkboxMotionClassName } = useCompletionFeedback()
  const handleToggle = () => {
    onToggle(todo.id)
  }
  const handleDelete = () => {
    onDelete(todo.id)
  }

  return (
    <div
      className="hover:bg-muted/50 group flex items-center gap-2 rounded p-2 opacity-60"
      role="listitem"
      aria-label={`Completed task: ${todo.text}`}
    >
      <Checkbox
        checked={todo.completed}
        onCheckedChange={handleToggle}
        className={`tap-target-24 h-4 w-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${checkboxMotionClassName}`}
        aria-label={`Mark completed task "${todo.text}" as incomplete`}
      />

      <span
        className="flex-1 truncate text-xs line-through"
        title={todo.text}
        aria-label={`Completed: ${todo.text}`}
      >
        {todo.text}
      </span>
      {/* #113: filing a finished task is a win, not a deletion — so this is the
          neutral Archive affordance, never the destructive (clay-red Trash2)
          skin. Behaviour is unchanged (onDelete archives the completed row); the
          accessible name avoids "Move to Completed"/"completed task:" e2e clashes. */}
      <Button
        size="sm"
        variant="ghost"
        onClick={handleDelete}
        // Disabled while the completion toggle is still in flight — tucking
        // before the check commits would hard-delete the win instead of
        // archiving it (#113 data-loss race, mirrors the web TodoItem gate).
        disabled={isTogglePending}
        className="h-6 w-6 p-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:opacity-100"
        aria-label={`Tuck "${todo.text}" into Completed`}
        title="Tuck into Completed"
      >
        <Suspense fallback={<IconFallback />}>
          <Archive className="h-3 w-3" aria-hidden="true" />
        </Suspense>
      </Button>
    </div>
  )
}

export const FloatingNavigator = function FloatingNavigator({
  todos,
  onTaskToggle,
  onTaskCreate,
  onBulkPaste,
  bulkImportBanner,
  onTaskEdit,
  onTaskDelete,
  onTaskReorder,
  categories = [],
  selectedCategoryId = null,
  onCategoryChange,
  onCategoryCreate,
  onCategoryUpdate,
  onCategoryDelete,
  isCategoryCreatePending = false,
  isCategoryUpdatePending = false,
  isCategoryDeletePending = false,
  isTogglePending = false,
}: FloatingNavigatorProps) {
  const [newTaskText, setNewTaskText] = useState('')
  const [showManagePanel, setShowManagePanel] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)

  // Separate todos by completion status
  const pendingTodos = todos.filter((todo) => !todo.completed)

  const completedTodos = todos.filter((todo) => todo.completed)

  const canReorderTasks = onTaskReorder !== undefined

  const startEditing = (todo: FloatingTodo) => {
    setEditingId(todo.id)
    setEditText(todo.text)
    // Focus and select input after DOM update
    setTimeout(() => {
      if (editInputRef.current) {
        editInputRef.current.focus()
        editInputRef.current.select()
      }
    }, 0)
  }

  useFloatingNavigatorMenuActions({
    inputRef,
  })

  /**
   * Handles drag end event to reorder todos.
   * Calls parent's onTaskReorder callback with active and over IDs.
   * @param event - Latest dnd-kit drag-end event from DragDropProvider.
   * @returns
   * - No return value; invalid drops exit early.
   * @example
   * handleDragEnd(event)
   */
  const handleDragEnd = (event: DragEndEvent) => {
    if (!canReorderTasks || event.canceled) {
      return
    }

    const { source } = event.operation

    if (!isSortable(source) || source.initialIndex === source.index) {
      return
    }

    const destinationTodo = pendingTodos[source.index]

    if (destinationTodo) {
      onTaskReorder?.(String(source.id), destinationTodo.id)
    }
  }

  const handleCreateTask = () => {
    if (newTaskText.trim()) {
      onTaskCreate(newTaskText.trim())
      setNewTaskText('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (isEnterKeyPress(e)) {
      handleCreateTask()
    }
  }

  const saveEdit = () => {
    if (editingId && editText.trim()) {
      onTaskEdit(editingId, editText.trim())
    }
    setEditingId(null)
    setEditText('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const handleEditKeyPress = (e: React.KeyboardEvent) => {
    if (isEnterKeyPress(e)) {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const handleEditTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditText(event.target.value)
  }

  const handleNewTaskTextChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setNewTaskText(event.target.value)
  }

  const openManagePanel = () => {
    setShowManagePanel(true)
  }

  const closeManagePanel = () => {
    setShowManagePanel(false)
  }

  // Window control functions
  const handleMinimize = async () => {
    if (isFloatingNavigatorEnvironment()) {
      try {
        await window.floatingNavigatorAPI!.window.minimize()
      } catch (error) {
        log.error('Failed to minimize window:', error)
      }
    }
  }

  const handleClose = async () => {
    if (isFloatingNavigatorEnvironment()) {
      try {
        await window.floatingNavigatorAPI!.window.close()
      } catch (error) {
        log.error('Failed to close window:', error)
      }
    }
  }

  const handleToggleAlwaysOnTop = async () => {
    if (isFloatingNavigatorEnvironment()) {
      try {
        const newState =
          await window.floatingNavigatorAPI!.window.toggleAlwaysOnTop()
        setIsAlwaysOnTop(newState)
      } catch (error) {
        log.error('Failed to toggle always on top:', error)
      }
    }
  }

  // Seed the pin button from the window's real state on mount. The button no
  // longer assumes the window launched pinned: the always-on-top setting now
  // survives relaunch, so a user who turned it off must see the button reflect
  // that. Initialize only — the sibling effect below keeps it live (§6d).
  useInitialEffect(() => {
    if (!isFloatingNavigatorEnvironment()) return
    // Guard the METHOD, not just the namespace: a frozen older preload can expose
    // `floatingNavigatorAPI` yet predate `isAlwaysOnTop` (preload skew — installed
    // app vs newer remote web bundle). Calling an absent method would throw
    // synchronously here and break the floating UI, so degrade to the default.
    const windowApi = window.floatingNavigatorAPI?.window
    if (typeof windowApi?.isAlwaysOnTop !== 'function') return
    let cancelled = false
    void windowApi
      .isAlwaysOnTop()
      .then((current) => {
        if (!cancelled) setIsAlwaysOnTop(current)
      })
      .catch((error: unknown) => {
        log.error('Failed to read always-on-top state:', error)
      })
    return () => {
      cancelled = true
    }
  })

  // §6d cross-window sync: keep-on-top is one OS-level setting shared across
  // windows, so a change made from ANOTHER surface (the Settings "Keep on top"
  // toggle) must live-update this window's own pin button — without it the button
  // would lie (e.g. show "pinned" over a now-unpinned window) until relaunch. The
  // main process broadcasts the new state to this window
  // (`WindowManager.setFloatingNavigatorAlwaysOnTop`), the preload forwards it as
  // a DOM CustomEvent (mirroring `floating-navigator-menu-action`), and we reflect
  // it here. This window's OWN toggle already updates optimistically, so an echoed
  // broadcast for a self-initiated change is a harmless no-op re-set.
  useInitialEffect(() => {
    if (!isFloatingNavigatorEnvironment()) return
    const handleAlwaysOnTopChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ alwaysOnTop?: boolean }>).detail
      if (typeof detail?.alwaysOnTop === 'boolean') {
        setIsAlwaysOnTop(detail.alwaysOnTop)
      }
    }
    window.addEventListener(
      'floating-window-always-on-top-changed',
      handleAlwaysOnTopChanged,
    )
    return () => {
      window.removeEventListener(
        'floating-window-always-on-top-changed',
        handleAlwaysOnTopChanged,
      )
    }
  })

  const handleFocusMainWindow = async () => {
    if (isFloatingNavigatorEnvironment()) {
      try {
        await window.floatingNavigatorAPI!.window.focusMainWindow()
      } catch (error) {
        log.error('Failed to focus main window:', error)
      }
    }
  }

  // T14: the full task app is web-only, so Import opens the Completed import
  // surface (/home) in the user's browser instead of broadcasting an open-intent
  // to the main window's dialog. Preferred path = the new `openCompletedImport`
  // bridge. Preload skew: an older installed app freezes a preload that predates
  // this method while still loading this (newer) web bundle, so method-guard and
  // fall back to the legacy cross-window intent — broadcast to the main window's
  // Completed dialog + surface it (that older app still has a main window).
  const handleOpenImport = async () => {
    if (!isFloatingNavigatorEnvironment()) return
    const floatingApi = window.floatingNavigatorAPI
    if (typeof floatingApi?.openCompletedImport === 'function') {
      try {
        await floatingApi.openCompletedImport()
      } catch (error) {
        log.error('Failed to open import in browser:', error)
      }
      return
    }
    // Preload skew: degrade to the legacy main-window dialog intent.
    requestOpenCompletedImport()
    try {
      await floatingApi?.window.focusMainWindow()
    } catch (error) {
      log.error('Failed to focus main window for import:', error)
    }
  }

  // Toggle the BrainDump Note window via the floating navigator preload bridge.
  const handleToggleBrainDump = async () => {
    if (!isFloatingNavigatorEnvironment()) return
    try {
      await window.floatingNavigatorAPI?.brainDump.toggle()
    } catch (error) {
      log.error('Failed to toggle BrainDump:', error)
    }
  }

  // Handle task toggle
  const handleTaskToggle = (id: string) => {
    const task = todos.find((t) => t.id === id)
    if (task) {
      onTaskToggle(id)
    }
  }

  // Handle task deletion
  const handleTaskDelete = (id: string) => {
    const task = todos.find((t) => t.id === id)
    if (task) {
      onTaskDelete(id)
    }
  }

  const pendingTaskList = (
    <div
      className="space-y-1"
      role="list"
      aria-label={`${pendingTodos.length} pending task${pendingTodos.length !== 1 ? 's' : ''}`}
    >
      {pendingTodos.map((todo, index) =>
        canReorderTasks ? (
          <SortableFloatingTodoItem key={todo.id} todo={todo} index={index}>
            {({ dragHandleRef, isDragging }) => (
              <PendingFloatingTodoRow
                todo={todo}
                isDragging={isDragging}
                dragHandleRef={dragHandleRef}
                isEditing={editingId === todo.id}
                editText={editText}
                editInputRef={editInputRef}
                onToggle={handleTaskToggle}
                onDelete={handleTaskDelete}
                onStartEditing={startEditing}
                onEditTextChange={handleEditTextChange}
                onEditKeyDown={handleEditKeyPress}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
              />
            )}
          </SortableFloatingTodoItem>
        ) : (
          <PendingFloatingTodoRow
            key={todo.id}
            todo={todo}
            isEditing={editingId === todo.id}
            editText={editText}
            editInputRef={editInputRef}
            onToggle={handleTaskToggle}
            onDelete={handleTaskDelete}
            onStartEditing={startEditing}
            onEditTextChange={handleEditTextChange}
            onEditKeyDown={handleEditKeyPress}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
          />
        ),
      )}
    </div>
  )

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
      role="application"
      aria-label="Floating Task Navigator"
    >
      {/* Header with window controls */}
      <header
        className="bg-muted/50 drag-handle flex cursor-move items-center justify-between border-b px-3 py-2"
        role="banner"
      >
        <div className="pointer-events-none flex-1">
          <h1 className="text-sm font-medium text-foreground">CoreLive</h1>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {pendingTodos.length} pending task
            {pendingTodos.length !== 1 ? 's' : ''}
            {completedTodos.length > 0 &&
              `, ${completedTodos.length} completed`}
          </p>
        </div>

        {isFloatingNavigatorEnvironment() && (
          <div
            className="pointer-events-auto flex items-center gap-1"
            role="toolbar"
            aria-label="Window controls"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggleBrainDump}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Open BrainDump Note"
              title="Open BrainDump Note"
            >
              <Suspense fallback={<IconFallback />}>
                <Brain className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleOpenImport}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Import to Completed"
              title="Import to Completed"
            >
              <Suspense fallback={<IconFallback />}>
                <ClipboardPaste className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleFocusMainWindow}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Open main window"
              title="Open main window"
            >
              <Suspense fallback={<IconFallback />}>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggleAlwaysOnTop}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={
                isAlwaysOnTop ? 'Disable always on top' : 'Enable always on top'
              }
              aria-pressed={isAlwaysOnTop}
              title={
                isAlwaysOnTop ? 'Disable always on top' : 'Enable always on top'
              }
            >
              <Suspense fallback={<IconFallback />}>
                {isAlwaysOnTop ? (
                  <PinOff className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Pin className="h-3 w-3" aria-hidden="true" />
                )}
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleMinimize}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Minimize window"
              title="Minimize"
            >
              <Suspense fallback={<IconFallback />}>
                <Minimize2 className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClose}
              className="h-6 w-6 p-0 text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Close window"
              title="Close"
            >
              <Suspense fallback={<IconFallback />}>
                <X className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
          </div>
        )}
      </header>

      {/* Conditional: manage panel or normal task view */}
      {showManagePanel &&
      onCategoryCreate &&
      onCategoryUpdate &&
      onCategoryDelete ? (
        <FloatingCategoryManager
          categories={categories}
          onCategoryCreate={onCategoryCreate}
          onCategoryUpdate={onCategoryUpdate}
          onCategoryDelete={onCategoryDelete}
          onClose={closeManagePanel}
          isCreatePending={isCategoryCreatePending}
          isUpdatePending={isCategoryUpdatePending}
          isDeletePending={isCategoryDeletePending}
        />
      ) : (
        <>
          {/* Category pills bar */}
          {categories.length > 0 && (
            <nav
              className="flex items-center gap-1 border-b px-3 py-1.5"
              aria-label="Category filter"
            >
              <div className="flex flex-1 gap-1 overflow-x-auto">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onCategoryChange?.(cat.id)}
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                      selectedCategoryId === cat.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                    aria-pressed={selectedCategoryId === cat.id}
                    aria-label={`Filter by ${cat.name}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${COLOR_DOT_CLASSES[cat.color] ?? 'bg-muted-foreground'}`}
                    />

                    {cat.name}
                  </button>
                ))}
              </div>
              {onCategoryCreate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openManagePanel}
                  className="h-6 w-6 shrink-0 p-0"
                  aria-label="Manage categories"
                  title="Manage categories"
                >
                  <Suspense fallback={<IconFallback />}>
                    <Settings className="h-3 w-3" aria-hidden="true" />
                  </Suspense>
                </Button>
              )}
            </nav>
          )}

          {/* Add new task */}
          <section
            className="border-b bg-background p-3"
            aria-label="Add new task"
          >
            <div className="flex gap-2">
              <Input
                id="task-input"
                ref={inputRef}
                placeholder="Add task... (Use View menu for actions)"
                value={newTaskText}
                onChange={handleNewTaskTextChange}
                onKeyDown={handleKeyPress}
                onPaste={(event) => interceptBulkPaste(event, onBulkPaste)}
                className="h-8 border-0 text-sm ring-0 focus-visible:border-0 focus-visible:ring-0"
                aria-label="New task title"
                aria-describedby="task-input-help"
              />

              <div id="task-input-help" className="sr-only">
                Type a task title and press Enter or click the add button to
                create a new task. Paste a list to add several at once.
              </div>
              <Button
                size="sm"
                onClick={handleCreateTask}
                disabled={!newTaskText.trim()}
                className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Add task${newTaskText.trim() ? `: ${newTaskText.trim()}` : ''}`}
                title="Add task (Enter)"
              >
                <Suspense fallback={<IconFallback />}>
                  <Plus className="h-3 w-3" aria-hidden="true" />
                </Suspense>
              </Button>
            </div>
          </section>

          {/* Post-import undo banner slot (Issue #110) — sits between the input
              and the scrollable list, staying visible while the list scrolls.
              Renders nothing until a recent import seeds it. */}
          {bulkImportBanner}

          {/* Task list */}
          <main
            ref={taskListRef}
            className="floating-navigator-scroll flex-1 overflow-y-auto"
            role="main"
            aria-label="Task list"
          >
            {/* Pending tasks with drag-and-drop reordering */}
            {pendingTodos.length > 0 && (
              <section className="p-2" aria-label="Pending tasks">
                {canReorderTasks ? (
                  <DragDropProvider
                    sensors={todoSortableSensors}
                    onDragEnd={handleDragEnd}
                  >
                    {pendingTaskList}
                  </DragDropProvider>
                ) : (
                  pendingTaskList
                )}
              </section>
            )}

            {/* Completed tasks */}
            {completedTodos.length > 0 && (
              <section className="border-t" aria-label="Completed tasks">
                <div className="bg-muted/30 px-3 py-2">
                  <h2 className="text-xs font-medium text-muted-foreground">
                    Completed ({completedTodos.length})
                  </h2>
                </div>
                <div
                  className="space-y-1 p-2"
                  role="list"
                  aria-label={`${completedTodos.length} completed task${completedTodos.length !== 1 ? 's' : ''}`}
                >
                  {completedTodos.slice(0, 3).map((todo) => (
                    <CompletedFloatingTodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={handleTaskToggle}
                      onDelete={handleTaskDelete}
                      isTogglePending={isTogglePending}
                    />
                  ))}
                  {completedTodos.length > 3 && (
                    <div
                      className="py-1 text-center text-xs text-muted-foreground"
                      role="status"
                      aria-label={`${completedTodos.length - 3} additional completed tasks not shown`}
                    >
                      +{completedTodos.length - 3} more completed
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Empty state */}
            {todos.length === 0 && (
              <div className="p-6 text-center" role="status">
                <p className="text-xs text-muted-foreground">
                  No tasks yet. Add one above!
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Use View menu to access all functions
                </p>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  )
}
