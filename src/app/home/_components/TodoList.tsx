'use client'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query'
import { Circle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import { useTodoMutations } from '@/hooks/useTodoMutations'
import { orpc } from '@/lib/orpc/client-query'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'
import type { CategoryWithCount } from '@/server/schemas/category'

import { AddTodoForm } from './AddTodoForm'
import { CategoryManageDialog } from './CategoryManageDialog'
import { CategorySidebar } from './CategorySidebar'
import { CompletedTodos } from './CompletedTodos'
import { SortableTodoItem } from './SortableTodoItem'
import type { Todo } from './TodoItem'

const TODO_QUERY_LIMIT = 100
const TODO_QUERY_OFFSET = 0
const DECIMAL_RADIX = 10

/**
 * Renders the primary todo list view with pending and completed tasks.
 * @returns
 * - The todo list UI for the home screen
 * @example
 * <TodoList />
 */
export function TodoList() {
  const queryClient = useQueryClient()
  // Track if persister is still restoring cached data - prevents hydration mismatch
  const isRestoring = useIsRestoring()

  // Category filter state (persisted to localStorage)
  const [selectedCategoryId] = useSelectedCategory()

  // Category management dialog state
  const [manageDialogOpen, setManageDialogOpen] = useState(false)

  // Configure dnd-kit sensors for pointer and keyboard interactions
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance before activation
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Mutations with optimistic updates
  const {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateMutation,
    clearCompletedMutation,
    reorderMutation,
  } = useTodoMutations()

  // Local state for optimistic reordering
  const [localPendingTodos, setLocalPendingTodos] = useState<Todo[]>([])

  // Fetch categories for name/color lookup
  const { data: categoryData } = useQuery(orpc.category.list.queryOptions({}))
  const categoryMap = useMemo(
    () =>
      new Map<number, CategoryWithCount>(
        (categoryData?.categories ?? []).map((c) => [c.id, c]),
      ),
    [categoryData],
  )

  // Fetch pending todos (filtered by selected category)
  const { data: pendingData, isLoading: pendingLoading } = useQuery(
    orpc.todo.list.queryOptions({
      input: {
        completed: false,
        limit: TODO_QUERY_LIMIT,
        offset: TODO_QUERY_OFFSET,
        ...(selectedCategoryId !== null && { categoryId: selectedCategoryId }),
      },
    }),
  )

  /**
   * Adds a new todo item using the create mutation.
   * @param text - Todo title to create.
   * @param notes - Optional notes to attach to the todo.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * addTodo('Buy milk')
   */
  const addTodo = (
    text: string,
    notes?: string,
    categoryId?: number | null,
  ) => {
    createMutation.mutate({
      text,
      notes,
      ...(categoryId !== null && categoryId !== undefined && { categoryId }),
    })
  }

  /**
   * Toggles completion status for the given todo.
   * @param id - Todo identifier as a string.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * toggleComplete('42')
   */
  const toggleComplete = (id: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      toggleMutation.mutate({ id: todoId })
    }
  }

  /**
   * Deletes the specified todo item.
   * @param id - Todo identifier as a string.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * deleteTodo('42')
   */
  const deleteTodo = (id: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      deleteMutation.mutate({ id: todoId })
    }
  }

  /**
   * Updates the notes for a specific todo item.
   * @param id - Todo identifier as a string.
   * @param notes - New notes content.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * updateNotes('42', 'Call supplier')
   */
  const updateNotes = (id: string, notes: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      updateMutation.mutate({ id: todoId, data: { notes } })
    }
  }

  /**
   * Clears all completed todos via the bulk delete mutation.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * deleteCompleted()
   */
  const deleteCompleted = () => {
    clearCompletedMutation.mutate({})
  }

  // Transform data into Todo component format
  /**
   * Converts raw API todo data into UI-ready Todo objects.
   * @param todos - Raw todo payloads from the API.
   * @returns
   * - A normalized list of Todo objects
   * - An empty list when the input is not an array
   * @example
   * mapTodos([{ id: 1, text: 'A', completed: false, createdAt: Date.now() }])
   * // => [{ id: '1', text: 'A', completed: false, createdAt: Date }]
   */
  const mapTodos = (todos: unknown): Todo[] => {
    if (!Array.isArray(todos)) {
      return []
    }

    return todos.map((todo) => {
      const category = todo.categoryId ? categoryMap.get(todo.categoryId) : null
      return {
        id: todo.id.toString(),
        text: todo.text,
        completed: todo.completed,
        createdAt: new Date(todo.createdAt),
        notes: todo.notes,
        categoryId: todo.categoryId,
        categoryName: category?.name ?? null,
        categoryColor: category?.color ?? null,
      }
    })
  }

  const pendingTodosFromQuery = mapTodos(pendingData?.todos)

  // Sync local state with query data when it changes
  useEffect(() => {
    setLocalPendingTodos(pendingTodosFromQuery)
  }, [pendingData])

  // Use local state for rendering to enable optimistic reordering
  const pendingTodos = localPendingTodos

  /**
   * Handles drag end event to reorder todos.
   * Updates local state optimistically and syncs with server.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = pendingTodos.findIndex((todo) => todo.id === active.id)
    const newIndex = pendingTodos.findIndex((todo) => todo.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    // Optimistically update local state
    const reorderedTodos = arrayMove(pendingTodos, oldIndex, newIndex)
    setLocalPendingTodos(reorderedTodos)

    // Build reorder items with new order values
    const items = reorderedTodos.map((todo, index) => ({
      id: parseInt(todo.id, DECIMAL_RADIX),
      order: index,
    }))

    // Call reorder mutation
    reorderMutation.mutate({ items })
  }

  useEffect(() => {
    return subscribeToTodoSync(() => {
      queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
    })
  }, [queryClient])

  // Show loading during initial query OR while persister restores cached data
  // This ensures server-rendered HTML matches client hydration (prevents hydration error)
  if (pendingLoading || isRestoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    // eslint-disable-next-line dslint/token-only -- 3-column grid layout for category sidebar
    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-[200px_1fr_1fr]">
      {/* Category Sidebar */}
      <div className="hidden rounded-lg border bg-card lg:block">
        <CategorySidebar onOpenManage={() => setManageDialogOpen(true)} />
      </div>

      {/* Pending Tasks Column */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Todo List</span>
              <Badge variant="outline" className="flex items-center gap-1">
                <Circle className="h-3 w-3" />
                {pendingTodos.length} pending
              </Badge>
            </CardTitle>
            <CardDescription>Manage your tasks efficiently</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AddTodoForm
              onAddTodo={addTodo}
              selectedCategoryId={selectedCategoryId}
            />
          </CardContent>
        </Card>

        {pendingTodos.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Circle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                No pending tasks. Add a new task to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={pendingTodos.map((todo) => todo.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {pendingTodos.map((todo) => (
                  <SortableTodoItem
                    key={todo.id}
                    todo={todo}
                    onToggleComplete={toggleComplete}
                    onDelete={deleteTodo}
                    onUpdateNotes={updateNotes}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Completed Tasks Column */}
      <div className="h-full">
        <CompletedTodos
          onDelete={deleteTodo}
          onClearCompleted={deleteCompleted}
          onToggleComplete={toggleComplete}
        />
      </div>

      {/* Category Management Dialog */}
      <CategoryManageDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
      />
    </div>
  )
}
