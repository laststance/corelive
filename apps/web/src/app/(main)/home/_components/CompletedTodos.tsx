import { isCompletedJournalFilterSupported } from '@corelive/desktop-contract/journal-search'
import { useInfiniteQuery } from '@tanstack/react-query'
import { CheckCircle2, Download } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useRef, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useInitialEffect } from '@/hooks/use-initial-effect'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useLocalDayKey } from '@/hooks/useLocalDayKey'
import {
  COMPLETED_JOURNAL_INITIAL_OFFSET,
  COMPLETED_JOURNAL_PAGE_SIZE,
  COMPLETED_JOURNAL_SEARCH_MAX_LENGTH,
} from '@/lib/constants/completed'
import { LOCAL_DAY_QUERY_ANCHOR_TIME } from '@/lib/constants/date'
import { MAC_DOWNLOAD_URL } from '@/lib/constants/macDownload'
import { orpc } from '@/lib/orpc/client-query'
import { getUnfilteredCompletedJournalInput } from '@/lib/utils/getUnfilteredCompletedJournalInput'
import {
  type CompletedPeriod,
  resolveCompletedJournalDateRange,
} from '@/lib/utils/resolveCompletedJournalDateRange'
import {
  CompletedJournalSearchSchema,
  DayDetailInputSchema,
  type DayDetailTask,
} from '@/server/schemas/completed'

import { CompletedJournalRow } from './CompletedJournalRow'
import {
  CompletedTodosFilters,
  type CompletedFilterCategory,
} from './CompletedTodosFilters'

interface CompletedTodosProps {
  /** Dashboard categories, or undefined until the category list is available. */
  categories: readonly CompletedFilterCategory[] | undefined
  /** Whether the first activity snapshot has rendered above this journal. */
  hasActivityData?: boolean
}

interface GroupedEntries {
  [date: string]: DayDetailTask[]
}

interface CompletedTodosFilterState {
  period: CompletedPeriod
  customDateRange?: DateRange
}

const INITIAL_COMPLETED_TODOS_FILTERS: CompletedTodosFilterState = {
  period: 'all',
}

// Category IDs are PostgreSQL serial values.
const MAX_CATEGORY_ID = 2_147_483_647

/**
 * Reads a journal link before the Dashboard requests or displays its results.
 * An invalid search stays editable, and a category can resolve while its catalog loads.
 * @example
 * readJournalLink(new URLSearchParams('search=planning'), [])
 */
function readJournalLink(
  searchParams: Pick<URLSearchParams, 'get'>,
  categories: CompletedTodosProps['categories'],
) {
  const rawSearch = searchParams.get('search') ?? ''
  const parsedSearch = CompletedJournalSearchSchema.safeParse(rawSearch)
  const search = parsedSearch.success ? parsedSearch.data : rawSearch
  const taskFilter = searchParams.get('filter')
  const unsupportedFilter = !isCompletedJournalFilterSupported(taskFilter)
  const canLoadJournal = parsedSearch.success && !unsupportedFilter
  const requestedCategory = searchParams.get('category')
  const requestedCategoryId = Number(requestedCategory)
  const isValidCategoryId =
    requestedCategoryId > 0 &&
    requestedCategoryId <= MAX_CATEGORY_ID &&
    Number.isInteger(requestedCategoryId) &&
    String(requestedCategoryId) === requestedCategory
  // Honor valid links before the catalog loads, then resolve against confirmed categories.
  const availableCategories = categories?.filter(({ id }) => id > 0) ?? []
  const categoryId =
    isValidCategoryId &&
    (categories === undefined ||
      availableCategories.some(({ id }) => id === requestedCategoryId))
      ? requestedCategoryId
      : null
  return {
    search,
    invalidSearch: !parsedSearch.success,
    taskFilter,
    unsupportedFilter,
    canLoadJournal,
    availableCategories,
    categoryId,
  }
}

/**
 * Renders the searchable completion journal on Home and bounds its URL-dependent content.
 * @param props - Loaded categories for the filter bar.
 * @returns The stable Completed Tasks card across loading, error, empty, filtered-empty, and populated states.
 * @example
 * <CompletedTodos categories={categories} />
 */
