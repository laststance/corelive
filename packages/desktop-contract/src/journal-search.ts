import { z } from 'zod'

import { COMPLETED_JOURNAL_SEARCH_MAX_LENGTH } from './constants'

/** Line breaks removed by the search input and by the journal title comparison. */
export const JOURNAL_SEARCH_LINE_BREAKS = '\r\n'
const journalSearchLineBreakPattern = new RegExp(
  `[${JOURNAL_SEARCH_LINE_BREAKS}]`,
  'g',
)

/**
 * Gives the schema and Dashboard QA fixture the same single-line search text
 * without changing the displayed title.
 * @example stripJournalSearchLineBreaks('Ship\r\n_50%') // => 'Ship_50%'
 */
export function stripJournalSearchLineBreaks(value: string): string {
  return value.replace(journalSearchLineBreakPattern, '')
}

/**
 * Normalizes desktop links and Dashboard requests to the single line a search
 * input can display. The journal rejects NUL because PostgreSQL text cannot store it.
 * @example
 * CompletedJournalSearchSchema.parse('  Ship\r\n_50%  ') // => 'Ship_50%'
 */
export const CompletedJournalSearchSchema = z
  .string()
  .overwrite(stripJournalSearchLineBreaks)
  .trim()
  .max(COMPLETED_JOURNAL_SEARCH_MAX_LENGTH)
  .refine((value) => !value.includes('\0'))

/**
 * Lets both Dashboard URLs and desktop search links select completed history.
 * Legacy links without a filter include all completions.
 * @example isCompletedJournalFilterSupported('pending') // false
 */
export function isCompletedJournalFilterSupported(
  filter: string | null | undefined,
): boolean {
  return ['all', 'completed'].includes(filter ?? 'all')
}
