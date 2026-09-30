// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import { categoryTable, todoTable, userTable } from '@/db/schema'

import { deleteCategory, listCategories, updateCategory } from './category'
import { getHeatmap } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-DB pin for the first-sign-in unlock. A `/write` visitor who signs in
 * lands on a user row the auth middleware created lazily — the Clerk webhook
 * that seeds "General" may be late or never arrive locally — and before this
 * the editor opened disabled on "No categories". Sequential DB round-trips, so
 * the suite gets a generous timeout to never flake on DB latency.
 */
vi.setConfig({ testTimeout: 30_000 })

function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

// Track every clerkId a test touches so afterEach can delete the user and its
// categories (User has no onDelete cascade from Category).
const createdClerkIds = new Set<string>()

function freshClerkId(): string {
  const clerkId = `test_category_list_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
      .limit(1)
    if (!user) continue
    // Todo rows restrict their category's delete, so they go first.
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb(
  'category.list — first sign-in always has somewhere to write',
  () => {
    test('seeds "General" for an account the webhook never reached, so /write is not locked on "No categories"', async () => {
      // Arrange — a clerkId the DB has never seen (the lazy-upsert path).
      const clerkId = freshClerkId()

      // Act
      const { categories } = await call(
        listCategories,
        undefined,
        authContext(clerkId),
      )

      // Assert
      expect(categories).toHaveLength(1)
      expect(categories[0]).toMatchObject({
        name: 'General',
        color: 'blue',
        isDefault: true,
        _count: { todos: 0 },
      })
    })

    test('seeds "General" only once — a second list returns the same single row', async () => {
      // Arrange
      const clerkId = freshClerkId()
      const first = await call(listCategories, undefined, authContext(clerkId))

      // Act
      const second = await call(listCategories, undefined, authContext(clerkId))

      // Assert
      expect(second.categories.map((category) => category.id)).toEqual(
        first.categories.map((category) => category.id),
      )
    })

    test('creates the account with "General" already attached, so a first call to any other procedure leaves somewhere to write', async () => {
      // Arrange — a clerkId the DB has never seen.
      const clerkId = freshClerkId()

      // Act — the account is born inside a procedure that never touches categories.
      await call(getHeatmap, { days: 1 }, authContext(clerkId))

      // Assert — read the rows directly; no list call has run to repair anything.
      const user = requireRow(
        await db
          .select()
          .from(userTable)
          .where(eq(userTable.clerkId, clerkId))
          .limit(1),
        'user.select',
      )
      const seeded = await db
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.userId, user.id))
      expect(seeded.map((category) => category.name)).toEqual(['General'])
    })

    test('two first lists racing on one new account still leave exactly one "General"', async () => {
      // Arrange — a clerkId the DB has never seen, hit twice at once.
      const clerkId = freshClerkId()

      // Act
      const [first, second] = await Promise.all([
        call(listCategories, undefined, authContext(clerkId)),
        call(listCategories, undefined, authContext(clerkId)),
      ])

      // Assert — the unique violation is absorbed, not surfaced as a 500.
      expect(first.categories).toHaveLength(1)
      expect(second.categories).toHaveLength(1)
      expect(first.categories[0]?.id).toBe(second.categories[0]?.id)
    })

    test('leaves an account that already has categories alone (no surprise "General")', async () => {
      // Arrange — the user exists with one hand-made category and no default.
      const clerkId = freshClerkId()
      const user = requireRow(
        await db.insert(userTable).values({ clerkId }).returning(),
        'user.insert',
      )
      await db.insert(categoryTable).values({
        name: 'Work',
        color: 'green',
        isDefault: false,
        userId: user.id,
      })

      // Act
      const { categories } = await call(
        listCategories,
        undefined,
        authContext(clerkId),
      )

      // Assert
      expect(categories.map((category) => category.name)).toEqual(['Work'])
    })
  },
)

describeIfDb(
  'category.update / delete — "General" is the fixed default',
  () => {
    /**
     * Seeds an account through the real lazy-upsert path, so its default is the
     * same "General" row a real signup gets, plus one ordinary category.
     */
    async function seedAccount() {
      const clerkId = freshClerkId()
      const { categories } = await call(
        listCategories,
        undefined,
        authContext(clerkId),
      )
      const general = categories[0]!
      const work = requireRow(
        await db
          .insert(categoryTable)
          .values({
            name: 'Work',
            color: 'green',
            isDefault: false,
            userId: general.userId,
          })
          .returning(),
        'category.insert',
      )
      return { clerkId, general, work }
    }

    test('refuses to rename the default category, keeping it "General"', async () => {
      // Arrange
      const { clerkId, general } = await seedAccount()

      // Act
      const rename = call(
        updateCategory,
        { id: general.id, data: { name: 'Geek Infiltration' } },
        authContext(clerkId),
      )

      // Assert
      await expect(rename).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: "The default category can't be renamed",
      })
      expect(
        requireRow(
          await db
            .select()
            .from(categoryTable)
            .where(eq(categoryTable.id, general.id))
            .limit(1),
          'category.select',
        ),
      ).toMatchObject({ name: 'General', isDefault: true })
    })

    test('still lets the default category be recolored', async () => {
      // Arrange
      const { clerkId, general } = await seedAccount()

      // Act
      const updated = await call(
        updateCategory,
        { id: general.id, data: { color: 'violet' } },
        authContext(clerkId),
      )

      // Assert
      expect(updated).toMatchObject({ name: 'General', color: 'violet' })
    })

    test("accepts a save that sends the default's unchanged name alongside a new color", async () => {
      // Arrange
      const { clerkId, general } = await seedAccount()

      // Act
      const updated = await call(
        updateCategory,
        { id: general.id, data: { name: 'General', color: 'rose' } },
        authContext(clerkId),
      )

      // Assert
      expect(updated).toMatchObject({ name: 'General', color: 'rose' })
    })

    test('still renames an ordinary category', async () => {
      // Arrange
      const { clerkId, work } = await seedAccount()

      // Act
      const updated = await call(
        updateCategory,
        { id: work.id, data: { name: 'Side Project' } },
        authContext(clerkId),
      )

      // Assert
      expect(updated).toMatchObject({ name: 'Side Project', isDefault: false })
    })

    test('moves an ordinary category\'s tasks to "General" when it is deleted', async () => {
      // Arrange
      const { clerkId, general, work } = await seedAccount()
      const task = requireRow(
        await db
          .insert(todoTable)
          .values({
            text: 'Keep me',
            userId: general.userId,
            categoryId: work.id,
          })
          .returning(),
        'todo.insert',
      )

      // Act
      await call(deleteCategory, { id: work.id }, authContext(clerkId))

      // Assert
      expect(
        requireRow(
          await db
            .select()
            .from(todoTable)
            .where(eq(todoTable.id, task.id))
            .limit(1),
          'todo.select',
        ),
      ).toMatchObject({ categoryId: general.id })
    })
  },
)
