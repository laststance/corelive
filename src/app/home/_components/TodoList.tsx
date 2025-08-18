'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Circle } from 'lucide-react'
import React from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useORPCUtils } from '@/lib/orpc/react-query'

import { AddTodoForm } from './AddTodoForm'
import { CompletedTodos } from './CompletedTodos'
import type { Todo } from './TodoItem'
import { TodoItem } from './TodoItem'

export function TodoList() {
  const orpc = useORPCUtils()
  const queryClient = useQueryClient()

  // Fetch pending todos
  const { data: pendingData, isLoading: pendingLoading } = useQuery(
    orpc.todo.list.queryOptions({
      input: { completed: false, limit: 100, offset: 0 },
    }),
  )

  // Todo creation mutation
  const createMutation = useMutation(
    orpc.todo.create.mutationOptions({
      onSuccess: () => {
        // Invalidate cache
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  // Todo completion toggle mutation
  const toggleMutation = useMutation(
    orpc.todo.toggle.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  // Todo deletion mutation
  const deleteMutation = useMutation(
    orpc.todo.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  // Todo update mutation
  const updateMutation = useMutation(
    orpc.todo.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  // Mutation to delete all completed todos
  const clearCompletedMutation = useMutation(
    orpc.todo.clearCompleted.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      },
    }),
  )

  const addTodo = (text: string, notes?: string) => {
    createMutation.mutate({ text, notes })
  }

  const toggleComplete = (id: string) => {
    const todoId = parseInt(id, 10)
    if (!isNaN(todoId)) {
      toggleMutation.mutate({ id: todoId })
    }
  }

  const deleteTodo = (id: string) => {
    const todoId = parseInt(id, 10)
    if (!isNaN(todoId)) {
      deleteMutation.mutate({ id: todoId })
    }
  }

  const updateNotes = (id: string, notes: string) => {
    const todoId = parseInt(id, 10)
    if (!isNaN(todoId)) {
      updateMutation.mutate({ id: todoId, data: { notes } })
    }
  }

  const deleteCompleted = () => {
    clearCompletedMutation.mutate({})
  }

  // Transform data into Todo component format
  const mapTodos = (todos: any[]): Todo[] => {
    return todos.map((todo) => ({
      id: todo.id.toString(),
      text: todo.text,
      completed: todo.completed,
      createdAt: new Date(todo.createdAt),
      notes: todo.notes,
    }))
  }

  const pendingTodos = pendingData ? mapTodos(pendingData.todos) : []

  if (pendingLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Left Column - Pending Tasks */}
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
            <AddTodoForm onAddTodo={addTodo} />
          </CardContent>
        </Card>

        {pendingTodos.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Circle className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <p className="text-muted-foreground">
                No pending tasks. Add a new task to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggleComplete={toggleComplete}
                onDelete={deleteTodo}
                onUpdateNotes={updateNotes}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right Column - Completed Tasks */}
      <div className="h-full">
        <CompletedTodos
          onDelete={deleteTodo}
          onClearCompleted={deleteCompleted}
        />
      </div>
    </div>
  )
}
