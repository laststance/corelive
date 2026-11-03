/**
 * The device workspace, registry and editor runtime contracts (#216 D1, D2, D7).
 *
 * These are the canonical runtime schemas. The v1 per-account schemas stay in
 * `offline-workspace.ts` (`OfflineWorkspaceV1Schema`, ...) only for the v1 migration,
 * together with the shared wire shapes. Category ids are local UUIDs everywhere; server
 * ids live only in {@link AccountBindingSchema} and in frozen wire payloads.
 *
 * @module offline-workspace-v2
 */
import { z } from 'zod'

import { CategoryColorSchema } from './category'
import {
  CategoryFieldRevisionsSchema,
  type SyncStatus,
  CategoryOperationSchema,
  CategoryWireOperationSchema,
  SyncDetailActionSchema,
} from './category-sync'
import {
  CompletionSyncOperationSchema,
  DraftRowSchema,
  DraftSchema,
  OfflinePreferencesSchema,
  SyncFailureSchema,
  type OfflineDraft,
  type OfflinePreferences,
  type OfflineTodayCount,
} from './offline-workspace'
import { UserSettingsPatchSchema } from './settings'

const identity = z.uuid()
const revision = z.number().int().nonnegative()
const timestamp = z.number().int().min(0).max(253402300799999)
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/)

/** The only owner id a v2 workspace accepts (D1). */
export const DEVICE_OWNER_ID = 'device'

/** File names (without `.json`) of the v2 files, written through `AtomicWorkspaceFile` `fileName` (E1). */
export const DEVICE_WORKSPACE_FILE_NAME = 'device'
export const DEVICE_REGISTRY_FILE_NAME = 'device-registry'
/** The settled-history file next to the device workspace (`device-archive.json`, #216 perf gate). */
export const DEVICE_ARCHIVE_FILE_NAME = 'device-archive'

/** A category with a local UUID. `historical` ones only keep old references alive (EA9). */
export const LocalCategorySchema = z.object({
  id: identity,
  name: z.string().min(1).max(30),
  color: CategoryColorSchema,
  isDefault: z.boolean(),
  parentId: identity.nullable(),
  removed: z.boolean().default(false),
  historical: z.boolean().default(false),
  fieldRevisions: CategoryFieldRevisionsSchema.default({
    name: 0,
    color: 0,
    parentLocalId: 0,
  }),
})
export type LocalCategory = z.infer<typeof LocalCategorySchema>

/** Server projection of a completion with the category as a local id. */
export const LocalCompletionProjectionSchema = z.object({
  completionId: identity,
  revision,
  cancelled: z.boolean(),
  categoryId: identity,
  title: z.string(),
  completedAt: timestamp,
})
export type LocalCompletionProjection = z.infer<
  typeof LocalCompletionProjectionSchema
>

/** Receipt for a completion operation, stored with local category ids. */
export const LocalCompletionReceiptSchema = z
  .object({
    operationId: identity,
    completionId: identity,
    revision,
    status: z.enum(['applied', 'rejected']),
    projection: LocalCompletionProjectionSchema.nullable(),
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
  })

/** Completion operation as the editor queues it: local category id. */
export const LocalCompletionOperationSchema =
  CompletionSyncOperationSchema.omit({
    categoryId: true,
  }).extend({ categoryId: identity })

export const OfflineCompletionSchema = z.object({
  id: identity,
  categoryId: identity,
  originalCategoryId: identity,
  title: z.string().min(1).max(255),
  rawText: z.string(),
  lineId: identity,
  lineIndex: z.number().int().nonnegative(),
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
  remote: LocalCompletionProjectionSchema.nullable(),
})
export type OfflineCompletion = z.infer<typeof OfflineCompletionSchema>

/** Retirement keeps the writing (C28). Entries migrated from v1 carry none (v1 never kept it). */
export const RetiredCompletionSchema = z.object({
  completedAt: timestamp,
  originalCompletedAt: timestamp,
  originalCategoryId: identity,
  timezone: z.string(),
  cancelled: z.boolean(),
  revision,
  remoteRevision: revision,
  title: z.string().min(1).max(255).optional(),
  rawText: z.string().optional(),
})
export type RetiredCompletion = z.infer<typeof RetiredCompletionSchema>

export const OutboxEntrySchema = z.object({
  operation: LocalCompletionOperationSchema,
  /** Frozen server-id payload, written when the entry is first marked in flight (EA3). */
  wire: CompletionSyncOperationSchema.optional(),
  state: z.enum(['queued', 'sent', 'blocked']),
  failure: SyncFailureSchema.optional(),
  receipt: LocalCompletionReceiptSchema.optional(),
})
export type OutboxEntry = z.infer<typeof OutboxEntrySchema>

