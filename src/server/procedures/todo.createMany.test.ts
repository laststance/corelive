// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, expect, it } from 'vitest'

import { prisma } from '@/lib/prisma'

import { describeIfDb } from './describeIfDb'
import { createManyTodo, deleteManyTodo } from './todo'

/**
 * Real-DB procedure harness. Each test creates a fresh user via a unique Clerk
 * id so rows never collide across runs of the persistent dev database. The REAL
 * `authMiddleware` runs (never mocked): `call` passes a `headers` context with a
 * Bearer token, the middleware upserts the user by clerkId, and the handler
 * runs against the live Postgres on :5432.
 */
function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

const createdClerkIds = new Set<string>()

function freshClerkId(): string {
  const clerkId = `test_todo_import_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) continue
    // FK-safe teardown: child rows before the user.
    await prisma.completed.deleteMany({ where: { userId: user.id } })
    await prisma.todo.deleteMany({ where: { userId: user.id } })
    await prisma.importBatch.deleteMany({ where: { userId: user.id } })
    await prisma.category.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
  }
  createdClerkIds.clear()
})

describeIfDb('todo.createMany', () => {
  it('inserts one incomplete Todo per item without deduplicating repeated titles', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()

    // Act
    const result = await call(
      createManyTodo,
      {
        items: [{ title: 'write the spec' }, { title: 'write the spec' }],
        importBatchId,
      },
      authContext(clerkId),
    )

    // Assert
    expect(result).toEqual({ count: 2, idempotent: false })
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const rows = await prisma.todo.findMany({
      where: { userId: user.id, importBatchId },
    })
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.text === 'write the spec')).toBe(true)
    expect(rows.every((row) => row.completed === false)).toBe(true)
  })

  it('assigns sequential order values starting after the existing max so the paste lands last and keeps its order', async () => {
    // Arrange — seed one existing todo at order 0 via the default category.
    const clerkId = freshClerkId()
    const seedBatchId = randomUUID()
    await call(
      createManyTodo,
      { items: [{ title: 'existing todo' }], importBatchId: seedBatchId },
      authContext(clerkId),
    )
    const importBatchId = randomUUID()

    // Act — import two more todos
    await call(
      createManyTodo,
      {
        items: [{ title: 'pasted first' }, { title: 'pasted second' }],
        importBatchId,
      },
      authContext(clerkId),
    )

    // Assert — the existing todo is order 0; the paste is 1 then 2 (in order)
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const seeded = await prisma.todo.findFirstOrThrow({
      where: { userId: user.id, importBatchId: seedBatchId },
    })
    const pastedFirst = await prisma.todo.findFirstOrThrow({
      where: { userId: user.id, importBatchId, text: 'pasted first' },
    })
    const pastedSecond = await prisma.todo.findFirstOrThrow({
      where: { userId: user.id, importBatchId, text: 'pasted second' },
    })
    expect(seeded.order).toBe(0)
    expect(pastedFirst.order).toBe(1)
    expect(pastedSecond.order).toBe(2)
  })

  it('returns the prior count and inserts nothing new when the same importBatchId is resubmitted', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()
    const firstResult = await call(
      createManyTodo,
      { items: [{ title: 'a' }, { title: 'b' }], importBatchId },
      authContext(clerkId),
    )
    expect(firstResult).toEqual({ count: 2, idempotent: false })

    // Act — resubmit the same batch id
    const secondResult = await call(
      createManyTodo,
      { items: [{ title: 'a' }, { title: 'b' }], importBatchId },
      authContext(clerkId),
    )

    // Assert — idempotent no-op
    expect(secondResult).toEqual({ count: 2, idempotent: true })
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const totalRows = await prisma.todo.count({
      where: { userId: user.id, importBatchId },
    })
    expect(totalRows).toBe(2)
  })

  it('assigns the get-or-create default category to items with no categoryId', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()

    // Act
    await call(
      createManyTodo,
      { items: [{ title: 'uncategorized todo' }], importBatchId },
      authContext(clerkId),
    )

    // Assert
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const defaultCategory = await prisma.category.findFirstOrThrow({
      where: { userId: user.id, isDefault: true },
    })
    expect(defaultCategory.name).toBe('General')
    const row = await prisma.todo.findFirstOrThrow({
      where: { userId: user.id, importBatchId },
    })
    expect(row.categoryId).toBe(defaultCategory.id)
  })

  it('rejects a categoryId that belongs to a different user', async () => {
    // Arrange — owner with a category + a separate attacker user
    const ownerClerkId = freshClerkId()
    const attackerClerkId = freshClerkId()
    await call(
      createManyTodo,
      { items: [{ title: 'owner seed' }], importBatchId: randomUUID() },
      authContext(ownerClerkId),
    )
    const ownerUser = await prisma.user.findUniqueOrThrow({
      where: { clerkId: ownerClerkId },
    })
    const ownerCategory = await prisma.category.findFirstOrThrow({
      where: { userId: ownerUser.id },
    })
    await call(
      createManyTodo,
      { items: [{ title: 'attacker seed' }], importBatchId: randomUUID() },
      authContext(attackerClerkId),
    )

    // Act + Assert — attacker references the owner's categoryId → NOT_FOUND
    await expect(
      call(
        createManyTodo,
        {
          items: [{ title: 'sneaky', categoryId: ownerCategory.id }],
          importBatchId: randomUUID(),
        },
        authContext(attackerClerkId),
      ),
    ).rejects.toThrow(/category not found/i)
  })

  it('drops lines that normalize to empty before inserting', async () => {
    // Arrange — second item is whitespace-only (Zod .min(1) passes it)
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()

    // Act
    const result = await call(
      createManyTodo,
      { items: [{ title: 'keep me' }, { title: '   ' }], importBatchId },
      authContext(clerkId),
    )

    // Assert
    expect(result).toEqual({ count: 1, idempotent: false })
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const rows = await prisma.todo.findMany({
      where: { userId: user.id, importBatchId },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toBe('keep me')
  })

  it('rejects a batch of exactly 1001 items at the Zod cap', async () => {
    // Arrange — one over MAX_IMPORT_LINES_PER_BATCH (1000)
    const clerkId = freshClerkId()
    const items = Array.from({ length: 1001 }, (_unused, index) => ({
      title: `task ${index}`,
    }))

    // Act + Assert — Zod .max(1000) rejects 1001; oRPC surfaces the schema
    // failure as an "Input validation failed" BAD_REQUEST (not a DB/other error)
    await expect(
      call(
        createManyTodo,
        { items, importBatchId: randomUUID() },
        authContext(clerkId),
      ),
    ).rejects.toThrow(/input validation failed/i)
  })
})

describeIfDb('todo.deleteMany (bulk undo)', () => {
  it('deletes only the matching batch and leaves a sibling batch untouched', async () => {
    // Arrange — two batches for the same user
    const clerkId = freshClerkId()
    const batchToUndo = randomUUID()
    const batchToKeep = randomUUID()
    await call(
      createManyTodo,
      {
        items: [{ title: 'undo-1' }, { title: 'undo-2' }],
        importBatchId: batchToUndo,
      },
      authContext(clerkId),
    )
    await call(
      createManyTodo,
      { items: [{ title: 'keep-1' }], importBatchId: batchToKeep },
      authContext(clerkId),
    )

    // Act
    const result = await call(
      deleteManyTodo,
      { importBatchId: batchToUndo },
      authContext(clerkId),
    )

    // Assert
    expect(result).toEqual({ count: 2 })
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const undoneRows = await prisma.todo.count({
      where: { userId: user.id, importBatchId: batchToUndo },
    })
    const keptRows = await prisma.todo.count({
      where: { userId: user.id, importBatchId: batchToKeep },
    })
    expect(undoneRows).toBe(0)
    expect(keptRows).toBe(1)
  })

  it("does not delete another user's rows sharing the same importBatchId", async () => {
    // Arrange — two users; only the first imports under `sharedBatchId`
    const firstClerkId = freshClerkId()
    const secondClerkId = freshClerkId()
    const sharedBatchId = randomUUID()
    await call(
      createManyTodo,
      { items: [{ title: 'first-user-row' }], importBatchId: sharedBatchId },
      authContext(firstClerkId),
    )
    await call(
      createManyTodo,
      { items: [{ title: 'second-user-seed' }], importBatchId: randomUUID() },
      authContext(secondClerkId),
    )

    // Act — second user attempts to undo the first user's batch id
    const result = await call(
      deleteManyTodo,
      { importBatchId: sharedBatchId },
      authContext(secondClerkId),
    )

    // Assert — nothing deleted; the first user's row survives
    expect(result).toEqual({ count: 0 })
    const firstUser = await prisma.user.findUniqueOrThrow({
      where: { clerkId: firstClerkId },
    })
    const firstUserRows = await prisma.todo.count({
      where: { userId: firstUser.id, importBatchId: sharedBatchId },
    })
    expect(firstUserRows).toBe(1)
  })

  it('deletes nothing once the undo window has expired', async () => {
    // Arrange — import then backdate createdAt past the 60s window
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()
    await call(
      createManyTodo,
      { items: [{ title: 'too old to undo' }], importBatchId },
      authContext(clerkId),
    )
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    await prisma.todo.updateMany({
      where: { userId: user.id, importBatchId },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    })

    // Act
    const result = await call(
      deleteManyTodo,
      { importBatchId },
      authContext(clerkId),
    )

    // Assert — window expired, row remains
    expect(result).toEqual({ count: 0 })
    const remaining = await prisma.todo.count({
      where: { userId: user.id, importBatchId },
    })
    expect(remaining).toBe(1)
  })
})
