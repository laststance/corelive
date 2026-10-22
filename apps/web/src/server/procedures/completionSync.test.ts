// @vitest-environment node
import { randomUUID } from 'node:crypto'

import type { CompletionSyncOperation } from '@corelive/desktop-contract/offline-workspace'
import { call } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryTable,
  completedTable,
  completionSyncReceiptTable,
  completionSyncStateTable,
  userTable,
} from '@/db/schema'

import { createCategory, deleteCategory } from './category'
import { deleteCompleted, importLocalCompleted } from './completed'
import {
  syncApply,
  syncBootstrap,
  syncCheckpoint,
  syncReceipts,
} from './completionSync'
import { describeIfDb } from './describeIfDb'

vi.setConfig({ testTimeout: 30000 })
const owners: string[] = []
const recordedAt = Date.parse('2026-09-01T15:30:00.000Z')

/** Creates a synthetic authenticated account through the same bootstrap procedure as desktop.
 * @example const account = await createAccount()
 */
async function createAccount() {
  const clerkId = `test_offline_${randomUUID()}`
  owners.push(clerkId)
  const context = {
    context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
  }
  const bootstrap = await call(syncBootstrap, undefined, context)
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.clerkId, clerkId))
  if (!user) throw new Error('Missing synthetic account')
  return {
    context,
    userId: user.id,
    categoryId: bootstrap.categories[0]!.id,
    clerkId,
  }
}

/** Creates independent completion/operation UUIDs even when the title is identical.
 * @example const operation = createOperation(account.categoryId)
 */
function createOperation(categoryId: number): CompletionSyncOperation {
  return {
    operationId: randomUUID(),
    completionId: randomUUID(),
    deviceId: randomUUID(),
    revision: 1,
    expectedRemoteRevision: 0,
    kind: 'create',
    categoryId,
    title: 'Repeated work',
    completedAt: recordedAt,
    originalCompletedAt: recordedAt,
    timezone: 'Asia/Tokyo',
  }
}

afterEach(async () => {
  for (const clerkId of owners.splice(0)) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    // The new evidence tables cascade from User; visible records/categories retain their existing restrictions.
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
})

