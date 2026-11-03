import { z } from 'zod'

import { CategoryColorSchema } from './category'
import { CompletionSyncReceiptSchema } from './offline-workspace'

const identity = z.uuid()
const revision = z.number().int().nonnegative()
const timestamp = z.number().int().min(0).max(253402300799999)
const categoryName = z.string().trim().min(1).max(30)
const serverId = z.number().int().positive()
const nullableLocalId = identity.nullable()
const nullableServerId = serverId.nullable()

/** Category fields that carry their own local revision (EA3/EA5) and can be declined (C18). */
export const CATEGORY_FIELDS = ['name', 'color', 'parentLocalId'] as const
export const CategoryFieldSchema = z.enum(CATEGORY_FIELDS)
export type CategoryField = z.infer<typeof CategoryFieldSchema>

/** Per-field local revisions on a category; a receipt may change a field only if its revision is unchanged (EA5). */
export const CategoryFieldRevisionsSchema = z.object({
  name: revision.default(0),
  color: revision.default(0),
  parentLocalId: revision.default(0),
})
export type CategoryFieldRevisions = z.infer<
  typeof CategoryFieldRevisionsSchema
>

const operationIdentity = z.object({ operationId: identity, localId: identity })

/** Local category operation stored in the outbox (C11) plus the EA7 rename set. */
export const CategoryOperationSchema = z.discriminatedUnion('type', [
  operationIdentity.extend({
    type: z.literal('create'),
    name: categoryName,
    color: CategoryColorSchema,
    parentLocalId: nullableLocalId,
    isDefault: z.literal(false),
  }),
  operationIdentity.extend({
    type: z.literal('rename'),
    name: categoryName,
    expected: z.object({ name: categoryName }),
  }),
  operationIdentity.extend({
    type: z.literal('recolor'),
    color: CategoryColorSchema,
    expected: z.object({ color: CategoryColorSchema }),
  }),
  operationIdentity.extend({
    type: z.literal('reparent'),
    parentLocalId: nullableLocalId,
    expected: z.object({ parentLocalId: nullableLocalId }),
  }),
  operationIdentity.extend({
    type: z.literal('delete'),
    destinationLocalId: identity,
  }),
  z.object({
    operationId: identity,
    type: z.literal('renameSet'),
    items: z
      .array(
        z.object({
          localId: identity,
          name: categoryName,
          expected: z.object({ name: categoryName }),
        }),
      )
      .min(2)
      .max(16),
  }),
])
export type CategoryOperation = z.infer<typeof CategoryOperationSchema>

const wireIdentity = z.object({ operationId: identity })

/** Frozen server-id payload of one operation (C11 server shapes; EA3 stores these bytes). */
export const CategoryWireOperationSchema = z.discriminatedUnion('type', [
  wireIdentity.extend({
    type: z.literal('create'),
    name: categoryName,
    color: CategoryColorSchema,
    parentId: nullableServerId,
  }),
  wireIdentity.extend({
    type: z.literal('rename'),
    serverId,
    name: categoryName,
    expected: z.object({ name: categoryName }),
  }),
  wireIdentity.extend({
    type: z.literal('recolor'),
    serverId,
    color: CategoryColorSchema,
    expected: z.object({ color: CategoryColorSchema }),
  }),
  wireIdentity.extend({
    type: z.literal('reparent'),
    serverId,
    parentId: nullableServerId,
    expected: z.object({ parentId: nullableServerId }),
  }),
  wireIdentity.extend({
    type: z.literal('delete'),
    serverId,
    destinationId: serverId,
  }),
  wireIdentity.extend({
    type: z.literal('renameSet'),
    items: z
      .array(
        z.object({
          serverId,
          name: categoryName,
          expected: z.object({ name: categoryName }),
        }),
      )
      .min(2)
      .max(16),
  }),
])
export type CategoryWireOperation = z.infer<typeof CategoryWireOperationSchema>

/** `category.syncApply` input: 1-16 operations. */
export const CategorySyncApplyInputSchema = z.object({
  operations: z.array(CategoryWireOperationSchema).min(1).max(16),
})

/** The three fields a server `conflict`/`adopted` receipt can carry. */
const ContestedFieldSchema = z.union([
  z.object({ name: categoryName }),
  z.object({ color: CategoryColorSchema }),
  z.object({ parentId: nullableServerId }),
])

const categoryOutcomeIdentity = z.object({
  kind: z.literal('category'),
  operationId: identity,
})

