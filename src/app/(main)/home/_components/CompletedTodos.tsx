import { useInfiniteQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { match } from 'ts-pattern'

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
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useUpdateEffect } from '@/hooks/use-update-effect'
import { useLocalDayKey } from '@/hooks/useLocalDayKey'
import { COMPLETED_JOURNAL_PAGE_SIZE } from '@/lib/constants/completed'
import { LOCAL_DAY_QUERY_ANCHOR_TIME } from '@/lib/constants/date'
import { orpc } from '@/lib/orpc/client-query'
import {
  type CompletedPeriod,
  resolveCompletedJournalDateRange,
} from '@/lib/utils/resolveCompletedJournalDateRange'
import type { DayDetailTask } from '@/server/schemas/completed'

import { CompletedImportEntry } from './CompletedImportEntry'
import { CompletedJournalRow } from './CompletedJournalRow'
import {
  CompletedTodosFilters,
  type CompletedFilterCategory,
} from './CompletedTodosFilters'

interface CompletedTodosProps {
  /** Categories already loaded by TodoList, reused without coupling to its active-category selection. */
  categories: readonly CompletedFilterCategory[]
  /** Reverses a `todo`-source completion; permanent `completed` rows ignore it. */
  onToggleComplete: (id: string) => void
}

interface GroupedEntries {
  [date: string]: DayDetailTask[]
}

interface CompletedTodosFilterState {
  period: CompletedPeriod
  categoryId: number | null
  customDateRange?: DateRange
}

const INITIAL_COMPLETED_TODOS_FILTERS: CompletedTodosFilterState = {
  period: 'all',
  categoryId: null,
}

/**
 * Renders the permanent win journal with an independent Warm Preset Bar whenever Home shows the Completed Tasks panel.
 * @param props - Loaded categories plus the Todo completion-reversal callback.
 * @returns The stable Completed Tasks card across loading, error, empty, filtered-empty, and populated states.
 * @example
 * <CompletedTodos categories={categories} onToggleComplete={toggleComplete} />
 */
