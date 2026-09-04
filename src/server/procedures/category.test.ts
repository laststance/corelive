// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { listCategories } from './category'
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
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) continue
    await prisma.category.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
  }
  createdClerkIds.clear()
})

describeIfDb(
  'category.list — first sign-in always has somewhere to write',
  () => {
    it('seeds "General" for an account the webhook never reached, so /write is not locked on "No categories"', async () => {
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

    it('seeds "General" only once — a second list returns the same single row', async () => {
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

    it('leaves an account that already has categories alone (no surprise "General")', async () => {
      // Arrange — the user exists with one hand-made category and no default.
      const clerkId = freshClerkId()
      const user = await prisma.user.create({ data: { clerkId } })
      await prisma.category.create({
        data: {
          name: 'Work',
          color: 'green',
          isDefault: false,
          userId: user.id,
        },
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