export const CategoryOutboxEntrySchema = z.object({
  operation: CategoryOperationSchema,
  wire: CategoryWireOperationSchema.optional(),
  state: z.enum(['queued', 'sent', 'blocked', 'parked']),
  /** Unanswered `category.syncReceipts` lookups; 3 shows "Waiting for the dashboard to confirm" (EA4). */
  receiptQueries: z.number().int().nonnegative().default(0),
  /** Local revision of each touched field at freeze time (EA5). */
  frozenRevisions: z
    .array(
      z.object({
        localId: identity,
        field: z.enum(['name', 'color', 'parentLocalId', 'delete']),
        revision,
      }),
    )
    .default([]),
})
export type CategoryOutboxEntry = z.infer<typeof CategoryOutboxEntrySchema>

/** Why a field is declined (C18 + EA8 kinds). */
export const DECLINED_KINDS = [
  'name-taken',
  'conflict',
  'invalid-parent',
  'forbidden',
  'digest-mismatch',
  'delete-blocked',
  'parked',
] as const

/** One resolved or informational Sync details entry (DA7 History, latest 50). */
export const SyncHistoryItemSchema = z.object({
  id: identity,
  at: timestamp,
  /** Stable kind: a refusal that already reverted, a resolved row, or a mirror note. */
  kind: z.enum([
    'resolved',
    'reverted',
    'server-delete-unknown-destination',
    'server-delete-cycle',
    'applied-elsewhere',
  ]),
  categoryPath: z.string(),
  field: z.string(),
  macValue: z.string().nullable(),
  dashboardValue: z.string().nullable(),
  reason: z.string().optional(),
})
export type SyncHistoryItem = z.infer<typeof SyncHistoryItemSchema>

/** Longest History the workspace keeps (DA7). */
export const SYNC_HISTORY_LIMIT = 50

export const DeclinedFieldSchema = z.object({
  kind: z.enum(DECLINED_KINDS),
  localValue: z.string().nullable(),
  serverValue: z.string().nullable(),
})

/** The single account this Mac syncs with (D1, C10). */
export const AccountBindingSchema = z.object({
  accountId: z.string().min(1),
  /** From the verified identity (EA2); null when migrated from v1, which never stored it. */
  displayEmail: z.string().nullable(),
  serverCategoryIds: z.record(identity, z.number().int().positive()),
  /** Last server state seen: the three-way merge base (D4). */
  base: z.record(
    identity,
    z.object({
      name: z.string(),
      color: CategoryColorSchema,
      parentLocalId: identity.nullable(),
    }),
  ),
  /** localId -> field ('delete' included) -> declined marker (C18). */
  declined: z.record(identity, z.record(z.string(), DeclinedFieldSchema)),
  /** Server deletions already mirrored: local source id -> local destination id. */
  deletionReceipts: z.record(identity, identity),
  lastSyncedAt: timestamp.nullable(),
})
export type AccountBinding = z.infer<typeof AccountBindingSchema>

export const RecoveryCopySchema = z.object({
  id: identity,
  categoryId: identity,
  text: z.string(),
  reason: z.string(),
  createdAt: timestamp,
  restoredTo: identity.optional(),
  /** Where the text came from, for the "From an older CoreLive version" style labels (C7, DX8). */
  origin: z
    .object({
      kind: z.enum(['other-account', 'older-version', 'legacy-note']),
      accountId: z.string().nullable(),
    })
    .optional(),
})
export type RecoveryCopy = z.infer<typeof RecoveryCopySchema>

/** D7.4 + DX8: what the migration did, keyed by v1 file checksum so each change imports once. */
export const MigrationReceiptSchema = z.object({
  version: z.literal(2),
  /** Checksum of the converted source file, or null when the workspace was created fresh. */
  sourceChecksum: sha256Hex.nullable(),
  receipts: z.record(
    sha256Hex,
    z.object({
      fileName: z.string(),
      accountId: z.string().nullable(),
      outcome: z.enum([
        'source-converted',
        'recovery-imported',
        'backup-preserved',
        'older-version-imported',
      ]),
      at: timestamp,
    }),
  ),
  /** Last checksum seen per v1 file name (DX8). */
  v1Files: z.record(z.string(), sha256Hex),
  /** Completions an older build retired without text: "Kept on the dashboard only" (EA13a). */
  dashboardOnly: z.record(
    identity,
    z.object({
      completedAt: timestamp,
      originalCategoryId: identity,
      cancelled: z.boolean(),
    }),
  ),
  /** The C34 counts; null before the first migration summary. */
  summary: z
    .object({
      sourceAccountId: z.string().nullable(),
      importedDrafts: z.number().int().nonnegative(),
      importedCompletions: z.number().int().nonnegative(),
      recoveryCopies: z.number().int().nonnegative(),
      v1FilesKept: z.number().int().nonnegative(),
      preservedBackups: z.number().int().nonnegative(),
    })
    .nullable(),
})
export type MigrationReceipt = z.infer<typeof MigrationReceiptSchema>

