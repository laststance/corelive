'use client'
import { Circle } from 'lucide-react'
import React, { useState, useEffect } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { AddTodoForm } from './AddTodoForm'
import { CompletedTodos } from './CompletedTodos'
import type { Todo } from './TodoItem'
import { TodoItem } from './TodoItem'

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([])

  // Load todos from localStorage
  useEffect(() => {
    const savedTodos = localStorage.getItem('todos')
    if (savedTodos) {
      try {
        const parsedTodos = JSON.parse(savedTodos).map((todo: any) => ({
          ...todo,
          createdAt: new Date(todo.createdAt),
        }))
        setTodos(parsedTodos)
      } catch (error) {
        console.error('Failed to parse todos from localStorage:', error)
      }
    }
  }, [])

  // Save todos to localStorage when they change
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos))
  }, [todos])

  const addTodo = (text: string, notes?: string) => {
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: new Date(),
      notes,
    }
    setTodos((prev) => [newTodo, ...prev])
  }

  const toggleComplete = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    )
  }

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
  }

  const updateNotes = (id: string, notes: string) => {
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, notes } : todo)),
    )
  }

  const deleteCompleted = () => {
    setTodos((prev) => prev.filter((todo) => !todo.completed))
  }

  const pendingTodos = todos.filter((todo) => !todo.completed)
  const completedTodos = todos
    .filter((todo) => todo.completed)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

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
          completedTodos={completedTodos}
          onDelete={deleteTodo}
          onClearCompleted={deleteCompleted}
        />
      </div>
    </div>
  )
}
