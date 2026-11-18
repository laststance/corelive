import {
  hashKey,
  isCancelledError,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { z } from 'zod'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { COMPLETED_JOURNAL_INITIAL_OFFSET } from '@/lib/constants/completed'
import { orpc } from '@/lib/orpc/client-query'
import { getUnfilteredCompletedJournalInput } from '@/lib/utils/getUnfilteredCompletedJournalInput'
import type { CompletedJournalInputSchema } from '@/server/schemas/completed'

import { getJournalRowId } from './CompletedJournalRow'

/**
 * Fetches journal pages as the sentinel enters view. After a page fails,
 * {@link CompletedTodos} offers a manual retry and keeps its button focused
 * until the requested rows appear or the reader moves elsewhere.
 * @example
 * const pagination = useJournalPagination({ search: 'Release' }, true, journalRef)
 */
export function useJournalPagination(
  filters: Omit<
    z.input<typeof CompletedJournalInputSchema>,
    'limit' | 'offset'
  >,
  enabled: boolean,
  journalRef: RefObject<HTMLDivElement | null>,
) {
  const queryClient = useQueryClient()
  const observerRef = useRef<HTMLDivElement>(null)
  const journalOptions = orpc.completed.journal.infiniteOptions({
    input: (pageParam) => ({
      ...getUnfilteredCompletedJournalInput(pageParam),
      ...filters,
    }),
    initialPageParam: COMPLETED_JOURNAL_INITIAL_OFFSET,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  })

  const query = useInfiniteQuery({ ...journalOptions, enabled })

  const {
    data,
    hasNextPage,
    isFetchNextPageError,
    fetchNextPage,
    fetchStatus,
  } = query
  // Remember the failed offset across background refreshes and Back/Forward for each journal view.
  const viewKey = hashKey(journalOptions.queryKey)
  const [failedPages, setFailedPages] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  )
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const failedOffset = failedPages.get(viewKey)
  const nextOffset = data?.pages.at(-1)?.nextOffset
  const requestNextPage = (): void => {
    // A sync refresh can start before React renders its busy state.
    if (
      nextOffset === undefined ||
      queryClient.getQueryState(journalOptions.queryKey)?.fetchStatus !== 'idle'
    )
      return
    void fetchNextPage({ cancelRefetch: false, throwOnError: true }).catch(
      (error: unknown) => {
        if (!isCancelledError(error)) {
          setFailedPages((current) => new Map(current).set(viewKey, nextOffset))
        }
      },
    )
  }

  // Keep the retry control mounted until the new rows are committed, so its focus is still observable.
  useCycleEffect(() => {
    if (!data || failedOffset === undefined || nextOffset === failedOffset)
      return
    const retryButton = retryButtonRef.current
    if (retryButton && document.activeElement === retryButton) {
      const page = data.pages[data.pageParams.indexOf(failedOffset)]
      const win = page?.entries[0] ?? data.pages.at(-1)?.entries.at(-1)
      const target = win ? document.getElementById(getJournalRowId(win)) : null
      const focusTarget = target ?? journalRef.current
      focusTarget?.focus()
    }
    setFailedPages((current) => {
      const remaining = new Map(current)
      remaining.delete(viewKey)
      return remaining
    })
  }, [data, failedOffset, nextOffset, viewKey])

  const canObserveNextPage =
    enabled &&
    hasNextPage &&
    failedOffset === undefined &&
    !isFetchNextPageError &&
    fetchStatus === 'idle'

  const onIntersection = useEffectEvent(
    (entries: IntersectionObserverEntry[]) => {
      // This observer tracks one sentinel. A batch can contain both entry and exit.
      if (canObserveNextPage && entries.at(-1)?.isIntersecting)
        requestNextPage()
    },
  )
  useEffect(() => {
    const target = observerRef.current
    if (!canObserveNextPage || !target) return
    let observing = true
    const observer = new IntersectionObserver(
      (entries) => {
        // Ignore notifications queued before switching to another journal view.
        if (observing) onIntersection(entries)
      },
      { threshold: 0.1 },
    )

    observer.observe(target)

    return (): void => {
      observing = false
      observer.disconnect()
    }
  }, [canObserveNextPage, viewKey])

  return {
    query,
    viewKey,
    observerRef,
    retryButtonRef,
    requestNextPage,
    needsRetry: failedOffset !== undefined,
  }
}
