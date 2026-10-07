// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { categoryTable, completedTable, userTable } from '@/db/schema'

import { listCategories } from './category'
import { getJournal } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-database guard for the journal's raw-SQL date filter. node-postgres
 * serializes a JS `Date` bound parameter with the PROCESS's local offset
 * (`TZ=Asia/Tokyo` → `2026-06-03T09:00:00.000+09:00`), and PostgreSQL ignores that
 * offset when comparing against a `timestamp without time zone` column — so an
 * unguarded filter silently shifts by the server's UTC offset (9 hours on a JST
 * laptop and in the JST CI job, none on Vercel's UTC runtime). The same fixtures
 * must therefore give identical rows under every zone.
 */
vi.setConfig({ testTimeout: 30_000 })

const originalTimeZone = process.env.TZ
const createdClerkIds = new Set<string>()

/**
 * Builds the direct-call options every authenticated procedure needs.
 * @param clerkId - Clerk user id placed in the Bearer header.
 * @returns oRPC call options carrying the auth header.
 * @example
 * await call(getJournal, { limit: 20, offset: 0 }, authContext('user_1'))
 */
function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

/**
 * Creates the DB user (and its default category) through the real auth middleware,
 * then writes one `Completed` row per fixture at its exact instant.
 * @param clerkId - Clerk identity to provision.
 * @param fixtures - Titles with the exact UTC instant each completed.
 * @returns Nothing once every row is persisted.
 * @example
 * await seedCompletions(clerkId, [{ title: 'gym', completedAt: new Date('2026-06-03T14:30:00.000Z') }])
 */
async function seedCompletions(
  clerkId: string,
  fixtures: { title: string; completedAt: Date }[],
): Promise<void> {
  await call(listCategories, undefined, authContext(clerkId))
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.clerkId, clerkId))
  const [category] = await db
    .select()
    .from(categoryTable)
    .where(eq(categoryTable.userId, user!.id))
  await db.insert(completedTable).values(
    fixtures.map((fixture) => ({
      title: fixture.title,
      completedAt: fixture.completedAt,
      userId: user!.id,
      categoryId: category!.id,
    })),
  )
}

afterEach(async () => {
  // Restore the runner's zone so other tests in this worker are unaffected.
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone

  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb.each([
  { zone: 'UTC', expectedOffsetMinutes: 0 },
  { zone: 'Asia/Tokyo', expectedOffsetMinutes: -540 },
])(
  'completed.journal date filter under TZ=$zone (real PostgreSQL)',
  ({ zone, expectedOffsetMinutes }) => {
    /**
     * Provisions a user whose completions straddle both edges of 2026-06-03 (UTC).
     * @returns The clerk id owning the fixtures.
     * @example
     * const clerkId = await arrangeBoundaryFixtures()
     */
    async function arrangeBoundaryFixtures(): Promise<string> {
      const clerkId = `test_journal_tz_${randomUUID()}`
      createdClerkIds.add(clerkId)
      await seedCompletions(clerkId, [
        {
          title: 'just before the window',
          completedAt: new Date('2026-06-02T23:59:59.999Z'),
        },
        {
          title: 'window start boundary',
          completedAt: new Date('2026-06-03T00:00:00.000Z'),
        },
        {
          title: 'early morning UTC',
          completedAt: new Date('2026-06-03T05:00:00.000Z'),
        },
        {
          title: 'afternoon UTC',
          completedAt: new Date('2026-06-03T14:30:00.000Z'),
        },
        {
          title: 'last millisecond of the day',
          completedAt: new Date('2026-06-03T23:59:59.999Z'),
        },
        {
          title: 'window end boundary',
          completedAt: new Date('2026-06-04T00:00:00.000Z'),
        },
      ])
      return clerkId
    }

    test('returns exactly the rows inside [completedFrom, completedBefore) whatever zone the server runs in', async () => {
      // Arrange — switch the process zone and prove the switch took effect.
      process.env.TZ = zone
      expect(new Date(2026, 5, 3, 12).getTimezoneOffset()).toBe(
        expectedOffsetMinutes,
      )
      const clerkId = await arrangeBoundaryFixtures()

      // Act
      const journal = await call(
        getJournal,
        {
          limit: 20,
          offset: 0,
          completedFrom: new Date('2026-06-03T00:00:00.000Z'),
          completedBefore: new Date('2026-06-04T00:00:00.000Z'),
        },
        authContext(clerkId),
      )

      // Assert — inclusive lower bound, exclusive upper bound, newest first.
      expect(journal.entries.map((entry) => entry.title)).toEqual([
        'last millisecond of the day',
        'afternoon UTC',
        'early morning UTC',
        'window start boundary',
      ])
      expect(journal.total).toBe(4)
    })

    test('returns completedAt as a Date equal to the stored UTC instant, not a string or a zone-shifted time', async () => {
      // Arrange
      process.env.TZ = zone
      expect(new Date(2026, 5, 3, 12).getTimezoneOffset()).toBe(
        expectedOffsetMinutes,
      )
      const clerkId = await arrangeBoundaryFixtures()

      // Act
      const journal = await call(
        getJournal,
        {
          limit: 20,
          offset: 0,
          completedFrom: new Date('2026-06-03T14:00:00.000Z'),
          completedBefore: new Date('2026-06-03T15:00:00.000Z'),
        },
        authContext(clerkId),
      )

      // Assert
      const [entry] = journal.entries
      expect(entry?.title).toBe('afternoon UTC')
      expect(entry?.completedAt).toBeInstanceOf(Date)
      expect(entry?.completedAt.toISOString()).toBe('2026-06-03T14:30:00.000Z')
    })
  },
)
