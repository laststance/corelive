import { useInfiniteQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import React, { useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { orpc } from '@/lib/orpc/client-query'
import type { DayDetailTask } from '@/server/schemas/completed'

import { CompletedImportEntry } from './CompletedImportEntry'
import { CompletedJournalRow } from './CompletedJournalRow'

interface CompletedTodosProps {
  /**
   * Uncomplete handler for `todo`-source journal rows (the reversal path that
   * replaces per-item delete). Forwarded to every {@link CompletedJournalRow};
   * `completed`-source rows ignore it (they are a permanent record).
   */
  onToggleComplete: (id: string) => void
}

interface GroupedEntries {
  [date: string]: DayDetailTask[]
}

const ITEMS_PER_PAGE = 10

/**
 * Permanent completion journal — the home "Completed Tasks" panel. Reads the
 * unified `completed.journal` feed (`Todo(completed) ∪ Completed(archived:false)`,
 * newest-first) so wins from ALL four completion routes (Main, Import, Floating,
 * BrainDump) surface in one place, grouped by the day they were completed.
 *
 * It is an append-only record: there is no per-item delete and no Clear-all —
 * a mistaken `todo`-source completion is corrected by un-checking its row, and
 * imported/braindump wins are immutable once their undo window closes.
 *
 * @param onToggleComplete - Reverses a `todo`-source completion when its row is un-checked.
 * @returns The Completed Tasks card (loading / error / empty / populated).
 * @example
 * <CompletedTodos onToggleComplete={toggleComplete} />
 */
export const CompletedTodos = React.memo(function CompletedTodos({
  onToggleComplete,
}: CompletedTodosProps) {
  const observerRef = useRef<HTMLDivElement>(null)

  // Infinite scroll over the merged journal feed.
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery(
    orpc.completed.journal.infiniteOptions({
      input: (pageParam) => ({
        limit: ITEMS_PER_PAGE,
        offset: pageParam ?? 0,
      }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    }),
  )

  // Flatten journal entries across all loaded pages (already newest-first).
  const allEntries: DayDetailTask[] =
    data?.pages.flatMap((page) =>
      !page || !Array.isArray(page.entries) ? [] : page.entries,
    ) ?? []

  // Group by the local calendar day the win was completed on.
  const groupedEntries: GroupedEntries = allEntries.reduce((groups, entry) => {
    const dateKey = entry.completedAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(entry)
    return groups
  }, {} as GroupedEntries)

  // Sort day groups newest-first. Entries arrive newest-first, so each group's
  // first entry is its newest — order groups by that timestamp.
  const sortedDates = Object.keys(groupedEntries).sort((a, b) => {
    const dateA = groupedEntries[a]?.[0]?.completedAt.getTime() ?? 0
    const dateB = groupedEntries[b]?.[0]?.completedAt.getTime() ?? 0
    return dateB - dateA
  })

  // Intersection Observer for infinite scroll.
  useCycleEffect(() => {
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

  if (allEntries.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Completed Tasks
          </CardTitle>
          <CardDescription>Your wins gather here, newest first</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 opacity-50" />
            <p>No wins logged yet</p>
            {/* Day-one discoverability: surface the Import affordance inline. */}
            <CompletedImportEntry variant="inline" />
            {/* Accurate now: finishing a task AND importing both land here. */}
            <p className="text-xs text-muted-foreground">
              Finish a task or import past wins — they&apos;ll appear here
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
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
        <CardDescription>Your wins, newest first</CardDescription>
        <div className="flex items-center justify-end gap-2 pt-2">
          {/* Completed-zone Import entry (D4) — the journal's only action. */}
          <CompletedImportEntry />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <div className="-mr-2 h-full space-y-4 overflow-y-auto pr-2">
          {sortedDates.map((date, dateIndex) => {
            const entriesForDate = groupedEntries[date]
            return (
              <div key={`date-${date}`}>
                {dateIndex > 0 && <Separator className="mb-3" />}
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  {date}
                </h3>
                <div className="space-y-3">
                  {entriesForDate?.map((entry) => (
                    <CompletedJournalRow
                      key={`${entry.source}-${entry.id}`}
                      entry={entry}
                      onUncomplete={onToggleComplete}
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

          {!hasNextPage && allEntries.length > ITEMS_PER_PAGE && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              All wins loaded
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})
