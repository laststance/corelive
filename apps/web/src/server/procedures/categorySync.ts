/**
 * Receipted, idempotent category operations for the offline-first desktop editor (#216 D4).
 * @module server/procedures/categorySync
 * @example await orpcClient.category.syncApply({ operations })
 */
import { createHash } from 'node:crypto'

import {
  CategorySyncApplyInputSchema,
  CategorySyncApplyOutputSchema,
  SyncOutcomeSchema,
  type CategorySyncOutcomeSchema,
  type CategoryWireOperation,
  type SyncOutcome,
} from '@corelive/desktop-contract/category-sync'
import {
  normalizeCategoryName,
  validateCategoryAction,
  validateCategorySet,
} from '@corelive/desktop-contract/category-validator'
import { SyncReceiptsInputSchema } from '@corelive/desktop-contract/offline-sync'
import { and, eq, inArray } from 'drizzle-orm'
import type { z } from 'zod'

import { db } from '@/db'
import {
  categoryDeletionTable,
  categoryTable,
  syncReceiptTable,
} from '@/db/schema'
import { runTransaction } from '@/db/transaction'
import { authMiddleware } from '@/server/middleware/auth'

import { lockCategoryOwner, removeCategoryInTransaction } from './category'

type Transaction = Parameters<Parameters<typeof runTransaction>[0]>[0]
type CategoryOutcome = z.infer<typeof CategorySyncOutcomeSchema>
type CategoryRow = typeof categoryTable.$inferSelect

/**
 * Builds a category outcome for one operation.
 *
 * @param operationId - The operation the outcome answers.
 * @param rest - The `result` and its fields.
 * @returns The tagged outcome stored in the receipt row.
 * @example outcome(op.operationId, { result: 'applied', serverId: 3 })
 */
function outcome<R extends Omit<CategoryOutcome, 'kind' | 'operationId'>>(
  operationId: string,
  rest: R,
): CategoryOutcome {
  return { kind: 'category', operationId, ...rest } as CategoryOutcome
}

/**
 * Digest of the exact wire operation; a retry that re-sends identical bytes matches (EA3).
 *
 * @param operation - Zod-parsed wire operation (key order follows the schema, so it is stable).
 * @returns Hex SHA-256 stored in the receipt row.
 * @example digestOf(operation)
 */
function digestOf(operation: CategoryWireOperation): string {
  return createHash('sha256').update(JSON.stringify(operation)).digest('hex')
}

/**
 * Applies one category operation in its own transaction under the owner lock.
 *
 * ```text
 * op -> owner lock -> receipt for (userId, operationId)?
 *        same digest -> replay stored outcome (no write)
 *        other digest -> digest-mismatch (not stored; original evidence stays)
 *      no receipt -> CAS / validate / mutate + insert receipt in ONE transaction
 * ```
 *
 * @param userId - Owner account.
 * @param operation - Frozen wire operation.
 * @returns The committed (or replayed) outcome.
 * @example await applyCategoryOperation(user.id, operation)
 */
async function applyCategoryOperation(
  userId: number,
  operation: CategoryWireOperation,
): Promise<SyncOutcome> {
  return runTransaction(async (tx) => {
    await lockCategoryOwner(tx, userId)
    const digest = digestOf(operation)
    const [receipt] = await tx
      .select()
      .from(syncReceiptTable)
      .where(
        and(
          eq(syncReceiptTable.userId, userId),
          eq(syncReceiptTable.operationId, operation.operationId),
        ),
      )
      .limit(1)
    if (receipt) {
      const stored = SyncOutcomeSchema.parse(receipt.outcome)
      return receipt.payloadDigest === digest && stored.kind === 'category'
        ? stored
        : outcome(operation.operationId, { result: 'digest-mismatch' })
    }
    const result = await mutateCategories(tx, userId, operation)
    await tx.insert(syncReceiptTable).values({
      userId,
      operationId: operation.operationId,
      payloadDigest: digest,
      outcome: result,
    })
    return result
  })
}

/**
 * Judges and writes one operation; every non-applied verdict is still receipted by the caller.
 *
 * @param tx - Transaction that owns the account lock.
 * @param userId - Owner account.
 * @param operation - Frozen wire operation.
 * @returns The outcome to store.
 * @example await mutateCategories(tx, user.id, operation)
 */