/** Category variants of {@link SyncOutcomeSchema} (C11 + EA5 `adopted.current` + EA8 `delete-blocked`). */
export const CategorySyncOutcomeSchema = z.union([
  categoryOutcomeIdentity.extend({
    result: z.literal('applied'),
    serverId,
  }),
  categoryOutcomeIdentity.extend({
    result: z.literal('adopted'),
    serverId,
    current: z.object({
      name: categoryName,
      color: CategoryColorSchema,
      parentId: nullableServerId,
    }),
  }),
  categoryOutcomeIdentity.extend({
    result: z.enum([
      'name-taken',
      'invalid-parent',
      'forbidden',
      'digest-mismatch',
    ]),
  }),
  categoryOutcomeIdentity.extend({
    result: z.literal('conflict'),
    current: ContestedFieldSchema,
  }),
  categoryOutcomeIdentity.extend({
    result: z.literal('delete-blocked'),
    reason: z.literal('child-name-taken'),
    childName: z.string().min(1),
  }),
])

const CompletionSyncOutcomeSchema = z.intersection(
  CompletionSyncReceiptSchema,
  z.object({ kind: z.literal('completion') }),
)

/**
 * Parses a stored/received sync outcome. A row without `kind` is a completion receipt
 * forever (EA6): the Postgres table keeps its name and nothing is backfilled.
 *
 * @example
 * ```ts
 * SyncOutcomeSchema.parse(oldRow).kind // 'completion'
 * ```
 */
export const SyncOutcomeSchema = z.preprocess(
  (value) =>
    typeof value === 'object' && value !== null && !('kind' in value)
      ? { ...value, kind: 'completion' }
      : value,
  z.union([CompletionSyncOutcomeSchema, CategorySyncOutcomeSchema]),
)
export type SyncOutcome = z.infer<typeof SyncOutcomeSchema>

/** `category.syncApply` / `category.syncReceipts` output. */
export const CategorySyncApplyOutputSchema = z.object({
  receipts: z.array(SyncOutcomeSchema),
})

/** DX11: the one action vocabulary of the Sync details page. */
export const SYNC_DETAIL_ACTIONS = [
  'use-mac-value',
  'keep-dashboard-value',
  'choose-another-name',
  'try-again',
] as const
export const SyncDetailActionSchema = z.enum(SYNC_DETAIL_ACTIONS)
export type SyncDetailAction = z.infer<typeof SyncDetailActionSchema>

/** DX7: stable error codes of the paths #216 adds (plus EA2's identity mismatch). */
export const OFFLINE_ERROR_CODES = [
  'SIGNOUT_FLUSH_FAILED',
  'SIGNOUT_RESIDUAL_COOKIE',
  'SIGNOUT_REMOTE_REVOKE_SKIPPED',
  'WORKSPACE_MIGRATION_FAILED',
  'CATEGORY_SYNC_REJECTED',
  'SIGNIN_PAGE_UNREACHABLE',
  'AUTH_IDENTITY_MISMATCH',
] as const
export const OfflineErrorCodeSchema = z.enum(OFFLINE_ERROR_CODES)
export type OfflineErrorCode = z.infer<typeof OfflineErrorCodeSchema>

/** D2 sync health, separate from the editor phase. */
export const SYNC_HEALTH_STATES = [
  'local-only',
  'syncing',
  'waiting',
  'sign-in-to-sync',
  'synced',
] as const

/** D2/X1 sync status object. */
export const SyncStatusSchema = z.object({
  state: z.enum(SYNC_HEALTH_STATES),
  waitingCount: z.number().int().nonnegative(),
  lastSyncedAt: timestamp.nullable(),
  boundEmail: z.string().nullable(),
})
export type SyncStatus = z.infer<typeof SyncStatusSchema>

export type CategorySyncApplyInput = z.infer<
  typeof CategorySyncApplyInputSchema
>
export type CategorySyncApplyOutput = z.infer<
  typeof CategorySyncApplyOutputSchema
>

/** Row types of the "Needs a look" group (DA7). */
export const SYNC_DETAIL_ROW_TYPES = [
  'conflict',
  'name-taken',
  'invalid-parent',
  'forbidden',
  'digest-mismatch',
  'delete-blocked',
  'parked',
  'waiting-confirm',
] as const
export type SyncDetailRowType = (typeof SYNC_DETAIL_ROW_TYPES)[number]

/** One "Needs a look" row, ready to render (DA7). Colors are names, parents are full paths. */
export interface SyncDetailRow {
  /** `<localId>:<field>`; the key of every action. */
  id: string
  type: SyncDetailRowType
  categoryPath: string
  field: string
  macValue: string | null
  dashboardValue: string | null
  /** The child that blocked a delete (EA8). */
  childName?: string
  /** Actions this row offers, in display order. Empty for informational rows. */
  actions: SyncDetailAction[]
}
