/**
 * Receipted, idempotent category operations for the offline-first desktop editor (#216 D4).
 * @module server/procedures/categorySync
 * @example await orpcClient.category.syncApply({ operations })
 */

import {
  CategorySyncApplyInputSchema,
  CategorySyncApplyOutputSchema,
  SyncOutcomeSchema,
  type CategorySyncOutcomeSchema,
  type CategoryWireOperation,
  type SyncOutcome,
} from '@corelive/desktop-contract/category-sync'
import {
  type CategoryAction,
  type CategoryRefusal,
  deleteRefusalBody,
  normalizeCategoryName,
  reparentRefusalResult,
  validateCategoryAction,
  validateCategorySet,
} from '@corelive/desktop-contract/category-validator'
import { SyncReceiptsInputSchema } from '@corelive/desktop-contract/offline-sync'
import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'

import {
  categoryDeletionTable,
  categoryTable,
  syncReceiptTable,
} from '@/db/schema'
import { runTransaction } from '@/db/transaction'
import { authMiddleware } from '@/server/middleware/auth'

import { lockCategoryOwner, removeCategoryInTransaction } from './category'
import {
  digestOperation,
  findStoredReceipt,
  readStoredReceipts,
} from './syncReceiptStore'

type Transaction = Parameters<Parameters<typeof runTransaction>[0]>[0]
type CategoryOutcome = z.infer<typeof CategorySyncOutcomeSchema>
type CategoryRow = typeof categoryTable.$inferSelect

