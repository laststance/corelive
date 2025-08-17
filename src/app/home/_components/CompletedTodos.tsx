import { CheckCircle2, Trash2 } from 'lucide-react'
import React, { useState, useEffect, useRef, useCallback } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import { TodoItem } from './TodoItem'
import type { Todo } from './TodoItem'

interface CompletedTodosProps {
  completedTodos: Todo[]
  onDelete: (id: string) => void
  onClearCompleted: () => void
}

interface GroupedTodos {
  [date: string]: Todo[]
}

const ITEMS_PER_PAGE = 10

export function CompletedTodos({
  completedTodos,
  onDelete,
  onClearCompleted,
}: CompletedTodosProps) {
  const [displayedItems, setDisplayedItems] = useState(ITEMS_PER_PAGE)
  const [isLoading, setIsLoading] = useState(false)
  const observerRef = useRef<HTMLDivElement>(null)

  // Group todos by date
  const groupedTodos: GroupedTodos = completedTodos.reduce((groups, todo) => {
    const dateKey = todo.createdAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(todo)
    return groups
  }, {} as GroupedTodos)

  // Sort dates (most recent first)
  const sortedDates = Object.keys(groupedTodos).sort((a, b) => {
    const dateA = groupedTodos[a]?.[0]?.createdAt.getTime() ?? 0
    const dateB = groupedTodos[b]?.[0]?.createdAt.getTime() ?? 0
    return dateB - dateA
  })

  // Flatten todos for pagination
  const flattenedTodos = sortedDates.flatMap((date) => [
    { type: 'date-header' as const, date, todos: groupedTodos[date]! },
    ...groupedTodos[date]!.map((todo) => ({ type: 'todo' as const, todo })),
  ])

  const visibleItems = flattenedTodos.slice(0, displayedItems)
  const hasMore = displayedItems < flattenedTodos.length

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return

    setIsLoading(true)
    // Simulate loading delay
    setTimeout(() => {
      setDisplayedItems((prev) => prev + ITEMS_PER_PAGE)
      setIsLoading(false)
    }, 500)
  }, [isLoading, hasMore])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          loadMore()
        }
      },
      { threshold: 0.1 },
    )

    if (observerRef.current) {
      observer.observe(observerRef.current)
    }

    return () => observer.disconnect()
  }, [loadMore, hasMore, isLoading])

  if (completedTodos.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Completed Tasks
          </CardTitle>
          <CardDescription>Completed tasks will appear here</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center p-8">
          <div className="text-muted-foreground text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>No completed tasks yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Completed Tasks
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            {completedTodos.length} completed
          </Badge>
        </CardTitle>
        <CardDescription>Recently completed tasks</CardDescription>
        {completedTodos.length > 0 && (
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClearCompleted}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear all
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <div className="-mr-2 h-full space-y-4 overflow-y-auto pr-2">
          {visibleItems.map((item) => {
            if (item.type === 'date-header') {
              return (
                <div key={`date-${item.date}`} className="pt-4 first:pt-0">
                  <Separator className="mb-3" />
                  <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                    {item.date}
                  </h3>
                </div>
              )
            } else {
              return (
                <TodoItem
                  key={item.todo.id}
                  todo={item.todo}
                  onToggleComplete={() => {}} // Completed todos don't need toggle
                  onDelete={onDelete}
                />
              )
            }
          })}

          {isLoading && (
            <div className="flex justify-center p-4">
              <div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
            </div>
          )}

          {/* Intersection observer target */}
          {hasMore && <div ref={observerRef} className="h-1"></div>}

          {!hasMore && completedTodos.length > ITEMS_PER_PAGE && (
            <div className="text-muted-foreground p-4 text-center text-sm">
              All completed tasks loaded
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
