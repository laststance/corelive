// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import {
  categoryTable,
  completedTable,
  importBatchTable,
  todoTable,
  userTable,
} from '@/db/schema'

import { fetchCompletedEntries } from '../utils/completedAggregation'

import { listCategories } from './category'
import { getJournal } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-DB harness for `completed.journal` — the permanent win journal that the
 * home "Completed Tasks" list reads. Each test seeds completions the way the two
 * real write paths do (paste-import → `Completed` table; the retired todo UI →
 * a completed `Todo`) and asserts the merged, newest-first, paginated feed. The
 * bug this guards: before the journal, the list read only `todo.list` so
 * `Completed`-table wins (import + liveEditor) NEVER appeared. Several sequential
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
 * Seeds one `Completed`-table win (the LiveEditor check-off surface) at a
 * precise instant, lazily upserting the user + default category on first call —
 * so the read path sees a row written exactly the way production writes it.
 */
async function seedCompletedRowAt(
  clerkId: string,
  title: string,
  completedAt: Date,
): Promise<void> {
  await seedCompletedTableRow(clerkId, title, completedAt)
}

/**
 * Writes one `Completed` row for `clerkId` at an exact instant, lazily creating
 * the DB user (via the real auth middleware) and the default "General" category
 * the way the Clerk webhook / seed do.
 *
 * @param clerkId - Clerk identity whose real DB user owns the completion.
 * @param title - Observable row title the assertions look for.
 * @param completedAt - Exact semantic completion instant.
 * @returns Nothing once the row is persisted.
 * @example
 * await seedCompletedTableRow('test_x', 'gym', new Date('2026-05-10T09:00:00Z'))
 */
async function seedCompletedTableRow(
  clerkId: string,
  title: string,
  completedAt: Date,
): Promise<void> {
  // Any authed procedure triggers authMiddleware's lazy user upsert; list is
  // the cheapest read-only one.
  await call(listCategories, undefined, authContext(clerkId))
  const user = requireRow(
    await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
      .limit(1),
    'user.findUniqueOrThrow',
  )
  // Get-or-create "General": an existing row is left untouched, then read back.
  await db
    .insert(categoryTable)
    .values({
      name: 'General',
      color: 'blue',
      isDefault: true,
      userId: user.id,
    })
    .onConflictDoNothing({ target: [categoryTable.name, categoryTable.userId] })
  const category = requireRow(
    await db
      .select()
      .from(categoryTable)
      .where(
        and(
          eq(categoryTable.name, 'General'),
          eq(categoryTable.userId, user.id),
        ),
      )
      .limit(1),
    'category.upsert',
  )
  await db
    .insert(completedTable)
    .values({ title, completedAt, userId: user.id, categoryId: category.id })
}

/**
 * Seeds a completed Todo at a deterministic instant after `seedCompletedRowAt` creates its real user/category.
 * Writes the row directly because no production path stamps an arbitrary past completion instant.
 * @param clerkId - Clerk identity whose real DB user owns the completion.
 * @param title - Observable row title asserted by the journal tests.
 * @param completedAt - Exact semantic completion instant.
 * @param categoryId - Optional category override; defaults to the first user category.
 * @returns Nothing after the completed Todo row is persisted.
 * @example
 * await seedTodoCompletionAt(clerkId, 'ship filters', new Date('2026-07-14T09:00:00Z'), categoryId)
 */
async function seedTodoCompletionAt(
  clerkId: string,
  title: string,
  completedAt: Date,
  categoryId?: number,
): Promise<void> {
  const user = requireRow(
    await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
      .limit(1),
    'user.findUniqueOrThrow',
  )
  const resolvedCategoryId =
    categoryId ??
    requireRow(
      await db
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.userId, user.id))
        .limit(1),
      'category.findFirstOrThrow',
    ).id
  await db.insert(todoTable).values({
    text: title,
    completed: true,
    completedAt,
    userId: user.id,
    categoryId: resolvedCategoryId,
  })
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
      .limit(1)
    if (!user) continue
    // FK-safe teardown: child rows before the user.
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db
      .delete(importBatchTable)
      .where(eq(importBatchTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('completed.journal (permanent win journal)', () => {
  test('surfaces wins from BOTH the Todo lifecycle and the Completed table in one feed', async () => {
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

  test('orders the merged feed newest-completed first regardless of source', async () => {
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

  test('paginates with limit/offset and reports total, hasMore, and nextOffset', async () => {
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

  test('filters both completion sources by a half-open period and category before pagination', async () => {
    // Arrange — create the real user/default category through the import path,
    // then add a second category with rows on each date boundary and source.
    const clerkId = freshClerkId()
    await seedCompletedRowAt(
      clerkId,
      'outside before period',
      new Date('2026-05-31T23:59:59.999Z'),
    )
    const user = requireRow(
      await db
        .select()
        .from(userTable)
        .where(eq(userTable.clerkId, clerkId))
        .limit(1),
      'user.findUniqueOrThrow',
    )
    const focusCategory = requireRow(
      await db
        .insert(categoryTable)
        .values({
          name: 'Focus',
          color: 'amber',
          userId: user.id,
        })
        .returning(),
      'category.create',
    )
    const generalCategory = requireRow(
      await db
        .select()
        .from(categoryTable)
        .where(
          and(
            eq(categoryTable.userId, user.id),
            eq(categoryTable.isDefault, true),
          ),
        )
        .limit(1),
      'category.findFirstOrThrow',
    )
    await db.insert(completedTable).values([
      {
        title: 'focus lower boundary',
        completedAt: new Date('2026-06-01T00:00:00.000Z'),
        categoryId: focusCategory.id,
        userId: user.id,
      },
      {
        title: 'other category inside period',
        completedAt: new Date('2026-06-20T08:00:00.000Z'),
        categoryId: generalCategory.id,
        userId: user.id,
      },
      {
        title: 'focus upper boundary',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        categoryId: focusCategory.id,
        userId: user.id,
      },
    ])
    await seedTodoCompletionAt(
      clerkId,
      'focus todo inside period',
      new Date('2026-06-25T12:00:00.000Z'),
      focusCategory.id,
    )

    // Act — the upper bound is exclusive so adjacent presets never overlap.
    const page = await call(
      getJournal,
      {
        limit: 20,
        offset: 0,
        categoryId: focusCategory.id,
        completedFrom: new Date('2026-06-01T00:00:00.000Z'),
        completedBefore: new Date('2026-07-01T00:00:00.000Z'),
      },
      authContext(clerkId),
    )

    // Assert — list and count share the same pre-pagination predicates.
    expect(page.total).toBe(2)
    expect(page.entries.map((entry) => entry.title)).toEqual([
      'focus todo inside period',
      'focus lower boundary',
    ])
    expect(page.entries.map((entry) => entry.source)).toEqual([
      'todo',
      'completed',
    ])
    expect(page.hasMore).toBe(false)
    expect(page.nextOffset).toBeUndefined()
  })

  test('agrees with fetchCompletedEntries (the heatmap source of truth) on what counts as a completion', async () => {
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
    const user = requireRow(
      await db
        .select()
        .from(userTable)
        .where(eq(userTable.clerkId, clerkId))
        .limit(1),
      'user.findUniqueOrThrow',
    )

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
