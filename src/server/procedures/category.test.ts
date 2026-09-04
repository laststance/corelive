// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { listCategories } from './category'
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

    it('creates the account with "General" already attached, so a first call to any other procedure leaves somewhere to write', async () => {
      // Arrange — a clerkId the DB has never seen.
      const clerkId = freshClerkId()

      // Act — the account is born inside a procedure that never touches categories.
      await call(getHeatmap, { days: 1 }, authContext(clerkId))

      // Assert — read the rows directly; no list call has run to repair anything.
      const user = await prisma.user.findUnique({ where: { clerkId } })
      const seeded = await prisma.category.findMany({
        where: { userId: user?.id },
      })
      expect(seeded.map((category) => category.name)).toEqual(['General'])
    })

    it('two first lists racing on one new account still leave exactly one "General"', async () => {
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
