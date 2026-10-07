import { COMPLETED_JOURNAL_PAGE_SIZE } from '@/lib/constants/completed'

/**
 * Builds the canonical unfiltered journal page input shared by the visible query and its exact optimistic cache key.
 * @param pageParam - Offset supplied by TanStack Query, or undefined for the first page.
 * @returns The stable limit-and-offset input for an unfiltered Completed journal page.
 * @example
 * getUnfilteredCompletedJournalInput(undefined) // => { limit: 10, offset: 0 }
 */
export function getUnfilteredCompletedJournalInput(
  pageParam: number | undefined,
) {
  return {
    limit: COMPLETED_JOURNAL_PAGE_SIZE,
    offset: pageParam ?? 0,
  }
}
