import { createHash } from 'node:crypto'

import {
  SyncApplyInputSchema,
  SyncBootstrapOutputSchema,
  SyncCheckpointInputSchema,
  SyncReceiptsInputSchema,
  SyncReceiptsOutputSchema,
} from '@corelive/desktop-contract/offline-sync'
import {
  CompletionSyncReceiptSchema,
  CountCheckpointSchema,
  EditorCategorySchema,
  type CompletionProjection,
  type CompletionSyncOperation,
  type CompletionSyncReceipt,
} from '@corelive/desktop-contract/offline-workspace'
import { call, ORPCError } from '@orpc/server'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import {
  categoryDeletionTable,
  completedTable,
  completionSyncReceiptTable,
  completionSyncStateTable,
} from '@/db/schema'
import { runTransaction } from '@/db/transaction'
import { authMiddleware } from '@/server/middleware/auth'

import {
  findOwnedCategory,
  listCategories,
  lockCategoryOwner,
} from './category'

type Transaction = Parameters<Parameters<typeof runTransaction>[0]>[0]
type SyncState = typeof completionSyncStateTable.$inferSelect
const FUTURE_TOLERANCE_MS = 300_000

/** Converts persisted UTC instants into the serializable projection used by all hosts.
 * @example projection(state)
 */
function projection(state: SyncState): CompletionProjection {
  return {
    completionId: state.completionId,
    revision: state.revision,
    cancelled: state.cancelled,
    categoryId: state.categoryId,
    title: state.title,
    completedAt: state.completedAt.getTime(),
  }
}

/** Builds a typed rejection without losing the observed server version needed for repair.
 * @example rejected(operation, 'conflict', current)
 */
function rejected(
  operation: CompletionSyncOperation,
  reason: NonNullable<CompletionSyncReceipt['reason']>,
  current: SyncState | undefined,
): CompletionSyncReceipt {
  return {
    operationId: operation.operationId,
    completionId: operation.completionId,
    revision: operation.revision,
    status: 'rejected',
    reason,
    projection: current ? projection(current) : null,
  }
}

/**
 * Applies one sync identity under the existing account/category lock.
 * Visible data, tombstone and immutable receipt commit in the same transaction.
 * Cancellation remains terminal even when it arrives before create or long after Undo.
 *
 * ```text
 * operation -> owner lock -> existing receipt? -> same digest: replay
 *                                            -> changed digest: conflict
 * no receipt -> validate/mutate identity -> effect + state + receipt in one TX
 * absent/active --cancel--> cancelled --new mutation--> still cancelled
 * transaction failure -> rollback all effects; retry the same operation identity
 * ```
 *
 * @example await applySyncOperation(user.id, operation)
 */
async function applySyncOperation(
  userId: number,
  operation: CompletionSyncOperation,
): Promise<CompletionSyncReceipt> {
  return runTransaction(async (tx) => {
    await lockCategoryOwner(tx, userId)
    const digest = createHash('sha256')
      .update(JSON.stringify(operation))
      .digest('hex')
    const [receipt] = await tx
      .select()
      .from(completionSyncReceiptTable)
      .where(
        and(
          eq(completionSyncReceiptTable.userId, userId),
          eq(completionSyncReceiptTable.operationId, operation.operationId),
        ),
      )
      .limit(1)
    const [current] = await tx
      .select()
      .from(completionSyncStateTable)
      .where(
        and(
          eq(completionSyncStateTable.userId, userId),
          eq(completionSyncStateTable.completionId, operation.completionId),
        ),
      )
      .limit(1)
    if (receipt) {
      // Reusing an ID with other bytes is a conflict; the original evidence is immutable.
      return receipt.payloadDigest === digest
        ? CompletionSyncReceiptSchema.parse(receipt.outcome)
        : rejected(operation, 'conflict', current)
    }
    const outcome = await mutateSyncIdentity(tx, userId, operation, current)
    await tx.insert(completionSyncReceiptTable).values({
      userId,
      operationId: operation.operationId,
      payloadDigest: digest,
      outcome,
    })
    return outcome
  })
}

/** Validates ownership/revision before changing the visible completion or terminal tombstone.
 * @example await mutateSyncIdentity(tx, userId, operation, current)
 */
