// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { and, eq, isNotNull } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import {
  categoryTable,
  completedTable,
  todoTable,
  userTable,
} from '@/db/schema'
import { describeIfDb } from '@/server/procedures/describeIfDb'

import { fetchCompletedEntries } from './completedAggregation'

/**
 * Real-DB suite for the Todo+Completed UNION behind the heatmap and day
 * detail. Every case seeds its own user so `fetchCompletedEntries(userId, …)`
 * sees only that case's rows. Several sequential DB round trips per case, so
 * the suite gets a generous timeout.
 */
vi.setConfig({ testTimeout: 30_000 })

const RANGE_START = new Date('2026-05-04T00:00:00.000Z')
const RANGE_END = new Date('2026-05-10T23:59:59.999Z')

/** A seeded account plus the one category its rows are filed under. */
type SeededOwner = {
  userId: number
  category: { id: number; name: string; color: string }
}

// Every user a test seeds, so teardown removes exactly the rows it made.
const createdUserIds = new Set<number>()

/**
 * Inserts a fresh user and one category, the minimum every Todo/Completed row needs (both FKs are required).
 * @param categoryName - Name of the owner's category.
 * @param categoryColor - Color of the owner's category.
 * @returns The new user's id and the category's id/name/color.
 * @example
 * await seedOwner('writing', 'blue') // => { userId: 41, category: { id: 88, name: 'writing', color: 'blue' } }
 */
async function seedOwner(
  categoryName = 'General',
  categoryColor = 'blue',
): Promise<SeededOwner> {
  const user = requireRow(
    await db
      .insert(userTable)
      .values({ clerkId: `test_aggregation_${randomUUID()}` })
      .returning({ id: userTable.id }),
    'user.insert',
  )
  createdUserIds.add(user.id)
  const category = requireRow(
    await db
      .insert(categoryTable)
      .values({ name: categoryName, color: categoryColor, userId: user.id })
      .returning({
        id: categoryTable.id,
        name: categoryTable.name,
        color: categoryTable.color,
      }),
    'category.insert',
  )
  return { userId: user.id, category }
}

/**
 * Inserts one Todo row for `owner` with explicit instants (the legacy Todo history the heatmap still reads).
 * @param owner - Seeded account and category the row belongs to.
 * @param todo - Text, completion flag and the exact `completedAt` / `updatedAt` to store.
 * @returns The stored row's id.
 * @example
 * await insertTodo(owner, { text: 'draft digest', completed: true, updatedAt: new Date('2026-05-10T15:00:00.000Z') })
 */
async function insertTodo(
  owner: SeededOwner,
  todo: Pick<
    typeof todoTable.$inferInsert,
    'text' | 'completed' | 'completedAt' | 'updatedAt'
  >,
): Promise<number> {
  const row = requireRow(
    await db
      .insert(todoTable)
      .values({
        ...todo,
        userId: owner.userId,
        categoryId: owner.category.id,
      })
      .returning({ id: todoTable.id }),
    'todo.insert',
  )
  return row.id
}

/**
 * Inserts one Completed row for `owner` with explicit instants (the LiveEditor / import surface).
 * @param owner - Seeded account and category the row belongs to.
 * @param completed - Title, archive flag and the exact `completedAt` / `createdAt` to store.
 * @returns The stored row's id.
 * @example
 * await insertCompleted(owner, { title: 'buy milk', createdAt: new Date('2026-05-09T18:30:00.000Z') })
 */
async function insertCompleted(
  owner: SeededOwner,
  completed: Pick<
    typeof completedTable.$inferInsert,
    'title' | 'archived' | 'completedAt' | 'createdAt'
  >,
): Promise<number> {
  const row = requireRow(
    await db
      .insert(completedTable)
      .values({
        ...completed,
        userId: owner.userId,
        categoryId: owner.category.id,
      })
      .returning({ id: completedTable.id }),
    'completed.insert',
  )
  return row.id
}

afterEach(async () => {
  for (const userId of createdUserIds) {
    // Todo/Completed rows restrict their category's and user's delete, so they go first.
    await db.delete(completedTable).where(eq(completedTable.userId, userId))
    await db.delete(todoTable).where(eq(todoTable.userId, userId))
    await db
      .delete(categoryTable)
      .where(
        and(
          eq(categoryTable.userId, userId),
          isNotNull(categoryTable.parentId),
        ),
      )
    await db.delete(categoryTable).where(eq(categoryTable.userId, userId))
    await db.delete(userTable).where(eq(userTable.id, userId))
  }
  createdUserIds.clear()
})