/** A durable answer to a replayed command id. */
export const CommandReceiptSchema = z.object({
  digest: z.string(),
  completionId: identity.optional(),
  revision,
})

/** Version 2 of the workspace: one per device, `ownerId: "device"` (D1, C29). */
export const OfflineWorkspaceSchema = z.object({
  version: z.literal(2),
  ownerId: z.literal(DEVICE_OWNER_ID),
  deviceId: identity,
  revision,
  createdAt: timestamp,
  selectedCategoryId: identity,
  categories: z.array(LocalCategorySchema),
  preferences: OfflinePreferencesSchema,
  drafts: z.record(identity, DraftSchema),
  completions: z.record(identity, OfflineCompletionSchema),
  retiredCompletions: z.record(identity, RetiredCompletionSchema).default({}),
  outbox: z.record(identity, OutboxEntrySchema),
  categoryOutbox: z.record(identity, CategoryOutboxEntrySchema).default({}),
  syncHistory: z.array(SyncHistoryItemSchema).default([]),
  commandReceipts: z.record(identity, CommandReceiptSchema),
  categoryMoves: z.record(identity, identity),
  binding: AccountBindingSchema.nullable(),
  migration: MigrationReceiptSchema,
  checkpoint: z
    .object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timezone: z.string(),
      total: z.number().int().nonnegative(),
      fetchedAt: timestamp,
      identities: z.record(
        identity,
        LocalCompletionProjectionSchema.nullable(),
      ),
    })
    .nullable(),
  recoveryCopies: z.array(RecoveryCopySchema),
})
export type OfflineWorkspace = z.infer<typeof OfflineWorkspaceSchema>

/** The records that grow with use; {@link validateWorkspaceChange} validates them per entry. */
const BULK_RECORD_SCHEMAS = {
  completions: OfflineCompletionSchema,
  retiredCompletions: RetiredCompletionSchema,
  outbox: OutboxEntrySchema,
  categoryOutbox: CategoryOutboxEntrySchema,
  commandReceipts: CommandReceiptSchema,
} as const
const BULK_RECORD_KEYS = Object.keys(BULK_RECORD_SCHEMAS) as Array<
  keyof typeof BULK_RECORD_SCHEMAS
>
const WorkspaceWithoutBulkRecordsSchema = OfflineWorkspaceSchema.omit({
  completions: true,
  retiredCompletions: true,
  outbox: true,
  categoryOutbox: true,
  commandReceipts: true,
})

/**
 * Validates a candidate workspace against the schema, re-checking only what changed.
 *
 * Entries of the growing records that are the very same object as in the previously
 * validated workspace are valid by construction and are reused, so a commit that changes
 * one completion validates one completion instead of the whole history (#216 perf gate).
 * Everything else, including every other field, goes through the full schema, and a
 * candidate that shares nothing with `previous` costs exactly one full parse.
 *
 * @param candidate - The reducer's output; may share unchanged entry objects with `previous`.
 * @param previous - The last fully validated workspace.
 * @returns The validated workspace (shared entries are the same references as in `previous`).
 * @throws {z.ZodError} When any field or changed entry is invalid.
 * @example const next = validateWorkspaceChange({ ...state, revision: state.revision + 1 }, state)
 */
export function validateWorkspaceChange(
  candidate: unknown,
  previous: OfflineWorkspace,
): OfflineWorkspace {
  const rest = WorkspaceWithoutBulkRecordsSchema.parse(candidate)
  const source = candidate as Record<string, unknown>
  const bulk: Record<string, Record<string, unknown>> = {}
  for (const key of BULK_RECORD_KEYS) {
    const container = source[key] ?? {}
    // A malformed container (not a plain object) fails the full record schema.
    if (typeof container !== 'object' || container === null)
      OfflineWorkspaceSchema.shape[key].parse(container)
    const before: Record<string, unknown> = previous[key]
    const after: Record<string, unknown> = {}
    for (const [id, entry] of Object.entries(container)) {
      after[id] =
        before[id] === entry
          ? entry
          : (identity.parse(id), BULK_RECORD_SCHEMAS[key].parse(entry))
    }
    bulk[key] = after
  }
  return { ...rest, ...bulk } as OfflineWorkspace
}