export const CompletedTodos = function CompletedTodos({
  categories,
  onToggleComplete,
}: CompletedTodosProps) {
  const observerRef = useRef<HTMLDivElement>(null)
  const [filters, setFilters] = useState<CompletedTodosFilterState>(
    INITIAL_COMPLETED_TODOS_FILTERS,
  )
  const { categoryId, customDateRange, period } = filters
  const localDayKey = useLocalDayKey()
  // The Date instances must stay stable between unrelated renders because they
  // participate in oRPC's generated infinite-query key. Local-day changes
  // intentionally roll relative presets forward in a long-running app.
  const dateRange = useMemo(
    () =>
      resolveCompletedJournalDateRange(
        period,
        new Date(`${localDayKey}${LOCAL_DAY_QUERY_ANCHOR_TIME}`),
        customDateRange,
      ),
    [customDateRange, localDayKey, period],
  )
  const isFiltered = period !== 'all' || categoryId !== null

  // A category may be deleted/renamed from the sidebar while this independent
  // filter is active; deleted IDs fall back to All instead of leaving a blank Select.
  useUpdateEffect(() => {
    if (
      categoryId !== null &&
      !categories.some((category) => category.id === categoryId)
    ) {
      setFilters((currentFilters) => ({
        ...currentFilters,
        categoryId: null,
      }))
    }
  }, [categories, categoryId])

  // Infinite scroll over the merged journal feed, with predicates applied by
  // the server before both pagination and total calculation.
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery(
    orpc.completed.journal.infiniteOptions({
      input: (pageParam) => ({
        limit: COMPLETED_JOURNAL_PAGE_SIZE,
        offset: pageParam ?? 0,
        ...(categoryId === null ? {} : { categoryId }),
        ...dateRange,
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

  // Entries arrive newest-first, so each group's first timestamp sorts the days.
  const sortedDates = Object.keys(groupedEntries).sort((a, b) => {
    const dateA = groupedEntries[a]?.[0]?.completedAt.getTime() ?? 0
    const dateB = groupedEntries[b]?.[0]?.completedAt.getTime() ?? 0
    return dateB - dateA
  })

  // Intersection Observer advances only the currently-filtered result set.
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

  /**
   * Restores the journal's original full-history view from either Clear affordance.
   * @returns Nothing after resetting both independent filter dimensions.
   * @example
   * clearFilters()
   */
  const clearFilters = (): void => {
    setFilters(INITIAL_COMPLETED_TODOS_FILTERS)
  }

  const total = data?.pages[0]?.total ?? 0
  const isTrueEmpty = !isLoading && !isError && !isFiltered && total === 0
  const journalContent = match({
    hasEntries: allEntries.length > 0,
    isError,
    isLoading,
  })
    .with({ isLoading: true }, () => (
      <div className="flex h-full min-h-40 items-center justify-center p-8 text-muted-foreground">
        Loading...
      </div>
    ))
    .with({ isError: true }, () => (
      <div className="flex h-full min-h-40 items-center justify-center p-8 text-center text-muted-foreground">
        <p className="text-destructive">An error occurred</p>
      </div>
    ))
    .with({ hasEntries: false }, () => (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
        <CheckCircle2 className="size-12 opacity-50" aria-hidden="true" />
        {isFiltered ? (
          <>
            <div className="space-y-1">
              <p className="text-foreground">No wins in this view yet</p>
              <p className="text-sm">Your full history is still here.</p>
            </div>
            <Button type="button" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          </>
        ) : (
          <>
            <p>No wins logged yet</p>
            {/* Day-one discoverability: surface the Import affordance inline. */}
            <CompletedImportEntry />
            <p className="text-xs">
              Finish a task or import past wins — they&apos;ll appear here
            </p>
          </>
        )}
      </div>
    ))
    .otherwise(() => (
      <div className="-mr-2 h-full space-y-4 overflow-y-auto pr-2">
        {sortedDates.map((date, dateIndex) => {
          const entriesForDate = groupedEntries[date]
          return (
            <div key={`date-${date}`}>
              {dateIndex > 0 ? <Separator className="mb-3" /> : null}
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

        {isFetchingNextPage ? (
          <div className="flex justify-center p-4">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : null}

        {/* Intersection observer target */}
        {hasNextPage ? <div ref={observerRef} className="h-1" /> : null}

        {!hasNextPage && allEntries.length > COMPLETED_JOURNAL_PAGE_SIZE ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            All wins loaded
          </div>
        ) : null}
      </div>
    ))

  return (
    <Card
      className="flex h-full flex-col"
      role="region"
      aria-labelledby="completed-tasks-heading"
      aria-busy={isFetching}
    >
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center justify-between gap-3">
          <div id="completed-tasks-heading" className="flex items-center gap-2">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            Completed Tasks
          </div>
          <Badge
            variant="secondary"
            className="flex items-center gap-1"
            aria-live="polite"
            aria-label={`${total} completed tasks in current view`}
          >
            {total} completed
          </Badge>
        </CardTitle>
        <CardDescription>Your wins, newest first</CardDescription>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <CompletedTodosFilters
            categories={categories}
            period={period}
            categoryId={categoryId}
            customDateRange={customDateRange}
            onPeriodChange={(nextPeriod) =>
              setFilters((currentFilters) => ({
                ...currentFilters,
                period: nextPeriod,
              }))
            }
            onCategoryChange={(nextCategoryId) =>
              setFilters((currentFilters) => ({
                ...currentFilters,
                categoryId: nextCategoryId,
              }))
            }
            onCustomDateRangeChange={(nextCustomDateRange) =>
              setFilters((currentFilters) => ({
                ...currentFilters,
                customDateRange: nextCustomDateRange,
              }))
            }
            onClear={clearFilters}
          />
          {/* Empty history keeps the Import entry in the centered onboarding state. */}
          {!isTrueEmpty ? <CompletedImportEntry /> : null}
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-hidden">
        {journalContent}
      </CardContent>
    </Card>
  )
}