/** What a single-category mutation needs: the locked transaction and the owner's rows. */
interface MutationScope {
  tx: Transaction
  userId: number
  rows: CategoryRow[]
  byId: Map<number, CategoryRow>
}

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
    const digest = digestOperation(operation)
    const receipt = await findStoredReceipt(tx, userId, operation.operationId)
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
  switch (operation.type) {
    case 'create':
      return mutateCreate(tx, userId, operation, rows, byId)
    case 'rename':
      return mutateRename({ tx, userId, rows, byId }, operation)
    case 'recolor':
      return mutateRecolor(tx, userId, operation, byId)
    case 'reparent':
      return mutateReparent({ tx, userId, rows, byId }, operation)
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
 * Finds the category an operation edits.
 *
 * A foreign or vanished category is indistinguishable from a forbidden one, so both return null.
 *
 * @param byId - The owner's categories indexed by id.
 * @param serverId - The category the operation targets.
 * @param protectDefault - True for edits the default category must never receive.
 * @returns The row, or null when the operation must be answered `forbidden`.
 * @example findEditableTarget(byId, 7, true) // => row, or null for the default category
 */
function findEditableTarget(
  byId: Map<number, CategoryRow>,
  serverId: number,
  protectDefault: boolean,
): CategoryRow | null {
  const target = byId.get(serverId)
  if (!target || (protectDefault && target.isDefault)) return null
  return target
}

/** Writes new column values for one of the owner's categories. */
async function updateOwnedCategory(
  tx: Transaction,
  userId: number,
  categoryId: number,
  values: Partial<typeof categoryTable.$inferInsert>,
): Promise<void> {
  await tx
    .update(categoryTable)
    .set(values)
    .where(
      and(eq(categoryTable.id, categoryId), eq(categoryTable.userId, userId)),
    )
}

/** One validated single-category edit handed to {@link writeValidatedEdit}. */
interface ValidatedEdit {
  target: CategoryRow
  operationId: string
  /** False when the edit is already in effect, so nothing is validated or written. */
  changed: boolean
  action: CategoryAction<number>
  values: Partial<typeof categoryTable.$inferInsert>
  /** Maps the validator's refusal to the receipt result. */
  toRefusal: (reason: CategoryRefusal) => 'name-taken' | 'invalid-parent'
}

/**
 * Validates an edit against the owner's whole tree, then writes it or reports why it is refused.
 *
 * @param scope - Transaction, owner and the categories read under the lock.
 * @param edit - The target, its validator action and the columns to write.
 * @returns `applied`, or the refusal result chosen by `edit.toRefusal`.
 * @example await writeValidatedEdit(scope, { target, operationId, changed: true, action, values, toRefusal })
 */
async function writeValidatedEdit(
  scope: MutationScope,
  edit: ValidatedEdit,
): Promise<CategoryOutcome> {
  const { target, operationId } = edit
  if (edit.changed) {
    const verdict = validateCategoryAction(scope.rows, edit.action)
    if (!verdict.ok)
      return outcome(operationId, { result: edit.toRefusal(verdict.reason) })
    await updateOwnedCategory(scope.tx, scope.userId, target.id, edit.values)
  }
  return outcome(operationId, { result: 'applied', serverId: target.id })
}

/**
 * Applies a `create`: validates the parent, adopts a same-path twin, or inserts the category.
 *
 * @param tx - Transaction that owns the account lock.
 * @param userId - Owner account.
 * @param operation - The create operation.
 * @param rows - The owner's categories read under the lock.
 * @param byId - `rows` indexed by id.
 * @returns `applied`, `adopted` (D4), `invalid-parent` or `forbidden`.
 * @example await mutateCreate(tx, user.id, operation, rows, byId)
 */
async function mutateCreate(
  tx: Transaction,
  userId: number,
  operation: Extract<CategoryWireOperation, { type: 'create' }>,
  rows: CategoryRow[],
  byId: Map<number, CategoryRow>,
): Promise<CategoryOutcome> {
  const id = operation.operationId
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

/**
 * Applies a `rename` with a compare-and-set on the expected name.
 *
 * @param scope - Transaction, owner and the categories read under the lock.
 * @param operation - The rename operation.
 * @returns `applied`, `conflict` (name moved), `name-taken` or `forbidden`.
 * @example await mutateRename(scope, operation)
 */
async function mutateRename(
  scope: MutationScope,
  operation: Extract<CategoryWireOperation, { type: 'rename' }>,
): Promise<CategoryOutcome> {
  const id = operation.operationId
  const target = findEditableTarget(scope.byId, operation.serverId, true)
  if (!target) return outcome(id, { result: 'forbidden' })
  if (
    normalizeCategoryName(target.name) !==
    normalizeCategoryName(operation.expected.name)
  )
    return outcome(id, { result: 'conflict', current: { name: target.name } })
  const name = normalizeCategoryName(operation.name)
  return writeValidatedEdit(scope, {
    target,
    operationId: id,
    changed: name !== target.name,
    action: { type: 'rename', id: target.id, name },
    values: { name },
    toRefusal: () => 'name-taken',
  })
}

/**
 * Applies a `recolor` with a compare-and-set on the exact expected color.
 *
 * @param tx - Transaction that owns the account lock.
 * @param userId - Owner account.
 * @param operation - The recolor operation.
 * @param byId - The owner's categories indexed by id.
 * @returns `applied`, `conflict` (color moved) or `forbidden`.
 * @example await mutateRecolor(tx, user.id, operation, byId)
 */
async function mutateRecolor(
  tx: Transaction,
  userId: number,
  operation: Extract<CategoryWireOperation, { type: 'recolor' }>,
  byId: Map<number, CategoryRow>,
): Promise<CategoryOutcome> {
  const id = operation.operationId
  const target = findEditableTarget(byId, operation.serverId, false)
  if (!target) return outcome(id, { result: 'forbidden' })
  // CAS on the exact value: an ABA (changed and changed back) still applies.
  if (target.color !== operation.expected.color)
    return outcome(id, {
      result: 'conflict',
      current: { color: target.color as CategoryOutcomeColor },
    })
  if (target.color !== operation.color)
    await updateOwnedCategory(tx, userId, target.id, {
      color: operation.color,
    })
  return outcome(id, { result: 'applied', serverId: target.id })
}

/**
 * Applies a `reparent` with a compare-and-set on the expected parent.
 *
 * @param scope - Transaction, owner and the categories read under the lock.
 * @param operation - The reparent operation.
 * @returns `applied`, `conflict` (parent moved), `name-taken`, `invalid-parent` or `forbidden`.
 * @example await mutateReparent(scope, operation)
 */
async function mutateReparent(
  scope: MutationScope,
  operation: Extract<CategoryWireOperation, { type: 'reparent' }>,
): Promise<CategoryOutcome> {
  const id = operation.operationId
  const target = findEditableTarget(scope.byId, operation.serverId, true)
  if (!target) return outcome(id, { result: 'forbidden' })
  if (target.parentId !== operation.expected.parentId)
    return outcome(id, {
      result: 'conflict',
      current: { parentId: target.parentId },
    })
  return writeValidatedEdit(scope, {
    target,
    operationId: id,
    changed: target.parentId !== operation.parentId,
    action: {
      type: 'reparent',
      id: target.id,
      parentId: operation.parentId,
    },
    values: { parentId: operation.parentId },
    toRefusal: reparentRefusalResult,
  })
}

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
  if (!verdict.ok) return outcome(id, deleteRefusalBody(verdict))
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
    await updateOwnedCategory(tx, userId, item.serverId, {
      name: `__corelive_internal_renaming_category_${item.serverId}__`,
    })
  for (const item of operation.items)
    await updateOwnedCategory(tx, userId, item.serverId, {
      name: finals.get(item.serverId) ?? '',
    })
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
    return {
      receipts: await readStoredReceipts(
        context.user.id,
        input.operationIds,
        (storedOutcome) => {
          const stored = SyncOutcomeSchema.parse(storedOutcome)
          return stored.kind === 'category' ? stored : null
        },
      ),
    }
  })
