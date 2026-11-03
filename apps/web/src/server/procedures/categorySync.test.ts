// @vitest-environment node
import { randomUUID } from 'node:crypto'

import type { CategoryWireOperation } from '@corelive/desktop-contract/category-sync'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryDeletionTable,
  categoryTable,
  completedTable,
  completionSyncStateTable,
  syncReceiptTable,
  userTable,
} from '@/db/schema'

import { createCategory } from './category'
import { syncCategoryApply, syncCategoryReceipts } from './categorySync'
import {
  syncApply,
  syncBootstrap,
  syncCheckpoint,
  syncReceipts,
} from './completionSync'
import { describeIfDb } from './describeIfDb'

vi.setConfig({ testTimeout: 30000 })
const owners: string[] = []

/** Creates a synthetic account and its bearer context.
 * @example const account = await createAccount()
 */
async function createAccount() {
  const clerkId = `test_catsync_${randomUUID()}`
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
  return { context, userId: user.id, defaultId: bootstrap.categories[0]!.id }
}
type Account = Awaited<ReturnType<typeof createAccount>>
/** Wire operation whose id the helper may generate. */
type WireInput = CategoryWireOperation extends infer Operation
  ? Operation extends CategoryWireOperation
    ? Omit<Operation, 'operationId'> & { operationId?: string }
    : never
  : never

/** Sends one wire operation and returns its single receipt.
 * @example const receipt = await send(account, { type: 'create', ... })
 */
async function send(account: Account, operation: WireInput) {
  const operationId = operation.operationId ?? randomUUID()
  const { receipts } = await call(
    syncCategoryApply,
    { operations: [{ ...operation, operationId }] },
    account.context,
  )
  return receipts[0]!
}

/** Creates a category through the web path and returns its id.
 * @example const id = await webCreate(account, 'Work')
 */
async function webCreate(
  account: Account,
  name: string,
  parentId: number | null = null,
) {
  const created = await call(
    createCategory,
    { name, parentId },
    account.context,
  )
  return created.id
}

/** Reads a category row.
 * @example const row = await row(account, 3)
 */
async function readRow(id: number) {
  const [found] = await db
    .select()
    .from(categoryTable)
    .where(eq(categoryTable.id, id))
  return found
}

