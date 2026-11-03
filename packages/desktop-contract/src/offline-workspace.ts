import { z } from 'zod'

import { CategorySchema } from './category'
import { UserSettingsStateSchema } from './settings'

const identity = z.uuid()
const revision = z.number().int().nonnegative()
const timestamp = z.number().int().min(0).max(253402300799999)
const categoryId = z.number().int().positive()

/** Minimal category projection derived from the existing API's authoritative schema. */
export const EditorCategorySchema = CategorySchema.pick({
  id: true,
  name: true,
  color: true,
  isDefault: true,
  parentId: true,
}).extend({ removed: z.boolean().default(false) })
export type EditorCategory = z.infer<typeof EditorCategorySchema>

/** An occurrence identity survives unrelated edits; identical titles have distinct IDs. */
export const DraftRowSchema = z.object({
  id: identity,
  text: z.string(),
  completionId: identity.optional(),
})
export type DraftRow = z.infer<typeof DraftRowSchema>
export const DraftSchema = z.object({
  revision,
  rows: z.array(DraftRowSchema),
  // Older snapshots derive this allowance from their preserved writing on first use.
  inputLimit: revision.optional(),
})
export type OfflineDraft = z.infer<typeof DraftSchema>

/** Shared public sync command, independently validated at the server boundary. */
export const CompletionSyncOperationSchema = z.object({
  operationId: identity,
  completionId: identity,
  deviceId: identity,
  revision: revision.refine((value) => value > 0),
  expectedRemoteRevision: revision,
  kind: z.enum(['create', 'cancel', 'relocate', 'correctTime']),
  categoryId,
  title: z.string().trim().min(1).max(255),
  completedAt: timestamp,
  originalCompletedAt: timestamp,
  timezone: z.string().min(1).max(100),
})
export type CompletionSyncOperation = z.infer<
  typeof CompletionSyncOperationSchema
>

export const CompletionProjectionSchema = z.object({
  completionId: identity,
  revision,
  cancelled: z.boolean(),
  categoryId,
  title: z.string(),
  completedAt: timestamp,
})
export type CompletionProjection = z.infer<typeof CompletionProjectionSchema>

export const SyncFailureSchema = z.enum([
  'category-removed',
  'invalid-time',
  'conflict',
  'dependency',
])
/**
 * Rejects a completion receipt that lacks the evidence its status promises.
 *
 * Shared by the dashboard-id receipt here and the local-id receipt in `offline-workspace-v2`,
 * so both reject the same malformed shapes.
 *
 * @param receipt - The parsed receipt candidate.
 * @param context - The Zod refinement context that collects the issues.
 * @example
 * ```ts
 * schema.superRefine(requireReceiptEvidence)
 * ```
 */
export function requireReceiptEvidence(
  receipt: {
    status: 'applied' | 'rejected'
    projection: unknown
    reason?: unknown
  },
  context: z.RefinementCtx,
): void {
  if (receipt.status === 'applied' && !receipt.projection)
    context.addIssue({
      code: 'custom',
      message: 'Applied receipt requires its projection',
    })
  if (receipt.status === 'rejected' && !receipt.reason)
    context.addIssue({
      code: 'custom',
      message: 'Rejected receipt requires a reason',
    })
}

export const CompletionSyncReceiptSchema = z
  .object({
    operationId: identity,
    completionId: identity,
    revision,
    status: z.enum(['applied', 'rejected']),
    projection: CompletionProjectionSchema.nullable(),
    reason: SyncFailureSchema.optional(),
  })
  .superRefine((receipt, context) => {
    requireReceiptEvidence(receipt, context)
    if (
      receipt.projection &&
      receipt.projection.completionId !== receipt.completionId
    )
      context.addIssue({ code: 'custom', message: 'Receipt identity mismatch' })
  })
export type CompletionSyncReceipt = z.infer<typeof CompletionSyncReceiptSchema>

