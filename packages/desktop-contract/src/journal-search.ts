import { z } from 'zod'

import { COMPLETED_JOURNAL_SEARCH_MAX_LENGTH } from './constants'

/**
 * Normalizes desktop links and Dashboard requests to the single line a search
 * input can display. The journal rejects NUL because PostgreSQL text cannot store it.
 * @example
 * CompletedJournalSearchSchema.parse('  Ship\r\n_50%  ') // => 'Ship_50%'
 */
export const CompletedJournalSearchSchema = z
  .string()
  .overwrite((value) => value.replace(/[\r\n]/g, ''))
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