afterEach(async () => {
  for (const clerkId of owners.splice(0)) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db
      .delete(completionSyncStateTable)
      .where(eq(completionSyncStateTable.userId, user.id))
    await db
      .delete(categoryDeletionTable)
      .where(eq(categoryDeletionTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
})

describeIfDb('category.syncApply', () => {
  test('creates a new category and replays the stored receipt without writing twice', async () => {
    // Arrange
    const account = await createAccount()
    const operationId = randomUUID()
    const operation = {
      operationId,
      type: 'create' as const,
      name: 'Reading',
      color: 'green' as const,
      parentId: null,
    }

    // Act
    const first = await send(account, operation)
    const replay = await send(account, operation)
    const rows = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.name, 'Reading'))

    // Assert
    expect(first).toMatchObject({ kind: 'category', result: 'applied' })
    expect(replay).toEqual(first)
    expect(rows.filter((row) => row.userId === account.userId)).toHaveLength(1)
  })

  test('adopts an existing same-name category and returns its current fields', async () => {
    // Arrange
    const account = await createAccount()
    const existing = await webCreate(account, 'Work')

    // Act
    const receipt = await send(account, {
      type: 'create',
      name: 'Work',
      color: 'rose',
      parentId: null,
    })

    // Assert
    expect(receipt).toMatchObject({
      result: 'adopted',
      serverId: existing,
      current: { name: 'Work', color: 'blue', parentId: null },
    })
  })

  test('rejects a create under a missing or non-root parent as invalid-parent', async () => {
    // Arrange
    const account = await createAccount()
    const root = await webCreate(account, 'Root')
    const child = await webCreate(account, 'Child', root)

    // Act
    const missing = await send(account, {
      type: 'create',
      name: 'X',
      color: 'blue',
      parentId: 999_999_999,
    })
    const tooDeep = await send(account, {
      type: 'create',
      name: 'Y',
      color: 'blue',
      parentId: child,
    })

    // Assert
    expect(missing).toMatchObject({ result: 'invalid-parent' })
    expect(tooDeep).toMatchObject({ result: 'invalid-parent' })
  })

  test('renames when expected matches and answers name-taken when the sibling name exists', async () => {
    // Arrange
    const account = await createAccount()
    const alpha = await webCreate(account, 'Alpha')
    await webCreate(account, 'Beta')

    // Act
    const taken = await send(account, {
      type: 'rename',
      serverId: alpha,
      name: 'Beta',
      expected: { name: 'Alpha' },
    })
    const renamed = await send(account, {
      type: 'rename',
      serverId: alpha,
      name: 'Gamma',
      expected: { name: 'Alpha' },
    })

    // Assert
    expect(taken).toMatchObject({ result: 'name-taken' })
    expect(renamed).toMatchObject({ result: 'applied', serverId: alpha })
    expect((await readRow(alpha))?.name).toBe('Gamma')
  })

  test('answers conflict with the current value when expected is stale and leaves the row untouched', async () => {
    // Arrange
    const account = await createAccount()
    const id = await webCreate(account, 'Web renamed')

    // Act
    const rename = await send(account, {
      type: 'rename',
      serverId: id,
      name: 'Mac name',
      expected: { name: 'Old name' },
    })
    const recolor = await send(account, {
      type: 'recolor',
      serverId: id,
      color: 'rose',
      expected: { color: 'green' },
    })
    const reparent = await send(account, {
      type: 'reparent',
      serverId: id,
      parentId: account.defaultId,
      expected: { parentId: 12345 },
    })

    // Assert
    expect(rename).toMatchObject({
      result: 'conflict',
      current: { name: 'Web renamed' },
    })
    expect(recolor).toMatchObject({
      result: 'conflict',
      current: { color: 'blue' },
    })
    expect(reparent).toMatchObject({
      result: 'conflict',
      current: { parentId: null },
    })
    expect((await readRow(id))?.name).toBe('Web renamed')
  })

  test('applies a recolor whose expected value was changed and changed back (ABA)', async () => {
    // Arrange
    const account = await createAccount()
    const id = await webCreate(account, 'Aba')
    await db
      .update(categoryTable)
      .set({ color: 'rose' })
      .where(eq(categoryTable.id, id))
    await db
      .update(categoryTable)
      .set({ color: 'blue' })
      .where(eq(categoryTable.id, id))

    // Act
    const receipt = await send(account, {
      type: 'recolor',
      serverId: id,
      color: 'violet',
      expected: { color: 'blue' },
    })

    // Assert
    expect(receipt).toMatchObject({ result: 'applied' })
    expect((await readRow(id))?.color).toBe('violet')
  })

  test('refuses to rename or reparent the default category but pairs a web-recolored default for recolor', async () => {
    // Arrange
    const account = await createAccount()
    await db
      .update(categoryTable)
      .set({ color: 'orange' })
      .where(eq(categoryTable.id, account.defaultId))

    // Act
    const rename = await send(account, {
      type: 'rename',
      serverId: account.defaultId,
      name: 'Home',
      expected: { name: 'General' },
    })
    const recolor = await send(account, {
      type: 'recolor',
      serverId: account.defaultId,
      color: 'rose',
      expected: { color: 'orange' },
    })

    // Assert
    expect(rename).toMatchObject({ result: 'forbidden' })
    expect(recolor).toMatchObject({ result: 'applied' })
  })

  test('answers invalid-parent for a reparent that would create a third level', async () => {
    // Arrange
    const account = await createAccount()
    const parent = await webCreate(account, 'P')
    const other = await webCreate(account, 'O')
    await webCreate(account, 'Kid', other)

    // Act
    const receipt = await send(account, {
      type: 'reparent',
      serverId: other,
      parentId: parent,
      expected: { parentId: null },
    })

    // Assert
    expect(receipt).toMatchObject({ result: 'invalid-parent' })
  })

  test('answers digest-mismatch when an operation id is reused with other bytes', async () => {
    // Arrange
    const account = await createAccount()
    const operationId = randomUUID()
    await send(account, {
      operationId,
      type: 'create',
      name: 'First',
      color: 'blue',
      parentId: null,
    })

    // Act
    const receipt = await send(account, {
      operationId,
      type: 'create',
      name: 'Different',
      color: 'blue',
      parentId: null,
    })

    // Assert
    expect(receipt).toMatchObject({ result: 'digest-mismatch' })
  })

  test('deletes through the rescue path, records the deletion and replays as applied', async () => {
    // Arrange
    const account = await createAccount()
    const doomed = await webCreate(account, 'Doomed')
    const operation = {
      operationId: randomUUID(),
      type: 'delete' as const,
      serverId: doomed,
      destinationId: account.defaultId,
    }

    // Act
    const first = await send(account, operation)
    const replay = await send(account, operation)
    const [deletion] = await db
      .select()
      .from(categoryDeletionTable)
      .where(eq(categoryDeletionTable.sourceId, doomed))

    // Assert
    expect(first).toMatchObject({ result: 'applied', serverId: doomed })
    expect(replay).toEqual(first)
    expect(deletion).toMatchObject({ destinationId: account.defaultId })
    expect(await readRow(doomed)).toBeUndefined()
  })

  test('blocks a delete whose promoted child would collide with a root name', async () => {
    // Arrange
    const account = await createAccount()
    const parent = await webCreate(account, 'Parent')
    await webCreate(account, 'Twin', parent)
    await webCreate(account, 'Twin')

    // Act
    const receipt = await send(account, {
      type: 'delete',
      serverId: parent,
      destinationId: account.defaultId,
    })

    // Assert
    expect(receipt).toMatchObject({
      result: 'delete-blocked',
      reason: 'child-name-taken',
      childName: 'Twin',
    })
    expect(await readRow(parent)).toBeDefined()
  })

  test('converges an offline A<->B swap through one renameSet', async () => {
    // Arrange
    const account = await createAccount()
    const a = await webCreate(account, 'A')
    const b = await webCreate(account, 'B')

    // Act
    const receipt = await send(account, {
      type: 'renameSet',
      items: [
        { serverId: a, name: 'B', expected: { name: 'A' } },
        { serverId: b, name: 'A', expected: { name: 'B' } },
      ],
    })

    // Assert
    expect(receipt).toMatchObject({ result: 'applied' })
    expect((await readRow(a))?.name).toBe('B')
    expect((await readRow(b))?.name).toBe('A')
  })

  test('answers conflict for the whole renameSet and renames nothing when one expected is stale', async () => {
    // Arrange
    const account = await createAccount()
    const a = await webCreate(account, 'A')
    const b = await webCreate(account, 'B')

    // Act
    const receipt = await send(account, {
      type: 'renameSet',
      items: [
        { serverId: a, name: 'B', expected: { name: 'A' } },
        { serverId: b, name: 'A', expected: { name: 'Stale' } },
      ],
    })

    // Assert
    expect(receipt).toMatchObject({
      result: 'conflict',
      current: { name: 'B' },
    })
    expect((await readRow(a))?.name).toBe('A')
  })

  test('answers name-taken for a renameSet whose final names collide with another category', async () => {
    // Arrange
    const account = await createAccount()
    const a = await webCreate(account, 'A')
    const b = await webCreate(account, 'B')
    await webCreate(account, 'C')

    // Act
    const receipt = await send(account, {
      type: 'renameSet',
      items: [
        { serverId: a, name: 'C', expected: { name: 'A' } },
        { serverId: b, name: 'A', expected: { name: 'B' } },
      ],
    })

    // Assert
    expect(receipt).toMatchObject({ result: 'name-taken' })
    expect((await readRow(a))?.name).toBe('A')
  })

  test('keeps the first receipt replayable when a later operation in the batch fails with a server error', async () => {
    // Arrange
    const account = await createAccount()
    const first = {
      operationId: randomUUID(),
      type: 'create' as const,
      name: 'Survivor',
      color: 'blue' as const,
      parentId: null,
    }
    // A stale deletion receipt for a live category makes the delete insert hit a unique violation (a 5xx).
    const doomed = await webCreate(account, 'Doomed')
    await db.insert(categoryDeletionTable).values({
      userId: account.userId,
      sourceId: doomed,
      destinationId: account.defaultId,
    })
    const poison = {
      operationId: randomUUID(),
      type: 'delete' as const,
      serverId: doomed,
      destinationId: account.defaultId,
    }

    // Act
    await expect(
      call(syncCategoryApply, { operations: [first, poison] }, account.context),
    ).rejects.toBeDefined()
    const recovered = await call(
      syncCategoryReceipts,
      { operationIds: [first.operationId, poison.operationId] },
      account.context,
    )
    const replay = await send(account, first)

    // Assert
    expect(recovered.receipts).toHaveLength(1)
    expect(recovered.receipts[0]).toMatchObject({ result: 'applied' })
    expect(replay).toEqual(recovered.receipts[0])
  })

  test('does not leak another account receipt through syncReceipts', async () => {
    // Arrange
    const owner = await createAccount()
    const stranger = await createAccount()
    const receipt = await send(owner, {
      type: 'create',
      name: 'Private',
      color: 'blue',
      parentId: null,
    })

    // Act
    const lookup = await call(
      syncCategoryReceipts,
      { operationIds: [receipt.operationId] },
      stranger.context,
    )

    // Assert
    expect(lookup.receipts).toEqual([])
  })
})