describeIfDb('fetchCompletedEntries', () => {
  test('returns an empty array when neither table has rows in the range', async () => {
    // Arrange
    const owner = await seedOwner()

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert
    expect(entries).toEqual([])
  })

  test('maps Todo rows with source="todo" using completedAt as the bucket day', async () => {
    // Arrange — a completed Todo whose stable completedAt differs from updatedAt
    // (completed earlier, then edited). The heatmap must use completedAt.
    const owner = await seedOwner('writing', 'blue')
    const todoId = await insertTodo(owner, {
      text: 'draft digest',
      completed: true,
      completedAt: new Date('2026-05-07T10:00:00.000Z'),
      updatedAt: new Date('2026-05-10T15:00:00.000Z'),
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert — completedAt (05-07) wins, NOT the edit-day updatedAt (05-10)
    expect(entries).toEqual([
      {
        source: 'todo',
        id: todoId,
        title: 'draft digest',
        completedAt: new Date('2026-05-07T10:00:00.000Z'),
        category: {
          id: owner.category.id,
          name: 'writing',
          color: 'blue',
          parent: null,
        },
      },
    ])
  })

  test('falls back to updatedAt when a Todo row has a null completedAt', async () => {
    // Arrange — an unconverted / pre-backfill completed Todo (null completedAt)
    // must coalesce to updatedAt so it never vanishes from the heatmap.
    const owner = await seedOwner()
    await insertTodo(owner, {
      text: 'legacy completed todo',
      completed: true,
      completedAt: null,
      updatedAt: new Date('2026-05-06T12:00:00.000Z'),
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert — bucket date is updatedAt's day, not null
    expect(entries[0]?.completedAt).toEqual(
      new Date('2026-05-06T12:00:00.000Z'),
    )
  })

  test('maps Completed rows with source="completed" using createdAt as completedAt', async () => {
    // Arrange
    const owner = await seedOwner()
    const completedId = await insertCompleted(owner, {
      title: 'buy milk',
      createdAt: new Date('2026-05-09T18:30:00.000Z'),
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert
    expect(entries).toEqual([
      {
        source: 'completed',
        id: completedId,
        title: 'buy milk',
        completedAt: new Date('2026-05-09T18:30:00.000Z'),
        // The legacy mock fed `category: null`; a real row must reference a real category (NOT NULL FK).
        category: {
          id: owner.category.id,
          name: 'General',
          color: 'blue',
          parent: null,
        },
      },
    ])
  })

  test('buckets a Completed row by completedAt when it differs from createdAt (dated import)', async () => {
    // Arrange — a paste-imported row whose semantic completion day (completedAt)
    // is earlier than its insert time (createdAt). The heatmap must use
    // completedAt so the row lands on the day it actually happened.
    const owner = await seedOwner()
    await insertCompleted(owner, {
      title: 'gym last week',
      completedAt: new Date('2026-05-05T09:00:00.000Z'),
      createdAt: new Date('2026-05-09T18:30:00.000Z'),
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert — completedAt wins over createdAt
    expect(entries[0]?.completedAt).toEqual(
      new Date('2026-05-05T09:00:00.000Z'),
    )
  })

  test('falls back to createdAt when a Completed row has a null completedAt (existing-row stability)', async () => {
    // Arrange — a pre-migration row the backfill conceptually covers; a null
    // completedAt must coalesce to createdAt so old rows keep their heatmap day
    // (they do NOT jump to migration-day).
    const owner = await seedOwner()
    await insertCompleted(owner, {
      title: 'legacy completed row',
      completedAt: null,
      createdAt: new Date('2026-05-06T12:00:00.000Z'),
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert — bucket date is createdAt's day, not null/migration-day
    expect(entries[0]?.completedAt).toEqual(
      new Date('2026-05-06T12:00:00.000Z'),
    )
  })

  test('UNIONs rows from both tables sorted ascending by completedAt', async () => {
    // Arrange — the Todo is inserted first but completed later than the
    // Completed row, so the sort needs to flip them relative to insertion order.
    const owner = await seedOwner()
    await insertTodo(owner, {
      text: 'todo-later',
      completed: true,
      updatedAt: new Date('2026-05-09T08:00:00.000Z'),
    })
    await insertCompleted(owner, {
      title: 'completed-earlier',
      createdAt: new Date('2026-05-06T08:00:00.000Z'),
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert
    expect(entries.map((entry) => entry.source)).toEqual(['completed', 'todo'])
  })

  test('breaks identical-timestamp ties with todo first, then by id', async () => {
    // Arrange — all rows on the same instant: todo should win the tie, then
    // ascending id. Locks the deterministic ordering documented inline in the sort.
    const sameInstant = new Date('2026-05-08T12:00:00.000Z')
    const owner = await seedOwner()
    const lowerTodoId = await insertTodo(owner, {
      text: 'todo-2',
      completed: true,
      updatedAt: sameInstant,
    })
    const higherTodoId = await insertTodo(owner, {
      text: 'todo-5',
      completed: true,
      updatedAt: sameInstant,
    })
    const completedId = await insertCompleted(owner, {
      title: 'completed-9',
      createdAt: sameInstant,
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert
    expect(
      entries.map((entry) => ({ source: entry.source, id: entry.id })),
    ).toEqual([
      { source: 'todo', id: lowerTodoId },
      { source: 'todo', id: higherTodoId },
      { source: 'completed', id: completedId },
    ])
  })

  test('returns only the owner’s completed Todos whose completedAt, or updatedAt when completedAt is null, falls inside the inclusive range', async () => {
    // Arrange — one row per filter branch, plus another user's in-range Todo
    const owner = await seedOwner()
    const otherOwner = await seedOwner()
    await insertTodo(owner, {
      text: 'completedAt on the range start',
      completed: true,
      completedAt: RANGE_START,
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    })
    await insertTodo(owner, {
      text: 'completedAt in range, edited after it',
      completed: true,
      completedAt: new Date('2026-05-05T09:00:00.000Z'),
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    })
    await insertTodo(owner, {
      text: 'null completedAt, updatedAt in range',
      completed: true,
      completedAt: null,
      updatedAt: new Date('2026-05-06T09:00:00.000Z'),
    })
    await insertTodo(owner, {
      text: 'completedAt on the range end',
      completed: true,
      completedAt: RANGE_END,
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    })
    await insertTodo(owner, {
      text: 'open todo updated in range',
      completed: false,
      completedAt: null,
      updatedAt: new Date('2026-05-07T09:00:00.000Z'),
    })
    await insertTodo(owner, {
      text: 'completedAt before the range, updatedAt in range',
      completed: true,
      completedAt: new Date('2026-04-20T09:00:00.000Z'),
      updatedAt: new Date('2026-05-07T09:00:00.000Z'),
    })
    await insertTodo(owner, {
      text: 'null completedAt, updatedAt after the range',
      completed: true,
      completedAt: null,
      updatedAt: new Date('2026-05-11T00:00:00.000Z'),
    })
    await insertTodo(otherOwner, {
      text: 'another user’s completed todo',
      completed: true,
      completedAt: new Date('2026-05-07T09:00:00.000Z'),
      updatedAt: new Date('2026-05-07T09:00:00.000Z'),
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert
    expect(
      entries.map((entry) => ({
        source: entry.source,
        title: entry.title,
        completedAt: entry.completedAt,
      })),
    ).toEqual([
      {
        source: 'todo',
        title: 'completedAt on the range start',
        completedAt: new Date('2026-05-04T00:00:00.000Z'),
      },
      {
        source: 'todo',
        title: 'completedAt in range, edited after it',
        completedAt: new Date('2026-05-05T09:00:00.000Z'),
      },
      {
        source: 'todo',
        title: 'null completedAt, updatedAt in range',
        completedAt: new Date('2026-05-06T09:00:00.000Z'),
      },
      {
        source: 'todo',
        title: 'completedAt on the range end',
        completedAt: new Date('2026-05-10T23:59:59.999Z'),
      },
    ])
  })

  test('returns only the owner’s unarchived Completed rows whose completedAt, or createdAt when completedAt is null, falls inside the inclusive range', async () => {
    // Arrange — one row per filter branch, plus another user's in-range row
    const owner = await seedOwner()
    const otherOwner = await seedOwner()
    await insertCompleted(owner, {
      title: 'completedAt on the range start',
      completedAt: RANGE_START,
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
    })
    await insertCompleted(owner, {
      title: 'completedAt in range, imported after it',
      completedAt: new Date('2026-05-05T09:00:00.000Z'),
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
    })
    await insertCompleted(owner, {
      title: 'null completedAt, createdAt in range',
      completedAt: null,
      createdAt: new Date('2026-05-06T09:00:00.000Z'),
    })
    await insertCompleted(owner, {
      title: 'completedAt on the range end',
      completedAt: RANGE_END,
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
    })
    await insertCompleted(owner, {
      title: 'archived row in range',
      archived: true,
      completedAt: new Date('2026-05-07T09:00:00.000Z'),
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
    await insertCompleted(owner, {
      title: 'completedAt before the range, createdAt in range',
      completedAt: new Date('2026-04-20T09:00:00.000Z'),
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
    await insertCompleted(owner, {
      title: 'null completedAt, createdAt after the range',
      completedAt: null,
      createdAt: new Date('2026-05-11T00:00:00.000Z'),
    })
    await insertCompleted(otherOwner, {
      title: 'another user’s completed row',
      completedAt: new Date('2026-05-07T09:00:00.000Z'),
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert
    expect(
      entries.map((entry) => ({
        source: entry.source,
        title: entry.title,
        completedAt: entry.completedAt,
      })),
    ).toEqual([
      {
        source: 'completed',
        title: 'completedAt on the range start',
        completedAt: new Date('2026-05-04T00:00:00.000Z'),
      },
      {
        source: 'completed',
        title: 'completedAt in range, imported after it',
        completedAt: new Date('2026-05-05T09:00:00.000Z'),
      },
      {
        source: 'completed',
        title: 'null completedAt, createdAt in range',
        completedAt: new Date('2026-05-06T09:00:00.000Z'),
      },
      {
        source: 'completed',
        title: 'completedAt on the range end',
        completedAt: new Date('2026-05-10T23:59:59.999Z'),
      },
    ])
  })

  test('uses Todo.completedAt over updatedAt so a later edit does NOT drift the heatmap day', async () => {
    // Arrange — the migration to a stable Todo.completedAt resolved the old
    // drift: editing a long-completed Todo used to bump its heatmap bucket to
    // the edit day. Now completedAt holds the real completion day regardless
    // of later edits.
    const completionDay = new Date('2026-05-07T09:00:00.000Z')
    const laterEdit = new Date('2026-05-10T15:00:00.000Z')
    const owner = await seedOwner()
    await insertTodo(owner, {
      text: 'long-completed todo, edited today',
      completed: true,
      completedAt: completionDay,
      updatedAt: laterEdit,
    })

    // Act
    const entries = await fetchCompletedEntries(
      owner.userId,
      RANGE_START,
      RANGE_END,
    )

    // Assert
    expect(entries[0]?.completedAt).toEqual(completionDay)
  })
  test('uses one hierarchy snapshot when a child moves while one completion source is blocked', async () => {
    // Arrange — only Completed is locked, so the old parallel Todo read could finish under the old parent.
    const owner = await seedOwner('CoreLive')
    const [work] = await db
      .insert(categoryTable)
      .values({ name: 'Work', userId: owner.userId })
      .returning()
    const [personal] = await db
      .insert(categoryTable)
      .values({ name: 'Personal', userId: owner.userId })
      .returning()
    await db
      .update(categoryTable)
      .set({ parentId: work!.id })
      .where(eq(categoryTable.id, owner.category.id))
    const instant = new Date('2026-05-07T09:00:00.000Z')
    await insertTodo(owner, {
      text: 'Legacy entry',
      completed: true,
      completedAt: instant,
      updatedAt: instant,
    })
    await insertCompleted(owner, {
      title: 'Kept entry',
      createdAt: instant,
      completedAt: instant,
    })
    const holder = await db.$client.connect()
    let reading:
      Promise<Awaited<ReturnType<typeof fetchCompletedEntries>>> | undefined
    try {
      const { rows } = await holder.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      )
      const holderPid = rows[0]?.pid
      if (holderPid === undefined) throw new Error('Lock holder PID missing')
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE "Completed" IN ACCESS EXCLUSIVE MODE')
      reading = fetchCompletedEntries(owner.userId, RANGE_START, RANGE_END)
      await vi.waitFor(async () => {
        const result = await db.$client.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
          [holderPid],
        )
        expect(result.rows[0]?.count).toBeGreaterThanOrEqual(1)
      })
      // Act — change the parent after the request has started and before its blocked source can finish.
      await db
        .update(categoryTable)
        .set({ parentId: personal!.id })
        .where(eq(categoryTable.id, owner.category.id))
      await holder.query('COMMIT')
      const entries = await reading
      // Assert — neither source can report the former parent while the other reports the current parent.
      expect(
        entries.map((entry) => [entry.source, entry.category.parent?.name]),
      ).toEqual([
        ['todo', 'Personal'],
        ['completed', 'Personal'],
      ])
      expect(entries.map((entry) => entry.completedAt.toISOString())).toEqual([
        '2026-05-07T09:00:00.000Z',
        '2026-05-07T09:00:00.000Z',
      ])
    } finally {
      await holder.query('ROLLBACK')
      holder.release()
      await reading?.catch(() => undefined)
    }
  })
})