export function CompletedTodos(props: CompletedTodosProps) {
  return (
    <Suspense
      fallback={
        <Card aria-busy="true">
          <CardHeader>
            <CardTitle>Completion journal</CardTitle>
            <CardDescription>Loading completed tasks…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <CompletedTodosContent {...props} />
    </Suspense>
  )
}

function CompletedTodosContent({
  categories,
  hasActivityData = true,
}: CompletedTodosProps) {
  const journalRef = useRef<HTMLDivElement>(null)
  const initialScrollOffset = useRef<number | null>(null)
  const observerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isClerkQueryReady = useClerkQueryReady()
  const searchParams = useSearchParams()
  const {
    search,
    invalidSearch,
    taskFilter,
    unsupportedFilter,
    canLoadJournal,
    availableCategories,
    categoryId,
  } = readJournalLink(searchParams, categories)
  const [draft, setDraft] = useState({ search, value: search })
  // Keep the input in sync with links and Back/Forward while typing stays local.
  if (draft.search !== search) {
    setDraft({ search, value: search })
  }
  const [filters, setFilters] = useState<CompletedTodosFilterState>(
    INITIAL_COMPLETED_TODOS_FILTERS,
  )
  const { customDateRange, period } = filters
  const [directOnlyCategoryId, setDirectOnlyCategoryId] = useState<
    number | null
  >(null)
  // Moving to a different category restores the default scope, including via Back/Forward.
  if (directOnlyCategoryId !== null && directOnlyCategoryId !== categoryId) {
    setDirectOnlyCategoryId(null)
  }
  const includeSubcategories = directOnlyCategoryId === null

  // Next can consume the fragment while Dashboard still shows its loading state.
  useInitialEffect(() => {
    const { hash } = window.location
    const opensDayDetail = DayDetailInputSchema.safeParse({
      date: searchParams.get('date'),
    }).success
    const isSearchLink =
      !hash && (!!search || unsupportedFilter) && !opensDayDetail
    const journal = journalRef.current
    if (journal && (hash === '#journal' || isSearchLink)) {
      journal.scrollIntoView()
      journal.focus({ preventScroll: true })
      if (!hasActivityData) initialScrollOffset.current = window.scrollY
    }
  })

  // Activity cards can push the journal out of view after the first jump.
  useCycleEffect(() => {
    if (!hasActivityData) return

    const scrollOffset = initialScrollOffset.current
    initialScrollOffset.current = null
    const journal = journalRef.current
    if (
      scrollOffset === null ||
      scrollOffset !== window.scrollY ||
      !journal ||
      document.activeElement !== journal
    )
      return

    journal.scrollIntoView()
  }, [hasActivityData])

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
  const isFiltered = period !== 'all' || categoryId !== null || search !== ''

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
    isPaused,
    refetch,
  } = useInfiniteQuery({
    ...orpc.completed.journal.infiniteOptions({
      input: (pageParam) => ({
        ...getUnfilteredCompletedJournalInput(pageParam),
        ...(categoryId === null ? {} : { categoryId, includeSubcategories }),
        ...(search === '' ? {} : { search }),
        ...dateRange,
      }),
      initialPageParam: COMPLETED_JOURNAL_INITIAL_OFFSET,
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    }),
    // Same pre-auth fetch guard as every sibling Home query: if a future
    // mount path renders this panel before Clerk hydrates, the stale-refetch
    // fires unauthenticated — hydrated/persisted journal data still displays.
    enabled: isClerkQueryReady && canLoadJournal,
  })

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
    const target = observerRef.current
    if (!canLoadJournal || !target || !hasNextPage || isFetchingNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(target)

    return (): void => observer.disconnect()
  }, [
    canLoadJournal,
    categoryId,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    search,
  ])

  const updateJournalUrl = (changes: {
    search?: string
    category?: string
    filter?: string
  }): void => {
    const url = new URL(window.location.href)
    // Apply only the given filters so other Dashboard state stays in the URL.
    for (const [filter, value] of Object.entries(changes)) {
      if (value) {
        url.searchParams.set(filter, value)
      } else {
        url.searchParams.delete(filter)
      }
    }
    if (url.href !== window.location.href) {
      window.history.pushState(null, '', url)
    }
  }

  const applySearch = (value: string): void => {
    const parsed = CompletedJournalSearchSchema.safeParse(value)
    if (!parsed.success) return

    updateJournalUrl({ search: parsed.data })
    setDraft({ search, value: parsed.data })
  }

  const clearFilters = (): void => {
    setFilters(INITIAL_COMPLETED_TODOS_FILTERS)
    setDirectOnlyCategoryId(null)
    updateJournalUrl({ search: '', category: '', filter: '' })
    setDraft({ search, value: '' })
    searchInputRef.current?.focus()
  }

  const total = canLoadJournal ? data?.pages[0]?.total : undefined
  const journalContent = match({
    invalidSearch,
    unsupportedFilter,
    waitingForConnection: isPaused && data === undefined,
    hasEntries: allEntries.length > 0,
    // A failed background refetch keeps the already-loaded history on screen;
    // the error block is only for "nothing loaded at all".
    isError: isError && data === undefined,
    isLoading,
  })
    .with({ unsupportedFilter: true }, () => (
      <p role="status" className="p-8 text-center text-muted-foreground">
        {taskFilter === 'pending'
          ? 'Pending tasks are available in the CoreLive desktop app.'
          : 'This task filter is unavailable in the completion journal.'}{' '}
        Clear filters to view completed tasks.
      </p>
    ))
    .with({ invalidSearch: true }, () => (
      <p
        id="journal-search-error"
        role="status"
        className="p-8 text-center text-muted-foreground"
      >
        Edit your search to use up to {COMPLETED_JOURNAL_SEARCH_MAX_LENGTH}{' '}
        characters of plain text, or clear filters.
      </p>
    ))
    .with({ waitingForConnection: true }, () => (
      <p role="status" className="p-8 text-center text-muted-foreground">
        The journal will load when you’re back online.
      </p>
    ))
    .with({ isLoading: true }, () => (
      <div className="flex h-full min-h-40 items-center justify-center p-8 text-muted-foreground">
        Loading...
      </div>
    ))
    .with({ isError: true }, () => (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
        <p role="status">The journal could not load.</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Retry journal
        </Button>
      </div>
    ))
    .with({ hasEntries: false }, () => (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
        <CheckCircle2 className="size-12 opacity-50" aria-hidden="true" />
        {isFiltered ? (
          <>
            <div className="space-y-1">
              <p className="text-foreground">
                {search ? 'No matching wins' : 'No wins in this view yet'}
              </p>
              <p className="text-sm">
                {search
                  ? 'Try a different search.'
                  : 'Your full history is still here.'}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-foreground">Your year starts here</p>
              <p className="text-sm text-muted-foreground">
                Check a line off in the CoreLive desktop app — it&apos;ll appear
                here
              </p>
            </div>
            <Button variant="outline" asChild>
              <a
                href={MAC_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download aria-hidden="true" />
                Get Mac app
                <span className="sr-only">(opens GitHub in a new tab)</span>
              </a>
            </Button>
          </>
        )}
      </div>
    ))
    .otherwise(() => (
      <div
        key={`${categoryId ?? 'all'}:${search}`}
        className="-mr-2 h-full space-y-4 overflow-y-auto pr-2"
      >
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
      ref={journalRef}
      id="journal"
      tabIndex={-1}
      className="flex h-full scroll-mt-6 flex-col"
      role="region"
      aria-labelledby="completion-journal-heading"
      aria-busy={isFetching}
    >
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center justify-between gap-3">
          <h2
            id="completion-journal-heading"
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="size-5" aria-hidden="true" />
            Completion journal
          </h2>
          {total !== undefined ? (
            <Badge
              variant="secondary"
              className="flex items-center gap-1"
              aria-live="polite"
              aria-label={`${total} completed tasks in current view`}
            >
              {total} completed
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>Your wins, newest first</CardDescription>
        <form
          role="search"
          aria-label="Completed tasks"
          className="flex items-center gap-2 pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            applySearch(draft.value)
          }}
        >
          <Input
            ref={searchInputRef}
            type="search"
            aria-label="Search completed tasks"
            aria-invalid={invalidSearch || undefined}
            aria-describedby={
              invalidSearch && !unsupportedFilter
                ? 'journal-search-error'
                : undefined
            }
            placeholder="Search completed tasks"
            autoComplete="off"
            maxLength={COMPLETED_JOURNAL_SEARCH_MAX_LENGTH}
            className="min-h-11"
            value={draft.value}
            onChange={(event) =>
              setDraft({ search, value: event.target.value })
            }
          />
          <Button type="submit" variant="outline" className="min-h-11">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <CompletedTodosFilters
            categories={availableCategories}
            period={period}
            categoryId={categoryId}
            includeSubcategories={includeSubcategories}
            hasSearch={search !== '' || unsupportedFilter}
            onIncludeSubcategoriesChange={(include) =>
              setDirectOnlyCategoryId(include ? null : categoryId)
            }
            customDateRange={customDateRange}
            onPeriodChange={(nextPeriod) =>
              setFilters((currentFilters) => ({
                ...currentFilters,
                period: nextPeriod,
              }))
            }
            onCategoryChange={(nextCategoryId) =>
              updateJournalUrl({ category: nextCategoryId?.toString() ?? '' })
            }
            onCustomDateRangeChange={(nextCustomDateRange) =>
              setFilters((currentFilters) => ({
                ...currentFilters,
                customDateRange: nextCustomDateRange,
              }))
            }
            onClear={clearFilters}
          />
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-hidden">
        {journalContent}
      </CardContent>
    </Card>
  )
}