async function mutateCategories(
  tx: Transaction,
  userId: number,
  operation: CategoryWireOperation,
): Promise<CategoryOutcome> {
  const rows = await tx
    .select()
    .from(categoryTable)
    .where(eq(categoryTable.userId, userId))
  const byId = new Map(rows.map((row) => [row.id, row]))
  const id = operation.operationId
  // A foreign or vanished category is indistinguishable from a forbidden one.
  const forbidden = outcome(id, { result: 'forbidden' })

  switch (operation.type) {
    case 'create': {
      if (operation.parentId !== null) {
        const parent = byId.get(operation.parentId)
        if (!parent || parent.parentId !== null)
          return outcome(id, { result: 'invalid-parent' })
      }
      const name = normalizeCategoryName(operation.name)
      // Adopt a same-path category instead of failing the unique index (D4 create).
      const twin = rows.find(
        (row) =>
          row.parentId === operation.parentId &&
          normalizeCategoryName(row.name) === name,
      )
      if (twin)
        return outcome(id, {
          result: 'adopted',
          serverId: twin.id,
          current: {
            name: twin.name,
            color: twin.color as CategoryOutcomeColor,
            parentId: twin.parentId,
          },
        })
      const verdict = validateCategoryAction(rows, {
        type: 'create',
        name,
        parentId: operation.parentId,
      })
      if (!verdict.ok) return outcome(id, { result: 'forbidden' })
      const [created] = await tx
        .insert(categoryTable)
        .values({
          name,
          color: operation.color,
          parentId: operation.parentId,
          userId,
        })
        .returning({ id: categoryTable.id })
      if (!created) throw new Error('category.syncApply create returned no row')
      return outcome(id, { result: 'applied', serverId: created.id })
    }
    case 'rename': {
      const target = byId.get(operation.serverId)
      if (!target || target.isDefault) return forbidden
      if (
        normalizeCategoryName(target.name) !==
        normalizeCategoryName(operation.expected.name)
      )
        return outcome(id, {
          result: 'conflict',
          current: { name: target.name },
        })
      const name = normalizeCategoryName(operation.name)
      if (name !== target.name) {
        const verdict = validateCategoryAction(rows, {
          type: 'rename',
          id: target.id,
          name,
        })
        if (!verdict.ok) return outcome(id, { result: 'name-taken' })
        await tx
          .update(categoryTable)
          .set({ name })
          .where(
            and(
              eq(categoryTable.id, target.id),
              eq(categoryTable.userId, userId),
            ),
          )
      }
      return outcome(id, { result: 'applied', serverId: target.id })
    }
    case 'recolor': {
      const target = byId.get(operation.serverId)
      if (!target) return forbidden
      // CAS on the exact value: an ABA (changed and changed back) still applies.
      if (target.color !== operation.expected.color)
        return outcome(id, {
          result: 'conflict',
          current: { color: target.color as CategoryOutcomeColor },
        })
      if (target.color !== operation.color)
        await tx
          .update(categoryTable)
          .set({ color: operation.color })
          .where(
            and(
              eq(categoryTable.id, target.id),
              eq(categoryTable.userId, userId),
            ),
          )
      return outcome(id, { result: 'applied', serverId: target.id })
    }
    case 'reparent': {
      const target = byId.get(operation.serverId)
      if (!target || target.isDefault) return forbidden
      if (target.parentId !== operation.expected.parentId)
        return outcome(id, {
          result: 'conflict',
          current: { parentId: target.parentId },
        })
      if (target.parentId !== operation.parentId) {
        const verdict = validateCategoryAction(rows, {
          type: 'reparent',
          id: target.id,
          parentId: operation.parentId,
        })
        if (!verdict.ok)
          return outcome(id, {
            result:
              verdict.reason === 'name-taken-local'
                ? 'name-taken'
                : 'invalid-parent',
          })
        await tx
          .update(categoryTable)
          .set({ parentId: operation.parentId })
          .where(
            and(
              eq(categoryTable.id, target.id),
              eq(categoryTable.userId, userId),
            ),
          )
      }
      return outcome(id, { result: 'applied', serverId: target.id })
    }
    case 'delete':
      return mutateDelete(tx, userId, operation, rows, byId)
    case 'renameSet':
      return mutateRenameSet(tx, userId, operation, rows, byId)
  }
}

/** Server color strings may sit outside the API palette (schema comment); receipts carry them cast. */
type CategoryOutcomeColor = Extract<
  CategoryOutcome,
  { result: 'adopted' }
>['current']['color']

/**
 * Applies a `delete` through the shared rescue path, or reports why it cannot.
 *
 * @param tx - Transaction that owns the account lock.
 * @param userId - Owner account.
 * @param operation - The delete operation.
 * @param rows - The owner's categories read under the lock.
 * @param byId - `rows` indexed by id.
 * @returns `applied`, `delete-blocked` (EA8), `invalid-parent` for a bad destination or `forbidden`.
 * @example await mutateDelete(tx, user.id, operation, rows, byId)
 */