describeIfDb('offline completion synchronization', () => {
  test('lost replies and concurrent replay create one record while equal titles stay distinct', async () => {
    // Arrange
    const account = await createAccount()
    const operation = createOperation(account.categoryId)
    const equalTitle = createOperation(account.categoryId)

    // Act
    const [first, replay] = await Promise.all([
      call(syncApply, { operations: [operation] }, account.context),
      call(syncApply, { operations: [operation] }, account.context),
    ])
    await call(syncApply, { operations: [equalTitle] }, account.context)
    const records = await db
      .select()
      .from(completedTable)
      .where(eq(completedTable.userId, account.userId))
    const lookup = await call(
      syncReceipts,
      { operationIds: [operation.operationId] },
      account.context,
    )

    // Assert
    expect(first).toEqual(replay)
    expect(lookup).toEqual(first)
    expect(records).toHaveLength(2)
    expect(records.map((row) => row.title)).toEqual([
      'Repeated work',
      'Repeated work',
    ])
    expect(records.map((row) => row.completedAt?.toISOString())).toEqual([
      '2026-09-01T15:30:00.000Z',
      '2026-09-01T15:30:00.000Z',
    ])
  })

  test('cancel before create leaves a terminal tombstone that late creates cannot resurrect', async () => {
    // Arrange
    const account = await createAccount()
    const create = createOperation(account.categoryId)
    const cancel = {
      ...create,
      operationId: randomUUID(),
      revision: 2,
      kind: 'cancel' as const,
    }

    // Act
    await call(
      syncApply,
      { operations: [cancel, create, create] },
      account.context,
    )
    const records = await db
      .select()
      .from(completedTable)
      .where(eq(completedTable.userId, account.userId))
    const [state] = await db
      .select()
      .from(completionSyncStateTable)
      .where(eq(completionSyncStateTable.userId, account.userId))

    // Assert
    expect(records).toEqual([])
    expect(state).toMatchObject({
      completionId: create.completionId,
      cancelled: true,
      revision: 2,
      completedId: null,
    })
  })

  test('eligible local Undo can arrive long after the legacy server delete window', async () => {
    // Arrange
    const account = await createAccount()
    const create = createOperation(account.categoryId)
    await call(syncApply, { operations: [create] }, account.context)
    await db
      .update(completedTable)
      .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(completedTable.userId, account.userId))

    // Act
    const result = await call(
      syncApply,
      {
        operations: [
          {
            ...create,
            operationId: randomUUID(),
            revision: 2,
            expectedRemoteRevision: 1,
            kind: 'cancel',
          },
        ],
      },
      account.context,
    )

    // Assert
    expect(result.receipts[0]).toMatchObject({
      status: 'applied',
      projection: { cancelled: true },
    })
    expect(
      await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.userId, account.userId)),
    ).toEqual([])
  })

  test('one invalid timestamp does not stop unrelated completion delivery', async () => {
    // Arrange
    const account = await createAccount()
    const valid = createOperation(account.categoryId)
    const invalid = {
      ...createOperation(account.categoryId),
      completedAt: Date.now() + 3600000,
    }

    // Act
    const result = await call(
      syncApply,
      { operations: [invalid, valid] },
      account.context,
    )

    // Assert
    expect(
      result.receipts.map((receipt) => [receipt.status, receipt.reason]),
    ).toEqual([
      ['rejected', 'invalid-time'],
      ['applied', undefined],
    ])
    expect(
      await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.userId, account.userId)),
    ).toHaveLength(1)
  })

  test('correcting a rejected future time preserves one identity and its original timestamp', async () => {
    // Arrange
    const account = await createAccount()
    const future = Date.now() + 3600000
    const invalid = {
      ...createOperation(account.categoryId),
      completedAt: future,
      originalCompletedAt: future,
    }
    await call(syncApply, { operations: [invalid] }, account.context)

    // Act
    const correction = {
      ...invalid,
      operationId: randomUUID(),
      revision: 2,
      completedAt: recordedAt,
    }
    await call(syncApply, { operations: [correction] }, account.context)
    const [state] = await db
      .select()
      .from(completionSyncStateTable)
      .where(eq(completionSyncStateTable.userId, account.userId))

    // Assert
    expect(state?.completionId).toBe(invalid.completionId)
    expect(state?.completedAt.toISOString()).toBe('2026-09-01T15:30:00.000Z')
    expect(state?.originalCompletedAt.getTime()).toBe(future)
    expect(
      await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.userId, account.userId)),
    ).toHaveLength(1)
  })

  test('receipt identity reuse with different bytes is rejected without changing the first result', async () => {
    // Arrange
    const account = await createAccount()
    const original = createOperation(account.categoryId)
    const first = await call(
      syncApply,
      { operations: [original] },
      account.context,
    )

    // Act
    const changed = await call(
      syncApply,
      { operations: [{ ...original, title: 'Other text' }] },
      account.context,
    )
    const lookup = await call(
      syncReceipts,
      { operationIds: [original.operationId] },
      account.context,
    )

    // Assert
    expect(changed.receipts[0]).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    expect(lookup).toEqual(first)
    expect(
      (
        await db
          .select()
          .from(completedTable)
          .where(eq(completedTable.userId, account.userId))
      )[0]?.title,
    ).toBe('Repeated work')
  })

  test('account ownership isolates category writes, cancellations and receipt reads', async () => {
    // Arrange
    const first = await createAccount()
    const other = await createAccount()
    const operation = createOperation(first.categoryId)
    await call(syncApply, { operations: [operation] }, first.context)

    // Act
    const foreign = await call(
      syncApply,
      { operations: [operation] },
      other.context,
    )
    await call(
      syncApply,
      {
        operations: [
          {
            ...operation,
            operationId: randomUUID(),
            kind: 'cancel',
            revision: 2,
          },
        ],
      },
      other.context,
    )
    const lookup = await call(
      syncReceipts,
      { operationIds: [operation.operationId] },
      other.context,
    )

    // Assert
    expect(foreign.receipts[0]).toMatchObject({
      status: 'rejected',
      reason: 'category-removed',
    })
    expect(lookup.receipts[0]?.status).toBe('rejected')
    expect(
      await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.userId, first.userId)),
    ).toHaveLength(1)
  })

  test('deleting a category advances the remote revision so stale offline moves require a decision', async () => {
    // Arrange
    const account = await createAccount()
    const category = await call(
      createCategory,
      { name: 'Temporary' },
      account.context,
    )
    const operation = createOperation(category.id)
    await call(syncApply, { operations: [operation] }, account.context)
    await call(
      deleteCategory,
      { id: category.id, targetCategoryId: account.categoryId },
      account.context,
    )

    // Act
    const result = await call(
      syncApply,
      {
        operations: [
          {
            ...operation,
            operationId: randomUUID(),
            kind: 'relocate',
            revision: 2,
            expectedRemoteRevision: 1,
            categoryId: account.categoryId,
          },
        ],
      },
      account.context,
    )

    // Assert
    expect(result.receipts[0]).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
      projection: { revision: 2, categoryId: account.categoryId },
    })
  })

  test('legacy Undo invalidates sync state and replay cannot restore its deleted row', async () => {
    // Arrange
    const account = await createAccount()
    const operation = createOperation(account.categoryId)
    await call(syncApply, { operations: [operation] }, account.context)
    const [record] = await db
      .select()
      .from(completedTable)
      .where(eq(completedTable.userId, account.userId))

    // Act
    await call(deleteCompleted, { id: record!.id }, account.context)
    await call(
      syncApply,
      {
        operations: [
          {
            ...operation,
            operationId: randomUUID(),
            revision: 3,
            expectedRemoteRevision: 2,
            kind: 'correctTime',
          },
        ],
      },
      account.context,
    )

    // Assert
    expect(
      await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.userId, account.userId)),
    ).toEqual([])
    const [state] = await db
      .select()
      .from(completionSyncStateTable)
      .where(eq(completionSyncStateTable.userId, account.userId))
    expect(state?.cancelled).toBe(true)
  })

  test('a sync identity cannot adopt or cancel a legacy imported completion', async () => {
    // Arrange
    const account = await createAccount()
    const operation = createOperation(account.categoryId)
    await call(
      importLocalCompleted,
      {
        batchId: randomUUID(),
        items: [
          {
            localId: operation.completionId,
            title: 'Legacy keep',
            completedAt: new Date(recordedAt),
          },
        ],
      },
      account.context,
    )

    // Act
    const result = await call(
      syncApply,
      {
        operations: [
          operation,
          {
            ...operation,
            operationId: randomUUID(),
            revision: 2,
            kind: 'cancel',
          },
        ],
      },
      account.context,
    )

    // Assert
    expect(result.receipts[0]).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    expect(
      (
        await db
          .select()
          .from(completedTable)
          .where(eq(completedTable.userId, account.userId))
      )[0]?.title,
    ).toBe('Legacy keep')
  })

  test('checkpoint covers the same local day and requested contribution identities without duplicate count', async () => {
    // Arrange
    const account = await createAccount()
    const operation = createOperation(account.categoryId)
    const absent = randomUUID()
    await call(syncApply, { operations: [operation] }, account.context)

    // Act
    const checkpoint = await call(
      syncCheckpoint,
      {
        day: '2026-09-02',
        timezone: 'Asia/Tokyo',
        completionIds: [operation.completionId, absent],
      },
      account.context,
    )
    const utc = await call(
      syncCheckpoint,
      { day: '2026-09-02', timezone: 'UTC', completionIds: [] },
      account.context,
    )

    // Assert
    expect(checkpoint.total).toBe(1)
    expect(checkpoint.identities[operation.completionId]).toMatchObject({
      cancelled: false,
      completedAt: recordedAt,
      revision: 1,
    })
    expect(checkpoint.identities[absent]).toBeNull()
    expect(utc.total).toBe(0)
    expect(utc.identities).toEqual({})
  })

  test('deleting an account cleans up its durable receipts and tombstones', async () => {
    // Arrange
    const account = await createAccount()
    const operation = createOperation(account.categoryId)
    await call(
      syncApply,
      { operations: [{ ...operation, kind: 'cancel' }] },
      account.context,
    )

    // Act
    await db
      .delete(categoryTable)
      .where(eq(categoryTable.userId, account.userId))
    await db.delete(userTable).where(eq(userTable.id, account.userId))

    // Assert
    expect(
      await db
        .select()
        .from(completionSyncStateTable)
        .where(eq(completionSyncStateTable.userId, account.userId)),
    ).toEqual([])
    expect(
      await db
        .select()
        .from(completionSyncReceiptTable)
        .where(
          and(
            eq(completionSyncReceiptTable.userId, account.userId),
            eq(completionSyncReceiptTable.operationId, operation.operationId),
          ),
        ),
    ).toEqual([])
  })
})
