import { z } from 'zod'

import { CategorySchema } from './category'
import { UserSettingsPatchSchema, UserSettingsStateSchema } from './settings'

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
export interface OfflineDraftRecord {
  categoryId: number
  draft: OfflineDraft
}

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
    if (
      receipt.projection &&
      receipt.projection.completionId !== receipt.completionId
    )
      context.addIssue({ code: 'custom', message: 'Receipt identity mismatch' })
  })
export type CompletionSyncReceipt = z.infer<typeof CompletionSyncReceiptSchema>

export const OfflineCompletionSchema = z.object({
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
export type OfflineCompletion = z.infer<typeof OfflineCompletionSchema>

export const OutboxEntrySchema = z.object({
  operation: CompletionSyncOperationSchema,
  state: z.enum(['queued', 'sent', 'blocked']),
  failure: SyncFailureSchema.optional(),
  receipt: CompletionSyncReceiptSchema.optional(),
})
export type OutboxEntry = z.infer<typeof OutboxEntrySchema>

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
export const OfflineWorkspaceSchema = z.object({
  version: z.literal(1),
  ownerId: z.string().min(1),
  deviceId: identity,
  revision,
  preparedAt: timestamp,
  selectedCategoryId: categoryId,
  categories: z.array(EditorCategorySchema),
  preferences: OfflinePreferencesSchema,
  drafts: z.record(z.string(), DraftSchema),
  completions: z.record(identity, OfflineCompletionSchema),
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
  outbox: z.record(identity, OutboxEntrySchema),
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
export type OfflineWorkspace = z.infer<typeof OfflineWorkspaceSchema>

const commandIdentity = z.object({ commandId: identity })
export const WorkspaceCommandSchema = z.discriminatedUnion('type', [
  commandIdentity.extend({
    type: z.literal('save'),
    categoryId,
    baseRevision: revision,
    rows: z.array(DraftRowSchema),
  }),
  commandIdentity.extend({
    type: z.literal('complete'),
    categoryId,
    baseRevision: revision,
    rowId: identity,
    completionId: identity,
    completedAt: timestamp,
    timezone: z.string().min(1).max(100),
  }),
  commandIdentity.extend({ type: z.literal('undo'), completionId: identity }),
  commandIdentity.extend({ type: z.literal('clear'), completionId: identity }),
  commandIdentity.extend({ type: z.literal('select'), categoryId }),
  commandIdentity.extend({
    type: z.literal('moveCategory'),
    sourceId: categoryId,
    destinationId: categoryId,
  }),
  commandIdentity.extend({
    type: z.literal('correctTime'),
    completionId: identity,
    completedAt: timestamp,
  }),
  commandIdentity.extend({
    type: z.literal('resolveConflict'),
    completionId: identity,
    choice: z.enum(['server', 'local']),
    expectedLocalRevision: revision,
    expectedRemoteRevision: revision,
  }),
  commandIdentity.extend({
    type: z.literal('retrySync'),
    completionId: identity,
  }),
  commandIdentity.extend({
    type: z.literal('restoreRecovery'),
    copyId: identity,
    destinationId: categoryId,
  }),
  commandIdentity.extend({
    type: z.literal('preferences'),
    expectedRevision: revision,
    patch: UserSettingsPatchSchema,
    theme: z.string().min(1).max(50).optional(),
  }),
])
export type WorkspaceCommand = z.infer<typeof WorkspaceCommandSchema>

/** Bounded renderer-facing projection; large history and command ledgers stay in the worker. */
export interface OfflineWorkspaceView {
  ownerId: string
  revision: number
  selectedCategoryId: number
  categories: EditorCategory[]
  preferences: OfflinePreferences
  draft: OfflineDraft
  pendingCount: number
  blockedCount: number
  recentUndo: OfflineCompletion[]
  eligibleUndoCount: number
  checkpoint: CountCheckpoint | null
  today: OfflineTodayCount
  nextClearAt: number | null
  nextUndoAt: number | null
  categoryDeletions: Record<string, number>
  recoveryCopyCount: number
}

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

export type OfflineSyncStatus =
  'idle' | 'syncing' | 'offline' | 'sign-in-required'
export type OfflineEditorSnapshot = {
  /** Main's transient publication order, independent of durable workspace revisions. */
  sequence?: number
} & (
  | {
      phase: 'ready'
      generation: number
      workspace: OfflineWorkspaceView
      sync: OfflineSyncStatus
      storageError?: boolean
      unsavedDraft?: Extract<WorkspaceCommand, { type: 'save' }>
    }
  | {
      phase:
        'opening' | 'preparing' | 'needs-preparation' | 'locked' | 'recovery'
      generation: number
      reason?: string
      canRecover?: boolean
    }
)
export type OfflineCommandResult =
  | {
      ok: true
      generation: number
      revision: number
      workspace: OfflineWorkspaceView | null
      writtenDraft?: OfflineDraftRecord
    }
  | { ok: false; reason: string }