async function mutateDelete(
  tx: Transaction,
  userId: number,
  operation: Extract<CategoryWireOperation, { type: 'delete' }>,
  rows: CategoryRow[],
  byId: Map<number, CategoryRow>,
): Promise<CategoryOutcome> {
  const id = operation.operationId
  const target = byId.get(operation.serverId)
  if (!target) {
    // Already removed by an earlier delete (web or another Mac): the intent is satisfied.
    const [deletion] = await tx
      .select({ id: categoryDeletionTable.id })
      .from(categoryDeletionTable)
      .where(
        and(
          eq(categoryDeletionTable.userId, userId),
          eq(categoryDeletionTable.sourceId, operation.serverId),
        ),
      )
      .limit(1)
    return deletion
      ? outcome(id, { result: 'applied', serverId: operation.serverId })
      : outcome(id, { result: 'forbidden' })
  }
  if (target.isDefault) return outcome(id, { result: 'forbidden' })
  const verdict = validateCategoryAction(rows, {
    type: 'delete',
    id: target.id,
    destinationId: operation.destinationId,
  })
  if (!verdict.ok) {
    if (verdict.reason === 'name-taken-local' && verdict.childName)
      return outcome(id, {
        result: 'delete-blocked',
        reason: 'child-name-taken',
        childName: verdict.childName,
      })
    return outcome(id, { result: 'invalid-parent' })
  }
  await removeCategoryInTransaction(
    tx,
    userId,
    target.id,
    operation.destinationId,
  )
  return outcome(id, { result: 'applied', serverId: target.id })
}

/**
 * Applies an EA7 `renameSet` all-or-nothing: checks every `expected`, validates the final
 * set, then renames through reserved temporary names so a swap never trips the unique index.
 *
 * @param tx - Transaction that owns the account lock.
 * @param userId - Owner account.
 * @param operation - The rename set.
 * @param rows - The owner's categories read under the lock.
 * @param byId - `rows` indexed by id.
 * @returns `applied` for the first item, or `conflict`/`name-taken`/`forbidden` for the whole set.
 * @example await mutateRenameSet(tx, user.id, operation, rows, byId)
 */
async function mutateRenameSet(
  tx: Transaction,
  userId: number,
  operation: Extract<CategoryWireOperation, { type: 'renameSet' }>,
  rows: CategoryRow[],
  byId: Map<number, CategoryRow>,
): Promise<CategoryOutcome> {
  const id = operation.operationId
  const ids = operation.items.map((item) => item.serverId)
  if (new Set(ids).size !== ids.length)
    return outcome(id, { result: 'forbidden' })
  for (const item of operation.items) {
    const target = byId.get(item.serverId)
    if (!target || target.isDefault) return outcome(id, { result: 'forbidden' })
    if (
      normalizeCategoryName(target.name) !==
      normalizeCategoryName(item.expected.name)
    )
      return outcome(id, { result: 'conflict', current: { name: target.name } })
  }
  const finals = new Map(
    operation.items.map((item) => [
      item.serverId,
      normalizeCategoryName(item.name),
    ]),
  )
  const merged = rows.map((row) => ({
    id: row.id,
    name: finals.get(row.id) ?? row.name,
    isDefault: row.isDefault,
    parentId: row.parentId,
  }))
  if (validateCategorySet(merged).length > 0)
    return outcome(id, { result: 'name-taken' })
  // Phase 1: park every item on a unique reserved name; phase 2: write the finals.
  for (const item of operation.items)
    await tx
      .update(categoryTable)
      .set({ name: `__corelive_internal_renaming_category_${item.serverId}__` })
      .where(
        and(
          eq(categoryTable.id, item.serverId),
          eq(categoryTable.userId, userId),
        ),
      )
  for (const item of operation.items)
    await tx
      .update(categoryTable)
      .set({ name: finals.get(item.serverId) ?? '' })
      .where(
        and(
          eq(categoryTable.id, item.serverId),
          eq(categoryTable.userId, userId),
        ),
      )
  return outcome(id, {
    result: 'applied',
    serverId: operation.items[0]!.serverId,
  })
}

/**
 * Applies a bounded batch in order, one transaction per operation (EA3).
 *
 * Only committed operations return receipts. If a later operation throws (5xx), earlier
 * receipts stay committed and are recovered through {@link syncCategoryReceipts}; a missing
 * receipt means "uncertain, retry later". Called by the desktop SyncLoop.
 *
 * @example await call(syncCategoryApply, { operations }, { context })
 */
export const syncCategoryApply = authMiddleware
  .input(CategorySyncApplyInputSchema)
  .output(CategorySyncApplyOutputSchema)
  .handler(async ({ input, context }) => {
    const receipts: SyncOutcome[] = []
    for (const operation of input.operations)
      receipts.push(await applyCategoryOperation(context.user.id, operation))
    return { receipts }
  })

/**
 * Resolves uncertain category deliveries from stored receipts without mutating anything (EA4).
 *
 * @example await call(syncCategoryReceipts, { operationIds }, { context })
 */
export const syncCategoryReceipts = authMiddleware
  .input(SyncReceiptsInputSchema)
  .output(CategorySyncApplyOutputSchema)
  .handler(async ({ input, context }) => {
    const rows = await db
      .select({ outcome: syncReceiptTable.outcome })
      .from(syncReceiptTable)
      .where(
        and(
          eq(syncReceiptTable.userId, context.user.id),
          inArray(syncReceiptTable.operationId, input.operationIds),
        ),
      )
    return {
      receipts: rows.flatMap((row) => {
        const stored = SyncOutcomeSchema.parse(row.outcome)
        return stored.kind === 'category' ? [stored] : []
      }),
    }
  })
