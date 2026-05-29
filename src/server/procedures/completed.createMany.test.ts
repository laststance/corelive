// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/prisma'

import { createManyCompleted, deleteManyCompleted } from './completed'

// Real-DB integration suites: run only when RUN_DB_INTEGRATION_TESTS=1 (the CI
// `test` job sets it after Postgres is up; set it locally with `docker compose
// up`). Skip cleanly in DB-less contexts so they never block unrelated runs.
const describeIfDb =
  process.env.RUN_DB_INTEGRATION_TESTS === '1' ? describe : describe.skip

/**
 * Real-DB procedure harness. Each test creates a fresh user via a unique Clerk
 * id so rows never collide across runs of the persistent dev database. We run
 * the REAL `authMiddleware` (never mocked): `call` passes a `headers` context
 * with a Bearer token, the middleware upserts the user by clerkId, and the
 * handler runs against the live Postgres on :5432.
 */
function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

// Track every clerkId a test touches so afterEach can delete the user and all
// FK-dependent rows in a safe order (User has no onDelete cascade from
// Completed/Todo/Category; ImportBatch cascades with the user).
const createdClerkIds = new Set<string>()

function freshClerkId(): string {
  const clerkId = `test_import_${randomUUID()}`
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

describeIfDb('completed.createMany', () => {
  it('inserts one Completed row per item without deduplicating repeated titles', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()

    // Act
    const result = await call(
      createManyCompleted,
      {
        items: [
          { title: 'English study' },
          { title: 'English study' },
          { title: 'English study' },
        ],
        importBatchId,
      },
      authContext(clerkId),
    )

    // Assert
    expect(result).toEqual({ count: 3, idempotent: false })
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const rows = await prisma.completed.findMany({
      where: { userId: user.id, importBatchId },
    })
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.title === 'English study')).toBe(true)
  })

  it('returns the prior count and inserts nothing new when the same importBatchId is resubmitted', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()
    const firstResult = await call(
      createManyCompleted,
      { items: [{ title: 'a' }, { title: 'b' }], importBatchId },
      authContext(clerkId),
    )
    expect(firstResult).toEqual({ count: 2, idempotent: false })

    // Act — resubmit the exact same batch id (network retry / double-fire)
    const secondResult = await call(
      createManyCompleted,
      { items: [{ title: 'a' }, { title: 'b' }], importBatchId },
      authContext(clerkId),
    )

    // Assert — idempotent no-op, prior count echoed, no extra rows
    expect(secondResult).toEqual({ count: 2, idempotent: true })
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const totalRows = await prisma.completed.count({
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
      createManyCompleted,
      { items: [{ title: 'no category here' }], importBatchId },
      authContext(clerkId),
    )

    // Assert — a default "General" category was created and the row points at it
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const defaultCategory = await prisma.category.findFirstOrThrow({
      where: { userId: user.id, isDefault: true },
    })
    expect(defaultCategory.name).toBe('General')
    const row = await prisma.completed.findFirstOrThrow({
      where: { userId: user.id, importBatchId },
    })
    expect(row.categoryId).toBe(defaultCategory.id)
  })

  it('rejects a categoryId that belongs to a different user', async () => {
    // Arrange — owner user with a real category, plus a separate attacker user
    const ownerClerkId = freshClerkId()
    const attackerClerkId = freshClerkId()
    await call(
      createManyCompleted,
      { items: [{ title: 'owner seed' }], importBatchId: randomUUID() },
      authContext(ownerClerkId),
    )
    const ownerUser = await prisma.user.findUniqueOrThrow({
      where: { clerkId: ownerClerkId },
    })
    const ownerCategory = await prisma.category.findFirstOrThrow({
      where: { userId: ownerUser.id },
    })
    // Materialize the attacker user (auth upsert) so the rejection isn't a
    // side effect of a missing user.
    await call(
      createManyCompleted,
      { items: [{ title: 'attacker seed' }], importBatchId: randomUUID() },
      authContext(attackerClerkId),
    )

    // Act + Assert — attacker references the owner's categoryId → NOT_FOUND
    await expect(
      call(
        createManyCompleted,
        {
          items: [{ title: 'sneaky', categoryId: ownerCategory.id }],
          importBatchId: randomUUID(),
        },
        authContext(attackerClerkId),
      ),
    ).rejects.toThrow(/category not found/i)
  })

  it('drops lines that normalize to empty before inserting', async () => {
    // Arrange — second item is whitespace-only; Zod .min(1) passes it, the
    // server-side normalize must drop it so only one row is inserted.
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()

    // Act
    const result = await call(
      createManyCompleted,
      {
        items: [{ title: 'keep me' }, { title: '   ' }],
        importBatchId,
      },
      authContext(clerkId),
    )

    // Assert
    expect(result).toEqual({ count: 1, idempotent: false })
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const rows = await prisma.completed.findMany({
      where: { userId: user.id, importBatchId },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('keep me')
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
        createManyCompleted,
        { items, importBatchId: randomUUID() },
        authContext(clerkId),
      ),
    ).rejects.toThrow(/input validation failed/i)
  })

  it('stamps completedAt to the provided past date while keeping createdAt as the real insert time', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()
    const pastDate = new Date('2025-01-01T00:00:00.000Z')

    // Act
    await call(
      createManyCompleted,
      {
        items: [{ title: 'logged for last year', completedAt: pastDate }],
        importBatchId,
      },
      authContext(clerkId),
    )

    // Assert — completedAt is the semantic past date; createdAt is "now"
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const row = await prisma.completed.findFirstOrThrow({
      where: { userId: user.id, importBatchId },
    })
    expect(row.completedAt?.toISOString()).toBe('2025-01-01T00:00:00.000Z')
    expect(row.createdAt.getTime()).toBeGreaterThan(pastDate.getTime())
  })
})