async function mutateSyncIdentity(
  tx: Transaction,
  userId: number,
  operation: CompletionSyncOperation,
  current: SyncState | undefined,
): Promise<CompletionSyncReceipt> {
  const applied = (state: SyncState): CompletionSyncReceipt => ({
    operationId: operation.operationId,
    completionId: operation.completionId,
    revision: operation.revision,
    status: 'applied',
    projection: projection(state),
  })
  if (current?.cancelled) return applied(current)
  if (operation.kind === 'cancel')
    return applied(await cancelSyncIdentity(tx, userId, operation, current))
  const rejection = rejectedRevision(operation, current)
  if (rejection) return rejected(operation, rejection, current)
  if (
    operation.completedAt > Date.now() + FUTURE_TOLERANCE_MS ||
    !Number.isFinite(new Date(operation.completedAt).getTime())
  )
    return rejected(operation, 'invalid-time', current)
  if (!(await findOwnedCategory(userId, operation.categoryId, tx)))
    return rejected(operation, 'category-removed', current)
  const completedId = await writeVisibleCompletion(
    tx,
    userId,
    operation,
    current,
  )
  if (completedId === null) return rejected(operation, 'conflict', current)
  const next = requireRow(
    await tx
      .insert(completionSyncStateTable)
      .values({
        userId,
        completionId: operation.completionId,
        revision: operation.revision,
        cancelled: false,
        completedId,
        categoryId: operation.categoryId,
        title: operation.title,
        completedAt: new Date(operation.completedAt),
        originalCompletedAt:
          current?.originalCompletedAt ??
          new Date(operation.originalCompletedAt),
        timezone: current?.timezone ?? operation.timezone,
        deviceId: current?.deviceId ?? operation.deviceId,
      })
      .onConflictDoUpdate({
        target: [
          completionSyncStateTable.userId,
          completionSyncStateTable.completionId,
        ],
        set: {
          revision: operation.revision,
          categoryId: operation.categoryId,
          title: operation.title,
          completedAt: new Date(operation.completedAt),
        },
      })
      .returning(),
    'sync.state',
  )
  return applied(next)
}

/** Classifies a stale or missing remote revision before any visible completion mutation.
 * @example const reason = rejectedRevision(operation, current)
 */
function rejectedRevision(
  operation: CompletionSyncOperation,
  current: SyncState | undefined,
): 'conflict' | 'dependency' | null {
  if (current && operation.revision <= current.revision) return 'conflict'
  if ((current?.revision ?? 0) !== operation.expectedRemoteRevision)
    return 'conflict'
  if (!current && operation.kind !== 'create') return 'dependency'
  if (current && operation.kind === 'create') return 'conflict'
  return null
}

/** Creates or updates the visible owned record without adopting another import's identity.
 * @example const id = await writeVisibleCompletion(tx, userId, operation, current)
 */
async function writeVisibleCompletion(
  tx: Transaction,
  userId: number,
  operation: CompletionSyncOperation,
  current: SyncState | undefined,
): Promise<number | null> {
  let completedId = current?.completedId
  if (!current) {
    // A browser import may already own this UUID; never adopt or delete that legacy row.
    const [existing] = await tx
      .select({ id: completedTable.id })
      .from(completedTable)
      .where(
        and(
          eq(completedTable.userId, userId),
          eq(completedTable.localCompletionId, operation.completionId),
        ),
      )
      .limit(1)
    if (existing) return null
    const created = requireRow(
      await tx
        .insert(completedTable)
        .values({
          userId,
          categoryId: operation.categoryId,
          title: operation.title,
          completedAt: new Date(operation.completedAt),
          localCompletionId: operation.completionId,
        })
        .returning({ id: completedTable.id }),
      'sync.create',
    )
    completedId = created.id
  } else {
    if (!completedId) return null
    const updated = await tx
      .update(completedTable)
      .set({
        categoryId: operation.categoryId,
        title: operation.title,
        completedAt: new Date(operation.completedAt),
      })
      .where(
        and(
          eq(completedTable.id, completedId),
          eq(completedTable.userId, userId),
        ),
      )
      .returning({ id: completedTable.id })
    if (!updated.length) return null
  }
  return completedId ?? null
}

/** Commits a permanent tombstone even when cancellation reaches the server before its create.
 * @example const state = await cancelSyncIdentity(tx, userId, operation, current)
 */
async function cancelSyncIdentity(
  tx: Transaction,
  userId: number,
  operation: CompletionSyncOperation,
  current: SyncState | undefined,
): Promise<SyncState> {
  // A tombstone can precede create; no category/time validation can strand an eligible Undo.
  if (current?.completedId)
    await tx
      .delete(completedTable)
      .where(
        and(
          eq(completedTable.id, current.completedId),
          eq(completedTable.userId, userId),
        ),
      )
  const cancelled = requireRow(
    await tx
      .insert(completionSyncStateTable)
      .values({
        userId,
        completionId: operation.completionId,
        revision: Math.max(operation.revision, (current?.revision ?? 0) + 1),
        cancelled: true,
        completedId: null,
        categoryId: current?.categoryId ?? operation.categoryId,
        title: current?.title ?? operation.title,
        completedAt: current?.completedAt ?? new Date(operation.completedAt),
        originalCompletedAt:
          current?.originalCompletedAt ??
          new Date(operation.originalCompletedAt),
        timezone: current?.timezone ?? operation.timezone,
        deviceId: current?.deviceId ?? operation.deviceId,
      })
      .onConflictDoUpdate({
        target: [
          completionSyncStateTable.userId,
          completionSyncStateTable.completionId,
        ],
        set: {
          cancelled: true,
          completedId: null,
          revision: Math.max(operation.revision, (current?.revision ?? 0) + 1),
        },
      })
      .returning(),
    'sync.cancel',
  )
  return cancelled
}

