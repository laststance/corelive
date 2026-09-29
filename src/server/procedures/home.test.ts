// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import {
  categoryTable,
  completedTable,
  todoTable,
  userTable,
} from '@/db/schema'
import { COMPLETED_JOURNAL_PAGE_SIZE } from '@/lib/constants/completed'
import { HOME_HEATMAP_DAYS } from '@/lib/constants/home'

import { describeIfDb } from './describeIfDb'
import { bootstrapHome } from './home'

const createdClerkIds = new Set<string>()

/** Creates an isolated Clerk identity whenever the real bootstrap integration test seeds Home rows. @returns A unique Clerk ID tracked for FK-safe teardown. @example `const clerkId = freshClerkId()` */
function freshClerkId(): string {
  const clerkId = `test_home_bootstrap_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

afterEach(async () => {
  // Remove every dependent row before its test user because these relations do not all cascade.
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
      .limit(1)
    if (!user) continue
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('home.bootstrap', () => {
  test('returns every critical Home region through one authenticated procedure call', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const user = requireRow(
      await db.insert(userTable).values({ clerkId }).returning(),
      'user.create',
    )
    const category = requireRow(
      await db
        .insert(categoryTable)
        .values({
          color: 'blue',
          isDefault: true,
          name: 'General',
          userId: user.id,
        })
        .returning(),
      'category.create',
    )
    await db.insert(todoTable).values({
      categoryId: category.id,
      completed: false,
      text: "Review Sarah's PR before standup",
      userId: user.id,
    })
    await db.insert(completedTable).values({
      categoryId: category.id,
      completedAt: new Date(),
      title: 'Shipped the bootstrap',
      userId: user.id,
    })

    // Act
    const result = await call(
      bootstrapHome,
      {
        heatmap: { days: HOME_HEATMAP_DAYS, timezone: 'UTC' },
        journal: { limit: COMPLETED_JOURNAL_PAGE_SIZE, offset: 0 },
      },
      {
        context: {
          headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
        },
      },
    )

    // Assert
    expect(result.category.categories.map((entry) => entry.name)).toEqual([
      'General',
    ])
    expect(result.heatmap.total).toBe(1)
    expect(result.journal.entries.map((entry) => entry.title)).toEqual([
      'Shipped the bootstrap',
    ])
  })
})
