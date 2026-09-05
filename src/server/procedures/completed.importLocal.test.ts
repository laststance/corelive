// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { listCategories } from './category'
import { importLocalCompleted } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-DB harness for `completed.importLocal` — the one-time merge that carries
 * a visitor's signed-out `/write` keeps into the account they just made. The
 * things that would silently ruin someone's history if they broke: repeated
 * titles collapsing (repetition is the habit signal this app counts), the
 * original timestamps being replaced by import time (a year of keeps landing on
 * one heatmap cell), and a retried batch importing twice. Several sequential DB
 * round-trips per case → generous timeout so DB latency can't flake it.
 */
vi.setConfig({ testTimeout: 30_000 })

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

/** Materialises the DB user the way production does — any authed read triggers the middleware's lazy upsert. */
async function ensureUser(clerkId: string): Promise<{ id: number }> {
  await call(listCategories, undefined, authContext(clerkId))
  return prisma.user.findUniqueOrThrow({ where: { clerkId } })
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

describeIfDb('completed.importLocal', () => {
  it('imports every repeated title as its own row instead of collapsing them', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const user = await ensureUser(clerkId)

    // Act
    const result = await call(
      importLocalCompleted,
      {
        batchId: randomUUID(),
        items: [
          {
            localId: 'k1',
            title: 'push-ups',
            completedAt: new Date('2026-09-01T09:00:00Z'),
          },
          {
            localId: 'k2',
            title: 'push-ups',
            completedAt: new Date('2026-09-02T09:00:00Z'),
          },
          {
            localId: 'k3',
            title: 'push-ups',
            completedAt: new Date('2026-09-03T09:00:00Z'),
          },
        ],
      },
      authContext(clerkId),
    )

    // Assert
    expect(result.imported).toBe(3)
    expect(result.alreadyImported).toBe(false)
    const rows = await prisma.completed.findMany({
      where: { userId: user.id, title: 'push-ups' },
    })
    expect(rows).toHaveLength(3)
  })

  it('files each imported keep on the day it happened, not the day it was imported', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const user = await ensureUser(clerkId)
    const happenedAt = new Date('2026-07-04T12:34:56.000Z')

    // Act
    await call(
      importLocalCompleted,
      {
        batchId: randomUUID(),
        items: [{ localId: 'k4', title: 'gym', completedAt: happenedAt }],
      },
      authContext(clerkId),
    )

    // Assert
    const row = await prisma.completed.findFirstOrThrow({
      where: { userId: user.id, title: 'gym' },
    })
    expect(row.completedAt?.toISOString()).toBe('2026-07-04T12:34:56.000Z')
  })

  it('re-sending a batch after a lost response imports nothing a second time', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const user = await ensureUser(clerkId)
    const batchId = randomUUID()
    const items = [
      {
        localId: 'k5',
        title: 'read',
        completedAt: new Date('2026-08-01T09:00:00Z'),
      },
      {
        localId: 'k6',
        title: 'read',
        completedAt: new Date('2026-08-02T09:00:00Z'),
      },
    ]
    await call(importLocalCompleted, { batchId, items }, authContext(clerkId))

    // Act
    const retry = await call(
      importLocalCompleted,
      { batchId, items },
      authContext(clerkId),
    )

    // Assert
    expect(retry.alreadyImported).toBe(true)
    expect(retry.imported).toBe(0)
    const rows = await prisma.completed.findMany({
      where: { userId: user.id, title: 'read' },
    })
    expect(rows).toHaveLength(2)
  })

  it('two accounts can import under the same client batch id without blocking each other', async () => {
    // Arrange
    const firstClerkId = freshClerkId()
    const secondClerkId = freshClerkId()
    const firstUser = await ensureUser(firstClerkId)
    const secondUser = await ensureUser(secondClerkId)
    const sharedBatchId = randomUUID()
    const items = [
      {
        localId: 'k7',
        title: 'walk',
        completedAt: new Date('2026-08-10T09:00:00Z'),
      },
    ]

    // Act
    await call(
      importLocalCompleted,
      { batchId: sharedBatchId, items },
      authContext(firstClerkId),
    )
    const second = await call(
      importLocalCompleted,
      { batchId: sharedBatchId, items },
      authContext(secondClerkId),
    )

    // Assert
    expect(second.alreadyImported).toBe(false)
    expect(
      await prisma.completed.count({ where: { userId: firstUser.id } }),
    ).toBe(1)
    expect(
      await prisma.completed.count({ where: { userId: secondUser.id } }),
    ).toBe(1)
  })

  it('a keep re-sent under a fresh batch id lands once, not twice', async () => {
    // Arrange — the first batch committed but its tag was lost (or a second
    // tab claimed the same keep under its own batch id), so the keep comes back
    // under a NEW batch id. Batch-level dedup cannot see this; only the keep's
    // own id can.
    const clerkId = freshClerkId()
    const user = await ensureUser(clerkId)
    const items = [
      {
        localId: 'keep-1',
        title: 'meditate',
        completedAt: new Date('2026-08-15T09:00:00Z'),
      },
    ]
    await call(
      importLocalCompleted,
      { batchId: randomUUID(), items },
      authContext(clerkId),
    )

    // Act
    const resent = await call(
      importLocalCompleted,
      { batchId: randomUUID(), items },
      authContext(clerkId),
    )

    // Assert
    expect(resent.alreadyImported).toBe(false)
    expect(resent.imported).toBe(0)
    const rows = await prisma.completed.findMany({
      where: { userId: user.id, title: 'meditate' },
    })
    expect(rows).toHaveLength(1)
  })

  it('merges into a freshly seeded category when the account has none', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const user = await ensureUser(clerkId)
    await prisma.category.deleteMany({ where: { userId: user.id } })

    // Act
    const result = await call(
      importLocalCompleted,
      {
        batchId: randomUUID(),
        items: [
          {
            localId: 'k8',
            title: 'stretch',
            completedAt: new Date('2026-08-20T09:00:00Z'),
          },
        ],
      },
      authContext(clerkId),
    )

    // Assert
    expect(result.imported).toBe(1)
    const row = await prisma.completed.findFirstOrThrow({
      where: { userId: user.id, title: 'stretch' },
      include: { category: true },
    })
    expect(row.category.name).toBe('General')
  })
})
