// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import { categoryTable, type User, userTable } from '@/db/schema'
import { describeIfDb } from '@/server/procedures/describeIfDb'

import { authMiddleware } from './auth'

/**
 * Real-DB suite for the auth middleware's Clerk-ID → user resolution: reuse a
 * webhook-synced row, lazily create a missing one (with "General"), and survive
 * two first requests racing on the same Clerk ID. Several sequential DB round
 * trips per case, so the suite gets a generous timeout.
 */
vi.setConfig({ testTimeout: 30_000 })

const readAuthenticatedUser = authMiddleware.handler(
  async ({ context }) => context.user,
)

/** Builds the public oRPC context used by every browser query after Clerk resolves a user ID. @param clerkUserId - Clerk user identifier placed in the Bearer header. @returns Direct-call options for an authenticated procedure. @example `authCallOptions('user_123')` */
function authCallOptions(clerkUserId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkUserId}` }),
    },
  }
}

// Every Clerk ID a test touches, so teardown removes exactly the rows it made.
const createdClerkIds = new Set<string>()

/**
 * Mints a Clerk ID no other test (or the dev seed user) owns and registers it for teardown.
 * @returns A unique Clerk user identifier.
 * @example
 * freshClerkId() // => 'test_auth_3f2b…'
 */
function freshClerkId(): string {
  const clerkId = `test_auth_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

/**
 * Reads back every stored user row for one Clerk ID, the observable result of user resolution.
 * @param clerkId - Clerk user identifier to look up.
 * @returns The matching rows; `[]` when resolution never wrote one.
 * @example
 * await selectUsersByClerkId('test_auth_…') // => [{ id: 12, clerkId: 'test_auth_…', … }]
 */
async function selectUsersByClerkId(clerkId: string): Promise<User[]> {
  return db.select().from(userTable).where(eq(userTable.clerkId, clerkId))
}

/**
 * Reads back the categories owned by the account behind one Clerk ID, to see whether a create path ran.
 * @param clerkId - Clerk user identifier whose account's categories to read.
 * @returns Name, color and default flag of each stored category.
 * @example
 * await selectCategoriesByClerkId('test_auth_…') // => [{ name: 'General', color: 'blue', isDefault: true }]
 */
async function selectCategoriesByClerkId(clerkId: string) {
  return db
    .select({
      name: categoryTable.name,
      color: categoryTable.color,
      isDefault: categoryTable.isDefault,
    })
    .from(categoryTable)
    .innerJoin(userTable, eq(categoryTable.userId, userTable.id))
    .where(eq(userTable.clerkId, clerkId))
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await selectUsersByClerkId(clerkId)
    if (!user) continue
    // Category rows restrict the user's delete, so they go first.
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('authMiddleware user resolution', () => {
  test('reuses a webhook-synchronized user without writing on an authenticated query', async () => {
    // Arrange — only the user row exists, so any create-path write would
    // surface as a changed row or a new "General" category.
    const clerkId = freshClerkId()
    const existingUser = requireRow(
      await db
        .insert(userTable)
        .values({
          clerkId,
          email: `${clerkId}@example.com`,
          name: 'Synced User',
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        })
        .returning(),
      'user.insert',
    )

    // Act
    const user = await call(
      readAuthenticatedUser,
      undefined,
      authCallOptions(clerkId),
    )

    // Assert
    expect(user).toEqual(existingUser)
    expect(await selectUsersByClerkId(clerkId)).toEqual([existingUser])
    expect(await selectCategoriesByClerkId(clerkId)).toEqual([])
  })

  test('creates the user only when the Clerk webhook row is genuinely missing, with "General" attached so the editor is never locked on "No categories"', async () => {
    // Arrange — a Clerk ID the database has never seen
    const clerkId = freshClerkId()

    // Act
    const user = await call(
      readAuthenticatedUser,
      undefined,
      authCallOptions(clerkId),
    )

    // Assert — the default category rides along in the one account-creating write.
    expect(user).toEqual({
      id: expect.any(Number),
      clerkId,
      email: null,
      name: null,
      bio: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    expect(await selectUsersByClerkId(clerkId)).toEqual([user])
    expect(await selectCategoriesByClerkId(clerkId)).toEqual([
      { name: 'General', color: 'blue', isDefault: true },
    ])
  })

  test('uses the winning webhook row when a concurrent create hits the Clerk ID unique constraint', async () => {
    // Arrange — a Clerk ID the database has never seen
    const clerkId = freshClerkId()

    // Act — two first requests for the same account race to create it
    const [firstUser, secondUser] = await Promise.all([
      call(readAuthenticatedUser, undefined, authCallOptions(clerkId)),
      call(readAuthenticatedUser, undefined, authCallOptions(clerkId)),
    ])

    // Assert — both requests land on the one committed row and its one "General"
    expect(secondUser.id).toBe(firstUser.id)
    expect(secondUser).toEqual(firstUser)
    expect(await selectUsersByClerkId(clerkId)).toEqual([firstUser])
    expect(await selectCategoriesByClerkId(clerkId)).toEqual([
      { name: 'General', color: 'blue', isDefault: true },
    ])
  })

  test('rejects an unauthenticated query without creating a user row', async () => {
    // Arrange — the Clerk ID travels without the Bearer scheme, so it must not authenticate
    const clerkId = freshClerkId()
    const operation = call(readAuthenticatedUser, undefined, {
      context: { headers: new Headers({ Authorization: clerkId }) },
    })

    // Act and Assert
    await expect(operation).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await selectUsersByClerkId(clerkId)).toEqual([])
  })

  test('reuses a bootstrap-resolved user instead of resolving its Bearer credential again', async () => {
    // Arrange — the context user has no stored row, so a repeated lookup would
    // lazily create one for the Bearer Clerk ID.
    const clerkId = freshClerkId()
    const bootstrapUser: User = {
      id: 7,
      clerkId,
      email: 'synced@example.com',
      name: 'Synced User',
      bio: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    }
    const options = {
      context: {
        headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
        user: bootstrapUser,
      },
    }

    // Act
    const user = await call(readAuthenticatedUser, undefined, options)

    // Assert
    expect(user).toEqual(bootstrapUser)
    expect(await selectUsersByClerkId(clerkId)).toEqual([])
  })
})