describeIfDb('completed.deleteMany (bulk undo)', () => {
  it('deletes only the matching batch and leaves a sibling batch untouched', async () => {
    // Arrange — two batches for the same user
    const clerkId = freshClerkId()
    const batchToUndo = randomUUID()
    const batchToKeep = randomUUID()
    await call(
      createManyCompleted,
      {
        items: [{ title: 'undo-1' }, { title: 'undo-2' }],
        importBatchId: batchToUndo,
      },
      authContext(clerkId),
    )
    await call(
      createManyCompleted,
      { items: [{ title: 'keep-1' }], importBatchId: batchToKeep },
      authContext(clerkId),
    )

    // Act
    const result = await call(
      deleteManyCompleted,
      { importBatchId: batchToUndo },
      authContext(clerkId),
    )

    // Assert — only the undone batch's rows are gone
    expect(result).toEqual({ count: 2 })
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    const undoneRows = await prisma.completed.count({
      where: { userId: user.id, importBatchId: batchToUndo },
    })
    const keptRows = await prisma.completed.count({
      where: { userId: user.id, importBatchId: batchToKeep },
    })
    expect(undoneRows).toBe(0)
    expect(keptRows).toBe(1)
  })

  it("does not delete another user's rows sharing the same importBatchId", async () => {
    // Arrange — two users; only the first imports under `sharedBatchId`. We
    // then try to undo it as the second user.
    const firstClerkId = freshClerkId()
    const secondClerkId = freshClerkId()
    const sharedBatchId = randomUUID()
    await call(
      createManyCompleted,
      { items: [{ title: 'first-user-row' }], importBatchId: sharedBatchId },
      authContext(firstClerkId),
    )
    // Materialize the second user.
    await call(
      createManyCompleted,
      { items: [{ title: 'second-user-seed' }], importBatchId: randomUUID() },
      authContext(secondClerkId),
    )

    // Act — second user attempts to undo the first user's batch id
    const result = await call(
      deleteManyCompleted,
      { importBatchId: sharedBatchId },
      authContext(secondClerkId),
    )

    // Assert — nothing deleted; the first user's row survives
    expect(result).toEqual({ count: 0 })
    const firstUser = await prisma.user.findUniqueOrThrow({
      where: { clerkId: firstClerkId },
    })
    const firstUserRows = await prisma.completed.count({
      where: { userId: firstUser.id, importBatchId: sharedBatchId },
    })
    expect(firstUserRows).toBe(1)
  })

  it('deletes nothing once the undo window has expired', async () => {
    // Arrange — import a batch, then backdate its createdAt past the 60s window.
    const clerkId = freshClerkId()
    const importBatchId = randomUUID()
    await call(
      createManyCompleted,
      { items: [{ title: 'too old to undo' }], importBatchId },
      authContext(clerkId),
    )
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
    // Push createdAt two minutes into the past so the window guard excludes it.
    await prisma.completed.updateMany({
      where: { userId: user.id, importBatchId },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    })

    // Act
    const result = await call(
      deleteManyCompleted,
      { importBatchId },
      authContext(clerkId),
    )

    // Assert — window expired, row remains
    expect(result).toEqual({ count: 0 })
    const remaining = await prisma.completed.count({
      where: { userId: user.id, importBatchId },
    })
    expect(remaining).toBe(1)
  })
})

describeIfDb(
  'completed.createMany heatmap-day stability after migration',
  () => {
    it('buckets an existing row with null completedAt on its createdAt day', async () => {
      // Arrange — simulate a pre-migration row whose completedAt was never set
      // (backfill is a no-op on an empty table, so we exercise the `?? createdAt`
      // coalesce directly). Insert a Completed row, then null its completedAt.
      const clerkId = freshClerkId()
      const importBatchId = randomUUID()
      await call(
        createManyCompleted,
        { items: [{ title: 'legacy row' }], importBatchId },
        authContext(clerkId),
      )
      const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
      const legacyCreatedAt = new Date('2026-03-15T08:30:00.000Z')
      await prisma.completed.updateMany({
        where: { userId: user.id, importBatchId },
        data: { completedAt: null, createdAt: legacyCreatedAt },
      })

      // Act — read the row the way the heatmap aggregation does
      const row = await prisma.completed.findFirstOrThrow({
        where: { userId: user.id, importBatchId },
        select: { completedAt: true, createdAt: true },
      })
      const bucketDate = (row.completedAt ?? row.createdAt)
        .toISOString()
        .split('T')[0]

      // Assert — falls back to createdAt's day, not migration-day
      expect(row.completedAt).toBeNull()
      expect(bucketDate).toBe('2026-03-15')
    })
  },
)