/** Applies a bounded batch independently so one invalid record cannot roll back other wins.
 * @example await call(syncApply, { operations }, { context })
 */
export const syncApply = authMiddleware
  .input(SyncApplyInputSchema)
  .output(SyncReceiptsOutputSchema)
  .handler(async ({ input, context }) => {
    const receipts: CompletionSyncReceipt[] = []
    // Sequential transactions bound pool pressure; a timeout has an unknown outcome and is retried by identity.
    for (const operation of input.operations)
      receipts.push(await applySyncOperation(context.user.id, operation))
    return { receipts }
  })

/** Resolves uncertain deliveries without mutating or rebinding their original payloads.
 * @example await call(syncReceipts, { operationIds }, { context })
 */
export const syncReceipts = authMiddleware
  .input(SyncReceiptsInputSchema)
  .output(SyncReceiptsOutputSchema)
  .handler(async ({ input, context }) => {
    const rows = await db
      .select({ outcome: completionSyncReceiptTable.outcome })
      .from(completionSyncReceiptTable)
      .where(
        and(
          eq(completionSyncReceiptTable.userId, context.user.id),
          inArray(completionSyncReceiptTable.operationId, input.operationIds),
        ),
      )
    return {
      receipts: rows.map((row) =>
        CompletionSyncReceiptSchema.parse(row.outcome),
      ),
    }
  })

/** Verifies canonical account identity and returns category/deletion data for local preparation.
 * Settings are deliberately absent: their hydrated remote Settings capability owns migration.
 * @example await call(syncBootstrap, undefined, { context })
 */
export const syncBootstrap = authMiddleware
  .output(SyncBootstrapOutputSchema)
  .handler(async ({ context }) => {
    const { categories } = await call(listCategories, undefined, { context })
    const deletions = await db
      .select({
        sourceId: categoryDeletionTable.sourceId,
        destinationId: categoryDeletionTable.destinationId,
      })
      .from(categoryDeletionTable)
      .where(eq(categoryDeletionTable.userId, context.user.id))
    return {
      accountId: context.user.clerkId,
      categories: categories.map((category) =>
        EditorCategorySchema.parse(category),
      ),
      deletions,
    }
  })

/**
 * Reads the day total and requested identities in one PostgreSQL statement/snapshot.
 * UTC timestamp-without-zone columns are explicitly interpreted as UTC before bucketing.
 * @example await call(syncCheckpoint, { day: '2026-10-21', timezone: 'Asia/Tokyo', completionIds }, { context })
 */
export const syncCheckpoint = authMiddleware
  .input(SyncCheckpointInputSchema)
  .output(CountCheckpointSchema)
  .handler(async ({ input, context }) => {
    let timezone: string
    try {
      timezone = new Intl.DateTimeFormat('en-US', {
        timeZone: input.timezone,
      }).resolvedOptions().timeZone
    } catch {
      throw new ORPCError('BAD_REQUEST', { message: 'Choose a valid timezone' })
    }
    const { rows } = await db.execute<{
      total: number
      identities: Record<string, CompletionProjection | null>
    }>(sql`
      WITH entries AS (
        SELECT COALESCE("completedAt", "createdAt") AS instant FROM "Completed"
        WHERE "userId" = ${context.user.id} AND archived = false
        UNION ALL
        SELECT COALESCE("completedAt", "updatedAt") AS instant FROM "Todo"
        WHERE "userId" = ${context.user.id} AND completed = true
      ), total AS (
        SELECT count(*)::int AS count FROM entries
        WHERE ((instant AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date = ${input.day}::date
      ), requested AS (SELECT jsonb_array_elements_text(${JSON.stringify(input.completionIds)}::jsonb) AS id)
      SELECT (SELECT count FROM total) AS total,
        COALESCE(jsonb_object_agg(r.id, CASE WHEN s."completionId" IS NULL THEN NULL ELSE
          jsonb_build_object('completionId', s."completionId", 'revision', s.revision,
            'cancelled', s.cancelled, 'categoryId', s."categoryId", 'title', s.title,
            'completedAt', (extract(epoch FROM s."completedAt") * 1000)::bigint)
          END) FILTER (WHERE r.id IS NOT NULL), '{}'::jsonb) AS identities
      FROM requested r LEFT JOIN "CompletionSyncState" s
        ON s."userId" = ${context.user.id} AND s."completionId" = r.id
    `)
    const row = requireRow(rows, 'sync.checkpoint')
    return {
      day: input.day,
      timezone,
      total: row.total,
      identities: row.identities,
      fetchedAt: Date.now(),
    }
  })
