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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
        { id: Date.now().toString(), title: newTask, completed: false }
      ])
      setNewTask('')
    }
  }

  const toggleTask = (id: string) => {
    setTasks(tasks.map(task => {
      if (task.id === id) {
        const updated = { ...task, completed: !task.completed }
        if (updated.completed) celebrate() // Trigger confetti on completion
        return updated
      }
      return task
    }))
  }

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id))
  }

  return (
    <>
      {/* Card using design system tokens */}
      <Card className="w-full max-w-2xl mx-auto">
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
          <div className="mt-6 p-4 rounded-lg bg-accent text-accent-foreground">
            <p className="text-sm">
              This component adapts to all {' '}
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
  onDelete 
}: { 
  task: Task
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div 
      className={cn(
        // Using todo-item design tokens
        'todo-item group',
        'flex items-center gap-3',
        'min-h-[var(--todo-item-min-height)]',
        'px-[var(--todo-item-padding-x)]',
        'py-[var(--todo-item-padding-y)]',
        'rounded-[var(--todo-item-border-radius)]',
        'border border-border',
        'transition-[var(--todo-item-transition)]',
        'hover:bg-[var(--todo-item-background-hover)]',
        task.completed && 'todo-item-completed'
      )}
    >
      {/* Checkbox with animation */}
      <button
        onClick={onToggle}
        className={cn(
          'todo-item-checkbox',
          'flex items-center justify-center',
          'transition-all',
          task.completed && 'bg-primary border-primary'
        )}
        aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {task.completed && (
          <Check className="h-3 w-3 text-primary-foreground animate-in zoom-in-50" />
        )}
      </button>

      {/* Task text with conditional styling */}
      <span 
        className={cn(
          'todo-item-text',
          'flex-1',
          task.completed && [
            'text-[var(--todo-item-text-color-completed)]',
            'opacity-[var(--todo-item-opacity-completed)]',
            'line-through'
          ]
        )}
      >
        {task.title}
      </span>

      {/* Delete button with hover effect */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity hover-scale"
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
    <Card className="relative overflow-hidden">
      {/* Gradient effect for gradient themes */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          background: 'var(--gradient-primary, transparent)'
        }}
      />
      
      <CardHeader>
        <CardTitle>Theme-Aware Component</CardTitle>
      </CardHeader>
      <CardContent>
        <p>This card has special effects in gradient themes!</p>
        
        {/* Theme-specific styles */}
        <style jsx>{`
          /* Retro theme border effect */
          [data-theme^="retro"] .card {
            box-shadow: 4px 4px 0 0 var(--color-foreground, rgba(0,0,0,0.2));
          }
          
          /* Seasonal theme decorations */
          [data-theme^="seasonal"] .card::before {
            content: '✨';
            position: absolute;
            top: 10px;
            right: 10px;
            opacity: 0.5;
          }
        `}</style>
      </CardContent>
    </Card>
  )
}
