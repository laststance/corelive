import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { fetchCompletedEntries } from './completedAggregation'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    todo: { findMany: vi.fn() },
    completed: { findMany: vi.fn() },
  },
}))

const mockedTodoFindMany = vi.mocked(prisma.todo.findMany)
const mockedCompletedFindMany = vi.mocked(prisma.completed.findMany)

const RANGE_START = new Date('2026-05-04T00:00:00.000Z')
const RANGE_END = new Date('2026-05-10T23:59:59.999Z')

beforeEach(() => {
  mockedTodoFindMany.mockReset()
  mockedCompletedFindMany.mockReset()
})

describe('fetchCompletedEntries', () => {
  it('returns an empty array when neither table has rows in the range', async () => {
    mockedTodoFindMany.mockResolvedValue([])
    mockedCompletedFindMany.mockResolvedValue([])

    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)
    expect(entries).toEqual([])
  })

  it('maps Todo rows with source="todo" using completedAt as the bucket day', async () => {
    // Arrange — a completed Todo whose stable completedAt differs from updatedAt
    // (completed earlier, then edited). The heatmap must use completedAt.
    mockedTodoFindMany.mockResolvedValue([
      {
        id: 12,
        text: 'draft digest',
        completedAt: new Date('2026-05-07T10:00:00.000Z'),
        updatedAt: new Date('2026-05-10T15:00:00.000Z'),
        category: { id: 3, name: 'writing', color: 'blue' },
      },
    ] as never)
    mockedCompletedFindMany.mockResolvedValue([])

    // Act
    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)

    // Assert — completedAt (05-07) wins, NOT the edit-day updatedAt (05-10)
    expect(entries).toEqual([
      {
        source: 'todo',
        id: 12,
        title: 'draft digest',
        completedAt: new Date('2026-05-07T10:00:00.000Z'),
        category: { id: 3, name: 'writing', color: 'blue' },
      },
    ])
  })

  it('falls back to updatedAt when a Todo row has a null completedAt', async () => {
    // Arrange — an unconverted / pre-backfill completed Todo (null completedAt)
    // must coalesce to updatedAt so it never vanishes from the heatmap.
    mockedTodoFindMany.mockResolvedValue([
      {
        id: 13,
        text: 'legacy completed todo',
        completedAt: null,
        updatedAt: new Date('2026-05-06T12:00:00.000Z'),
        category: null,
      },
    ] as never)
    mockedCompletedFindMany.mockResolvedValue([])

    // Act
    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)

    // Assert — bucket date is updatedAt's day, not null
    expect(entries[0]?.completedAt).toEqual(
      new Date('2026-05-06T12:00:00.000Z'),
    )
  })

  it('maps Completed rows with source="completed" using createdAt as completedAt', async () => {
    mockedTodoFindMany.mockResolvedValue([])
    mockedCompletedFindMany.mockResolvedValue([
      {
        id: 42,
        title: 'buy milk',
        createdAt: new Date('2026-05-09T18:30:00.000Z'),
        category: null,
      },
    ] as never)

    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)
    expect(entries).toEqual([
      {
        source: 'completed',
        id: 42,
        title: 'buy milk',
        completedAt: new Date('2026-05-09T18:30:00.000Z'),
        category: null,
      },
    ])
  })

  it('buckets a Completed row by completedAt when it differs from createdAt (dated import)', async () => {
    // Arrange — a paste-imported row whose semantic completion day (completedAt)
    // is earlier than its insert time (createdAt). The heatmap must use
    // completedAt so the row lands on the day it actually happened.
    mockedTodoFindMany.mockResolvedValue([])
    mockedCompletedFindMany.mockResolvedValue([
      {
        id: 7,
        title: 'gym last week',
        completedAt: new Date('2026-05-05T09:00:00.000Z'),
        createdAt: new Date('2026-05-09T18:30:00.000Z'),
        category: null,
      },
    ] as never)

    // Act
    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)

    // Assert — completedAt wins over createdAt
    expect(entries[0]?.completedAt).toEqual(
      new Date('2026-05-05T09:00:00.000Z'),
    )
  })

  it('falls back to createdAt when a Completed row has a null completedAt (existing-row stability)', async () => {
    // Arrange — a pre-migration row the backfill conceptually covers; a null
    // completedAt must coalesce to createdAt so old rows keep their heatmap day
    // (they do NOT jump to migration-day).
    mockedTodoFindMany.mockResolvedValue([])
    mockedCompletedFindMany.mockResolvedValue([
      {
        id: 8,
        title: 'legacy completed row',
        completedAt: null,
        createdAt: new Date('2026-05-06T12:00:00.000Z'),
        category: null,
      },
    ] as never)

    // Act
    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)

    // Assert — bucket date is createdAt's day, not null/migration-day
    expect(entries[0]?.completedAt).toEqual(
      new Date('2026-05-06T12:00:00.000Z'),
    )
  })

  it('UNIONs rows from both tables sorted ascending by completedAt', async () => {
    // Todo updated later than the Completed row, so the sort needs to flip
    // them relative to insertion order.
    mockedTodoFindMany.mockResolvedValue([
      {
        id: 1,
        text: 'todo-later',
        updatedAt: new Date('2026-05-09T08:00:00.000Z'),
        category: null,
      },
    ] as never)
    mockedCompletedFindMany.mockResolvedValue([
      {
        id: 1,
        title: 'completed-earlier',
        createdAt: new Date('2026-05-06T08:00:00.000Z'),
        category: null,
      },
    ] as never)

    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)
    expect(entries.map((entry) => entry.source)).toEqual(['completed', 'todo'])
  })

  it('breaks identical-timestamp ties with todo first, then by id', async () => {
    // Both rows on the same instant: todo should win the tie, then ascending
    // id. Locks the deterministic ordering documented inline in the sort.
    const sameInstant = new Date('2026-05-08T12:00:00.000Z')
    mockedTodoFindMany.mockResolvedValue([
      { id: 5, text: 'todo-5', updatedAt: sameInstant, category: null },
      { id: 2, text: 'todo-2', updatedAt: sameInstant, category: null },
    ] as never)
    mockedCompletedFindMany.mockResolvedValue([
      { id: 9, title: 'completed-9', createdAt: sameInstant, category: null },
    ] as never)

    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)
    expect(
      entries.map((entry) => ({ source: entry.source, id: entry.id })),
    ).toEqual([
      { source: 'todo', id: 2 },
      { source: 'todo', id: 5 },
      { source: 'completed', id: 9 },
    ])
  })

  it('passes userId, completed=true, and the completedAt-or-updatedAt range to the Todo query', async () => {
    mockedTodoFindMany.mockResolvedValue([])
    mockedCompletedFindMany.mockResolvedValue([])

    await fetchCompletedEntries(7, RANGE_START, RANGE_END)

    expect(mockedTodoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 7,
          completed: true,
          OR: [
            { completedAt: { gte: RANGE_START, lte: RANGE_END } },
            {
              completedAt: null,
              updatedAt: { gte: RANGE_START, lte: RANGE_END },
            },
          ],
        }),
      }),
    )
  })

  it('filters archived=false and the completedAt-or-createdAt range on the Completed query', async () => {
    mockedTodoFindMany.mockResolvedValue([])
    mockedCompletedFindMany.mockResolvedValue([])

    await fetchCompletedEntries(7, RANGE_START, RANGE_END)

    expect(mockedCompletedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 7,
          archived: false,
          OR: [
            { completedAt: { gte: RANGE_START, lte: RANGE_END } },
            {
              completedAt: null,
              createdAt: { gte: RANGE_START, lte: RANGE_END },
            },
          ],
        }),
      }),
    )
  })

  it('forwards null categories through the mapper untouched', async () => {
    mockedTodoFindMany.mockResolvedValue([
      {
        id: 1,
        text: 'orphan todo',
        updatedAt: new Date('2026-05-06T00:00:00.000Z'),
        category: null,
      },
    ] as never)
    mockedCompletedFindMany.mockResolvedValue([])

    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)
    expect(entries[0]?.category).toBeNull()
  })

  it('uses Todo.completedAt over updatedAt so a later edit does NOT drift the heatmap day', async () => {
    // The migration to a stable Todo.completedAt resolved the old drift: editing
    // a long-completed Todo used to bump its heatmap bucket to the edit day.
    // Now completedAt holds the real completion day regardless of later edits.
    const completionDay = new Date('2026-05-07T09:00:00.000Z')
    const laterEdit = new Date('2026-05-10T15:00:00.000Z')
    mockedTodoFindMany.mockResolvedValue([
      {
        id: 1,
        text: 'long-completed todo, edited today',
        completedAt: completionDay,
        updatedAt: laterEdit,
        category: null,
      },
    ] as never)
    mockedCompletedFindMany.mockResolvedValue([])

    const entries = await fetchCompletedEntries(1, RANGE_START, RANGE_END)
    expect(entries[0]?.completedAt).toEqual(completionDay)
  })
})