/**
 * Settled history moved out of the keep path (#216 perf gate): completions and retired
 * records old enough that no Undo, clear, outbox or conflict flow can touch them.
 * Same envelope and durability as the workspace; nothing here is ever deleted.
 */
export const WorkspaceArchiveSchema = z.object({
  version: z.literal(1),
  ownerId: z.literal(DEVICE_OWNER_ID),
  completions: z.record(identity, OfflineCompletionSchema),
  retiredCompletions: z.record(identity, RetiredCompletionSchema),
})
export type WorkspaceArchive = z.infer<typeof WorkspaceArchiveSchema>

/** Registry v2 = sync attachment (D2) with the sign-out journal (EA1) and pending Connect (EA2b). */
export const DeviceRegistrySchema = z.object({
  version: z.literal(2),
  deviceId: identity,
  attachedAccountId: z.string().nullable(),
  signOutPending: z.boolean(),
  pendingConnect: z
    .object({ accountId: z.string().min(1), displayEmail: z.string() })
    .nullable(),
})
export type DeviceRegistry = z.infer<typeof DeviceRegistrySchema>

/** A draft read for one local category. */
export interface OfflineDraftRecord {
  categoryId: string
  draft: OfflineDraft
}

const commandIdentity = z.object({ commandId: identity })
export const WorkspaceCommandSchema = z.discriminatedUnion('type', [
  commandIdentity.extend({
    type: z.literal('save'),
    categoryId: identity,
    baseRevision: revision,
    rows: z.array(DraftRowSchema),
  }),
  commandIdentity.extend({
    type: z.literal('complete'),
    categoryId: identity,
    baseRevision: revision,
    rowId: identity,
    completionId: identity,
    completedAt: timestamp,
    timezone: z.string().min(1).max(100),
  }),
  commandIdentity.extend({ type: z.literal('undo'), completionId: identity }),
  commandIdentity.extend({ type: z.literal('clear'), completionId: identity }),
  commandIdentity.extend({ type: z.literal('select'), categoryId: identity }),
  commandIdentity.extend({
    type: z.literal('moveCategory'),
    sourceId: identity,
    destinationId: identity,
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
    destinationId: identity,
  }),
  commandIdentity.extend({
    type: z.literal('categoryCreate'),
    /** Chosen by the caller so the editor can select the new category without a lookup. */
    categoryId: identity,
    name: z.string().max(255),
    color: CategoryColorSchema,
    parentId: identity.nullable(),
  }),
  commandIdentity.extend({
    type: z.literal('categoryRename'),
    categoryId: identity,
    name: z.string().max(255),
  }),
  commandIdentity.extend({
    type: z.literal('categoryRecolor'),
    categoryId: identity,
    color: CategoryColorSchema,
  }),
  commandIdentity.extend({
    type: z.literal('categoryReparent'),
    categoryId: identity,
    parentId: identity.nullable(),
  }),
  commandIdentity.extend({
    type: z.literal('categoryDelete'),
    categoryId: identity,
    destinationId: identity,
  }),
  commandIdentity.extend({
    type: z.literal('syncDetailAction'),
    /** Row id from {@link SyncDetailRow}: `<localId>:<field>`. */
    rowId: z.string().min(1).max(100),
    action: SyncDetailActionSchema,
    /** Required by `choose-another-name`. */
    name: z.string().max(255).optional(),
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
  selectedCategoryId: string
  categories: LocalCategory[]
  preferences: OfflinePreferences
  draft: OfflineDraft
  pendingCount: number
  blockedCount: number
  recentUndo: OfflineCompletion[]
  eligibleUndoCount: number
  checkpoint: OfflineWorkspace['checkpoint']
  today: OfflineTodayCount
  nextClearAt: number | null
  nextUndoAt: number | null
  /** Local source id -> local destination id of every removed category (D4). */
  categoryMoves: Record<string, string>
  recoveryCopyCount: number
  /** "Needs a look" rows on the Sync details page (DA3 link). */
  needsALookCount: number
  /** The bound account's display facts; null on a Mac that never attached (DA2, X1). */
  binding: {
    accountId: string
    displayEmail: string | null
    lastSyncedAt: number | null
  } | null
}

/**
 * Editor sync health (D2/X1). `local-only` covers both a Mac that never attached and one
 * that signed out; the editor then shows only the save line (DA2).
 */
export type OfflineSyncStatus = SyncStatus

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
      phase: 'opening' | 'recovery'
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
  | {
      ok: false
      reason: string
      /** Extra DA8 copy input, e.g. the child name of an EA8 promotion clash. */
      detail?: string
    }