describeIfDb('shared receipt table compatibility (C13, EA6)', () => {
  test('v0.29.0 completed.sync fixtures keep their exact wire responses', async () => {
    // Arrange
    const account = await createAccount()
    const operation = {
      operationId: '11111111-1111-4111-8111-111111111111',
      completionId: '22222222-2222-4222-8222-222222222222',
      deviceId: '33333333-3333-4333-8333-333333333333',
      revision: 1,
      expectedRemoteRevision: 0,
      kind: 'create' as const,
      categoryId: account.defaultId,
      title: 'Fixture work',
      completedAt: Date.parse('2026-09-01T15:30:00.000Z'),
      originalCompletedAt: Date.parse('2026-09-01T15:30:00.000Z'),
      timezone: 'Asia/Tokyo',
    }
    const expectedReceipt = {
      operationId: operation.operationId,
      completionId: operation.completionId,
      revision: 1,
      status: 'applied',
      projection: {
        completionId: operation.completionId,
        revision: 1,
        cancelled: false,
        categoryId: account.defaultId,
        title: 'Fixture work',
        completedAt: Date.parse('2026-09-01T15:30:00.000Z'),
      },
    }

    // Act
    const applied = await call(
      syncApply,
      { operations: [operation] },
      account.context,
    )
    const looked = await call(
      syncReceipts,
      { operationIds: [operation.operationId] },
      account.context,
    )
    const checkpoint = await call(
      syncCheckpoint,
      {
        day: '2026-09-02',
        timezone: 'Asia/Tokyo',
        completionIds: [operation.completionId],
      },
      account.context,
    )

    // Assert
    expect(applied).toEqual({ receipts: [expectedReceipt] })
    expect(looked).toEqual({ receipts: [expectedReceipt] })
    expect(checkpoint).toMatchObject({
      day: '2026-09-02',
      timezone: 'Asia/Tokyo',
      total: 1,
      identities: { [operation.completionId]: expectedReceipt.projection },
    })
  })

  test('an old-shape receipt row without kind reads as a completion and never as a category receipt', async () => {
    // Arrange
    const account = await createAccount()
    const operationId = randomUUID()
    const completionId = randomUUID()
    await db.insert(syncReceiptTable).values({
      userId: account.userId,
      operationId,
      payloadDigest: 'legacy',
      outcome: {
        operationId,
        completionId,
        revision: 1,
        status: 'rejected',
        reason: 'conflict',
        projection: null,
      },
    })

    // Act
    const completion = await call(
      syncReceipts,
      { operationIds: [operationId] },
      account.context,
    )
    const category = await call(
      syncCategoryReceipts,
      { operationIds: [operationId] },
      account.context,
    )

    // Assert
    expect(completion.receipts).toEqual([
      {
        operationId,
        completionId,
        revision: 1,
        status: 'rejected',
        reason: 'conflict',
        projection: null,
      },
    ])
    expect(category.receipts).toEqual([])
  })
})
