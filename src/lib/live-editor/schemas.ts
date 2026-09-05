import { z } from 'zod'

import {
  LOCAL_COMPLETIONS_SCHEMA_VERSION,
  LOCAL_PENDING_MERGE_SCHEMA_VERSION,
} from './constants'

/**
 * One device-local keep. `mergedBatchId` is stamped by the future sign-in merge
 * so the sign-in merge can skip items that already landed in the account.
 * @example
 * { id: '5b1c…', title: 'buy milk', completedAt: '2026-09-04T09:12:00.000Z' }
 */
export const localCompletionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** ISO timestamp; validated as a date when counted, never at parse time. */
  completedAt: z.string().min(1),
  mergedBatchId: z.string().optional(),
})

export type LocalCompletion = z.infer<typeof localCompletionSchema>

/**
 * The whole `corelive.local-completions.v1` value. Anything that fails this
 * schema (corrupt JSON, a foreign value under the key, an old version) is read
 * as empty and overwritten on the next write.
 */
export const localCompletionsFileSchema = z.object({
  version: z.literal(LOCAL_COMPLETIONS_SCHEMA_VERSION),
  items: z.array(localCompletionSchema),
})

/** The `corelive.local-note.v1` value: note text keyed by category id string. */
export const localNoteMapSchema = z.record(z.string(), z.string())

export type LocalNoteMap = z.infer<typeof localNoteMapSchema>

/**
 * The `corelive.local-merge-pending.v1` value: the batch a sign-in merge claimed
 * before sending. Holding the ids (not just the id) is what lets a retry re-send
 * exactly the original set instead of whatever the store holds by then.
 * @example
 * { version: 1, clerkId: 'user_2f…', batchId: '7d0c1a2e-…', ids: ['5b1c…'] }
 */
export const pendingMergeSchema = z.object({
  version: z.literal(LOCAL_PENDING_MERGE_SCHEMA_VERSION),
  // Required, so a record written before this field existed fails closed and is
  // treated as "not mine" rather than resumed under whoever signs in next.
  clerkId: z.string().min(1),
  batchId: z.string().min(1),
  ids: z.array(z.string().min(1)),
})

export type PendingMerge = z.infer<typeof pendingMergeSchema>
