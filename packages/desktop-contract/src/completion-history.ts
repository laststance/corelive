import { z } from 'zod'

import { CompletedJournalSearchSchema } from './journal-search'

/** Agent-facing filters and continuation for the Mac's calendar and device category IDs. */
export const McpHistoryInputSchema = z.strictObject({
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  categoryId: z.uuid().optional(),
  includeSubcategories: z.boolean().optional(),
  search: CompletedJournalSearchSchema.optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  cursor: z.uuid().optional(),
})
export type McpHistoryInput = z.infer<typeof McpHistoryInputSchema>

/** UTC instants corresponding to the half-open local calendar interval on the requesting Mac. */
const calendarInstant = z
  .number()
  .int()
  .min(Date.parse('0000-12-30T00:00:00Z'))
  .max(Date.parse('+010000-01-03T00:00:00Z'))
export const CompletionRangeSchema = z
  .strictObject({ from: calendarInstant, before: calendarInstant })
  .refine(({ from, before }) => from < before)
export type CompletionRange = z.infer<typeof CompletionRangeSchema>

const accountRow = z.strictObject({
  source: z.enum(['todo', 'completed']),
  id: z.number().int().positive(),
  completionId: z.uuid().nullable(),
  title: z.string(),
  completedAt: z.number().int(),
  categoryId: z.number().int().positive(),
  parentCategoryId: z.number().int().positive().nullable(),
  categoryPath: z.string(),
})
export type AccountHistoryRow = z.infer<typeof accountRow>

/** Ordered rows followed by an explicit membership checksum from the same authenticated query. */
export const HistoryFrameSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('rows'),
    offset: z.number().int().nonnegative(),
    entries: z.array(accountRow).min(1).max(128),
  }),
  z.strictObject({
    type: z.literal('end'),
    accountId: z.string().min(1),
    total: z.number().int().nonnegative(),
    membership: z.string().regex(/^[a-f0-9]{64}$/),
  }),
])
export type HistoryFrame = z.infer<typeof HistoryFrameSchema>

/**
 * Produces the same unambiguous identity bytes for the server and the Mac's terminal check.
 * @example historyMember({ source: 'todo', id: 12, completionId: null }) // 'todo:12:-\n'
 */
export function historyMember(
  row: Pick<AccountHistoryRow, 'source' | 'id' | 'completionId'>,
): string {
  return `${row.source}:${row.id}:${row.completionId ?? '-'}\n`
}
