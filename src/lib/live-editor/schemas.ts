import { z } from 'zod'

import { LOCAL_COMPLETIONS_SCHEMA_VERSION } from './constants'

/**
 * One device-local keep. `mergedBatchId` is stamped by the future sign-in merge
 * so the ember can exclude items that already landed in the account.
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

export type LocalCompletionsFile = z.infer<typeof localCompletionsFileSchema>

/** The `corelive.local-note.v1` value: note text keyed by category id string. */
export const localNoteMapSchema = z.record(z.string(), z.string())

export type LocalNoteMap = z.infer<typeof localNoteMapSchema>