export const OfflineCompletionV1Schema = z.object({
  id: identity,
  categoryId,
  originalCategoryId: categoryId,
  title: z.string().min(1).max(255),
  rawText: z.string(),
  lineId: identity,
  lineIndex: z.number().int().nonnegative(),
  // Older snapshots without neighbors safely append when their occurrence no longer exists.
  previousRowId: identity.optional(),
  nextRowId: identity.optional(),
  completedAt: timestamp,
  originalCompletedAt: timestamp,
  timezone: z.string(),
  revision,
  undoUntil: timestamp,
  cancelled: z.boolean(),
  restored: z.boolean(),
  clearAfter: timestamp.nullable(),
  cleared: z.boolean(),
  remote: CompletionProjectionSchema.nullable(),
})
export type OfflineCompletionV1 = z.infer<typeof OfflineCompletionV1Schema>

export const OutboxEntryV1Schema = z.object({
  operation: CompletionSyncOperationSchema,
  state: z.enum(['queued', 'sent', 'blocked']),
  failure: SyncFailureSchema.optional(),
  receipt: CompletionSyncReceiptSchema.optional(),
})
export type OutboxEntryV1 = z.infer<typeof OutboxEntryV1Schema>

export const OfflinePreferencesSchema = z.object({
  revision,
  settings: UserSettingsStateSchema,
  theme: z.string().min(1).max(50),
})
export type OfflinePreferences = z.infer<typeof OfflinePreferencesSchema>

export const CountCheckpointSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string(),
  total: z.number().int().nonnegative(),
  fetchedAt: timestamp,
  identities: z.record(identity, CompletionProjectionSchema.nullable()),
})
export type CountCheckpoint = z.infer<typeof CountCheckpointSchema>

/** Versioned account snapshot. Credentials and arbitrary config are intentionally absent. */
export const OfflineWorkspaceV1Schema = z.object({
  version: z.literal(1),
  ownerId: z.string().min(1),
  deviceId: identity,
  revision,
  preparedAt: timestamp,
  selectedCategoryId: categoryId,
  categories: z.array(EditorCategorySchema),
  preferences: OfflinePreferencesSchema,
  drafts: z.record(z.string(), DraftSchema),
  completions: z.record(identity, OfflineCompletionV1Schema),
  retiredCompletions: z
    .record(
      identity,
      z.object({
        completedAt: timestamp,
        originalCompletedAt: timestamp,
        originalCategoryId: categoryId,
        timezone: z.string(),
        cancelled: z.boolean(),
        revision,
        remoteRevision: revision,
      }),
    )
    .default({}),
  outbox: z.record(identity, OutboxEntryV1Schema),
  commandReceipts: z.record(
    identity,
    z.object({
      digest: z.string(),
      completionId: identity.optional(),
      revision,
    }),
  ),
  categoryMoves: z.record(z.string(), categoryId),
  categoryDeletions: z.record(z.string(), categoryId).default({}),
  migration: z.object({
    version: z.literal(1),
    sourceHashes: z.record(z.string(), z.string()),
    observedHashes: z.record(z.string(), z.string()).default({}),
    unmappedCategoryIds: z.array(z.string()),
  }),
  checkpoint: CountCheckpointSchema.nullable(),
  recoveryCopies: z.array(
    z.object({
      id: identity,
      categoryId,
      text: z.string(),
      reason: z.string(),
      createdAt: timestamp,
      restoredTo: categoryId.optional(),
    }),
  ),
})
export type OfflineWorkspaceV1 = z.infer<typeof OfflineWorkspaceV1Schema>

/** Identity-based today feedback; stale or incomplete account evidence is never labelled fresh. */
export interface OfflineTodayCount {
  day: string
  timezone: string
  total: number
  deviceTotal: number
  scope: 'account' | 'device'
  stale: boolean
  confirmedAt: number | null
  lastAccountTotal: number | null
}
