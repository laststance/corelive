/**
 * Example Component - Demonstrates CoreLive Design System usage
 *
 * This file shows best practices for using the design system
 */

'use client'

import { Check, Plus, Trash2 } from 'lucide-react'
import React, { useState } from 'react'

import { ConfettiAnimation, useConfetti } from '@/components/animations'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Task {
  id: string
  title: string
  completed: boolean
}

/**
 * Example TodoList component using CoreLive Design System
 * Demonstrates:
 * - Design token usage
 * - Component styling with tokens
 * - Animation integration
 * - Theme-aware styling
 */
export function ExampleTodoList() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: 'Learn CoreLive Design System', completed: false },
    { id: '2', title: 'Implement theme switching', completed: false },
    { id: '3', title: 'Add animations', completed: false },
  ])
  const [newTask, setNewTask] = useState('')
  const { trigger, celebrate } = useConfetti()

  const addTask = () => {
    if (newTask.trim()) {
      setTasks([
        ...tasks,
        { id: Date.now().toString(), title: newTask, completed: false },
      ])
      setNewTask('')
    }
  }

  const toggleTask = (id: string) => {
    setTasks(
      tasks.map((task) => {
        if (task.id === id) {
          const updated = { ...task, completed: !task.completed }
          if (updated.completed) celebrate() // Trigger confetti on completion
          return updated
        }
        return task
      }),
    )
  }

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id))
  }

  return (
    <>
      {/* Card using design system tokens */}
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>CoreLive Design System Demo</CardTitle>
          <CardDescription>
            A todo list showcasing design tokens and animations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Input section with token-based styling */}
          <div className="flex gap-2">
            <Input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTask()}
              placeholder="Add a new task..."
              className="flex-1"
            />
            <Button
              onClick={addTask}
              size="icon"
              className="hover-scale" // Micro interaction
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Task list with component tokens */}
          <div className="space-y-2">
            {tasks.map((task) => (
              <TodoItem
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task.id)}
                onDelete={() => deleteTask(task.id)}
              />
            ))}
          </div>

          {/* Theme-specific styling example */}
          <div className="mt-6 rounded-lg bg-accent p-4 text-accent-foreground">
            <p className="text-sm">
              This component adapts to all{' '}
              <span className="font-semibold">100+ themes</span> automatically!
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Confetti animation */}
      <ConfettiAnimation trigger={trigger} />
    </>
  )
}

/**
 * TodoItem component using design tokens
 */
function TodoItem({
  task,
  onToggle,
  onDelete,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        // Using todo-item design tokens - CSS class handles all base styles
        'todo-item group',
        'flex items-center',
        task.completed && 'todo-item-completed',
      )}
    >
      {/* Checkbox with animation */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'todo-item-checkbox',
          'flex items-center justify-center',
          'shrink-0',
          task.completed && 'border-primary bg-primary',
        )}
        aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {task.completed && (
          <Check className="animate-in zoom-in-50 h-3 w-3 text-primary-foreground" />
        )}
      </button>

      {/* Task text with conditional styling */}
      <span className={cn('todo-item-text', 'flex-1')}>{task.title}</span>

      {/* Delete button with hover effect */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="hover-scale shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  )
}

/**
 * Example of theme-specific component styling
 */
export function ThemeAwareCard() {
  return (
    <Card
      className="theme-aware-card relative overflow-hidden"
      data-slot="theme-aware-card"
    >
      {/* Gradient effect for gradient themes */}
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          background: 'var(--gradient-primary, transparent)',
        }}
      />

      <CardHeader>
        <CardTitle>Theme-Aware Component</CardTitle>
      </CardHeader>
      <CardContent>
        <p>This card has special effects in gradient themes!</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Note: Theme-specific effects (retro borders, seasonal decorations) are
          applied via CSS data attributes in the design system.
        </p>
      </CardContent>
    </Card>
  )
}
