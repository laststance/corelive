// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { createManyCompleted, getDayDetail } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-DB harness for the L3 local-day bucketing of `getDayDetail`. Each test
 * seeds completions at a precise UTC instant through the REAL import procedure
 * (which lazily upserts the user via `authMiddleware` and get-or-creates the
 * default category), then asserts which LOCAL calendar day they surface on
 * under different IANA zones. Several sequential round-trips per case, so the
 * suite gets a generous timeout to never flake on DB latency.
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
  const clerkId = `test_day_detail_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

/**
 * Seeds exactly one Completed row at `completedAt` via the real paste-import
 * procedure (auto-creates the user + default category on first call), so the
 * read path under test sees a row written exactly the way production writes it.
 */
async function seedCompletionAt(
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

describeIfDb('completed.getDayDetail local-day bucketing (L3)', () => {
  it('buckets a completion to its UTC calendar day when no timezone is supplied (legacy fallback)', async () => {
    // Arrange — one completion at 15:30 UTC on 2026-05-12.
    const clerkId = freshClerkId()
    await seedCompletionAt(
      clerkId,
      'evening reading',
      new Date('2026-05-12T15:30:00.000Z'),
    )

    // Act — query the calendar day with NO timezone (the pre-L3 behavior).
    const detail = await call(
      getDayDetail,
      { date: '2026-05-12' },
      authContext(clerkId),
    )

    // Assert — it lands on 2026-05-12 (the UTC day), exactly as before L3.
    expect(detail.count).toBe(1)
    expect(detail.tasks.map((task) => task.title)).toEqual(['evening reading'])
  })

  it('rolls a late-UTC completion forward to the next local day under a positive-offset zone (JST)', async () => {
    // Arrange — 15:30 UTC on 2026-05-12 is 00:30 JST on 2026-05-13.
    const clerkId = freshClerkId()
    await seedCompletionAt(
      clerkId,
      'midnight journaling',
      new Date('2026-05-12T15:30:00.000Z'),
    )

    // Act — the SAME completion, queried under Asia/Tokyo for both candidate days.
    const onJstNextDay = await call(
      getDayDetail,
      { date: '2026-05-13', timezone: 'Asia/Tokyo' },
      authContext(clerkId),
    )
    const onUtcDay = await call(
      getDayDetail,
      { date: '2026-05-12', timezone: 'Asia/Tokyo' },
      authContext(clerkId),
    )

    // Assert — it appears on the JST day (13th), the cell the user actually saw.
    expect(onJstNextDay.count).toBe(1)
    expect(onJstNextDay.tasks.map((task) => task.title)).toEqual([
      'midnight journaling',
    ])
    // The ±1-UTC-day over-fetch for the 12th DOES read this instant, but the
    // local-day filter drops it — proving buffer-day spill never leaks a cell.
    expect(onUtcDay.count).toBe(0)
  })

  it('rolls an early-UTC completion back to the previous local day under a negative-offset zone (America/New_York)', async () => {
    // Arrange — 02:30 UTC on 2026-05-12 is 22:30 EDT on 2026-05-11.
    const clerkId = freshClerkId()
    await seedCompletionAt(
      clerkId,
      'late-night gym',
      new Date('2026-05-12T02:30:00.000Z'),
    )

    // Act — query both candidate days under America/New_York.
    const onEdtPrevDay = await call(
      getDayDetail,
      { date: '2026-05-11', timezone: 'America/New_York' },
      authContext(clerkId),
    )
    const onUtcDay = await call(
      getDayDetail,
      { date: '2026-05-12', timezone: 'America/New_York' },
      authContext(clerkId),
    )

    // Assert — it appears on the EDT day (11th), not the UTC day (12th).
    expect(onEdtPrevDay.count).toBe(1)
    expect(onEdtPrevDay.tasks.map((task) => task.title)).toEqual([
      'late-night gym',
    ])
    expect(onUtcDay.count).toBe(0)
  })
})
