// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { fetchCompletedEntries } from '../utils/completedAggregation'

import { createManyCompleted, getJournal } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-DB harness for `completed.journal` — the permanent win journal that the
 * home "Completed Tasks" list reads. Each test seeds completions the way the two
 * real write paths do (paste-import → `Completed` table; the main/floating app →
 * a completed `Todo`) and asserts the merged, newest-first, paginated feed. The
 * bug this guards: before the journal, the list read only `todo.list` so
 * `Completed`-table wins (import + braindump) NEVER appeared. Several sequential
 * DB round-trips per case → generous timeout so DB latency can't flake it.
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
  const clerkId = `test_journal_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

/**
 * Seeds one `Completed`-table win (the paste-import / braindump surface) at a
 * precise instant via the REAL import procedure, which lazily upserts the user +
 * default category on first call — so the read path sees a row written exactly
 * the way production writes it.
 */
async function seedCompletedRowAt(
  clerkId: string,
  title: string,
  completedAt: Date,
): Promise<void> {
  await call(
    createManyCompleted,
    { items: [{ title, completedAt }], importBatchId: randomUUID() },
    authContext(clerkId),
  )
}

/**
 * Seeds one completed `Todo` (the main/floating app surface) at a precise
 * instant. Writes the row directly rather than via `toggleTodo` because toggle
 * stamps `completedAt = now()`, which can't be ordered deterministically against
 * the other seeds. Requires the user + a category to already exist, so always
 * call {@link seedCompletedRowAt} first (it creates both).
 */
async function seedTodoCompletionAt(
  clerkId: string,
  title: string,
  completedAt: Date,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
  const category = await prisma.category.findFirstOrThrow({
    where: { userId: user.id },
  })
  await prisma.todo.create({
    data: {
      text: title,
      completed: true,
      completedAt,
      userId: user.id,
      categoryId: category.id,
    },
  })
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

describeIfDb('completed.journal (permanent win journal)', () => {
  it('surfaces wins from BOTH the Todo lifecycle and the Completed table in one feed', async () => {
    // Arrange — one imported Completed-table win (older) and one Todo-lifecycle
    // win (newer). Pre-journal the list read only todo.list, so the import never
    // showed; this is the exact regression.
    const clerkId = freshClerkId()
    await seedCompletedRowAt(
      clerkId,
      'imported win',
      new Date('2026-05-10T09:00:00.000Z'),
    )
    await seedTodoCompletionAt(
      clerkId,
      'lifecycle win',
      new Date('2026-05-10T12:00:00.000Z'),
    )

    // Act
    const page = await call(
      getJournal,
      { limit: 20, offset: 0 },
      authContext(clerkId),
    )

    // Assert — both rows present, newest-first, each tagged with its source.
    expect(page.total).toBe(2)
    expect(page.entries.map((entry) => entry.title)).toEqual([
      'lifecycle win',
      'imported win',
    ])
    expect(page.entries.map((entry) => entry.source)).toEqual([
      'todo',
      'completed',
    ])
    expect(page.hasMore).toBe(false)
  })

  it('orders the merged feed newest-completed first regardless of source', async () => {
    // Arrange — three wins interleaved across the two sources at distinct times.
    const clerkId = freshClerkId()
    await seedCompletedRowAt(
      clerkId,
      'early import',
      new Date('2026-05-12T09:00:00.000Z'),
    )
    await seedTodoCompletionAt(
      clerkId,
      'midday todo',
      new Date('2026-05-12T12:00:00.000Z'),
    )
    await seedCompletedRowAt(
      clerkId,
      'late import',
      new Date('2026-05-12T15:00:00.000Z'),
    )

    // Act
    const page = await call(
      getJournal,
      { limit: 20, offset: 0 },
      authContext(clerkId),
    )

    // Assert — strictly newest-first by completion time, crossing source.
    expect(page.entries.map((entry) => entry.title)).toEqual([
      'late import',
      'midday todo',
      'early import',
    ])
  })

  it('paginates with limit/offset and reports total, hasMore, and nextOffset', async () => {
    // Arrange — three Completed-table wins at distinct ascending times.
    const clerkId = freshClerkId()
    await seedCompletedRowAt(
      clerkId,
      'win 1',
      new Date('2026-05-14T09:00:00.000Z'),
    )
    await seedCompletedRowAt(
      clerkId,
      'win 2',
      new Date('2026-05-14T10:00:00.000Z'),
    )
    await seedCompletedRowAt(
      clerkId,
      'win 3',
      new Date('2026-05-14T11:00:00.000Z'),
    )

    // Act — two pages of size 2.
    const firstPage = await call(
      getJournal,
      { limit: 2, offset: 0 },
      authContext(clerkId),
    )
    const secondPage = await call(
      getJournal,
      { limit: 2, offset: 2 },
      authContext(clerkId),
    )

    // Assert — newest two first with more to come, then the remainder.
    expect(firstPage.total).toBe(3)
    expect(firstPage.entries.map((entry) => entry.title)).toEqual([
      'win 3',
      'win 2',
    ])
    expect(firstPage.hasMore).toBe(true)
    expect(firstPage.nextOffset).toBe(2)

    expect(secondPage.entries.map((entry) => entry.title)).toEqual(['win 1'])
    expect(secondPage.hasMore).toBe(false)
    expect(secondPage.nextOffset).toBeUndefined()
  })

  it('agrees with fetchCompletedEntries (the heatmap source of truth) on what counts as a completion', async () => {
    // Arrange — a cross-source mix at distinct times (no ties, so both orderings
    // are pure completedAt and reverse-match cleanly).
    const clerkId = freshClerkId()
    await seedCompletedRowAt(
      clerkId,
      'c-old',
      new Date('2026-05-16T09:00:00.000Z'),
    )
    await seedTodoCompletionAt(
      clerkId,
      't-mid',
      new Date('2026-05-16T12:00:00.000Z'),
    )
    await seedCompletedRowAt(
      clerkId,
      'c-new',
      new Date('2026-05-16T15:00:00.000Z'),
    )
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })

    // Act — the journal (newest-first) and the heatmap reader (oldest-first) over
    // a range wide enough to include every seed.
    const journal = await call(
      getJournal,
      { limit: 100, offset: 0 },
      authContext(clerkId),
    )
    const aggregation = await fetchCompletedEntries(
      user.id,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-12-31T23:59:59.999Z'),
    )

    // Assert — same union, mirror order: journal === aggregation reversed, keyed
    // by source:id so the two readers can never disagree about completions.
    const journalKeys = journal.entries.map(
      (entry) => `${entry.source}:${entry.id}`,
    )
    const aggregationKeys = aggregation
      .map((entry) => `${entry.source}:${entry.id}`)
      .reverse()
    expect(journalKeys).toEqual(aggregationKeys)
    expect(journal.total).toBe(aggregation.length)
  })
})
