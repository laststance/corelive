import { useInfiniteQuery } from '@tanstack/react-query'
import { CheckCircle2, Trash2 } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

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
import { orpc } from '@/lib/orpc/client-query'

import { TodoItem } from './TodoItem'
import type { Todo } from './TodoItem'

interface CompletedTodosProps {
  onDelete: (id: string) => void
  onClearCompleted: () => void
  onToggleComplete: (id: string) => void
}

interface GroupedTodos {
  [date: string]: Todo[]
}

const ITEMS_PER_PAGE = 10

export function CompletedTodos({
  onDelete,
  onClearCompleted,
  onToggleComplete,
}: CompletedTodosProps) {
  const observerRef = useRef<HTMLDivElement>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  // Infinite scroll query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery(
    orpc.todo.list.infiniteOptions({
      input: (pageParam) => ({
        completed: true,
        limit: ITEMS_PER_PAGE,
        offset: pageParam ?? 0,
      }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    }),
  )

  // Flatten todos across all pages
  const allTodos: Todo[] =
    data?.pages.flatMap((page) => {
      if (!page || !Array.isArray(page.todos)) {
        return []
      }

      return page.todos.map((todo) => ({
        id: todo.id.toString(),
        text: todo.text,
        completed: todo.completed,
        createdAt: new Date(todo.createdAt),
        notes: todo.notes,
      }))
    }) ?? []

  // Group by date
  const groupedTodos: GroupedTodos = allTodos.reduce((groups, todo) => {
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

  // Sort by date (newest first)
  const sortedDates = Object.keys(groupedTodos).sort((a, b) => {
    const dateA = groupedTodos[a]?.[0]?.createdAt.getTime() ?? 0
    const dateB = groupedTodos[b]?.[0]?.createdAt.getTime() ?? 0
    return dateB - dateA
  })

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )

    if (observerRef.current) {
      observer.observe(observerRef.current)
    }

    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Completed Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center p-8">
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Completed Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center p-8">
          <div className="text-center text-muted-foreground">
            <p className="text-red-500">An error occurred</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (allTodos.length === 0) {
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
          <div className="text-center text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>No completed tasks yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="flex h-full flex-col">
        <CardHeader className="shrink-0">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Completed Tasks
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              {data?.pages[0]?.total ?? 0} completed
            </Badge>
          </CardTitle>
          <CardDescription>Recently completed tasks</CardDescription>
          {allTodos.length > 0 && (
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearDialogOpen(true)}
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
            {sortedDates.map((date, dateIndex) => {
              const todosForDate = groupedTodos[date]
              return (
                <div key={`date-${date}`}>
                  {dateIndex > 0 && <Separator className="mb-3" />}
                  <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                    {date}
                  </h3>
                  <div className="space-y-3">
                    {todosForDate?.map((todo) => (
                      <TodoItem
                        key={todo.id}
                        todo={todo}
                        onToggleComplete={onToggleComplete}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {isFetchingNextPage && (
              <div className="flex justify-center p-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
              </div>
            )}

            {/* Intersection observer target */}
            {hasNextPage && <div ref={observerRef} className="h-1"></div>}

            {!hasNextPage && allTodos.length > ITEMS_PER_PAGE && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                All completed tasks loaded
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all completed tasks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              {data?.pages[0]?.total ?? allTodos.length} completed task
              {(data?.pages[0]?.total ?? allTodos.length) !== 1 ? 's' : ''}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onClearCompleted()
                setClearDialogOpen(false)
              }}
              className="text-destructive-foreground hover:bg-destructive/90 bg-destructive" // eslint-disable-line dslint/token-only -- shadcn destructive tokens
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
