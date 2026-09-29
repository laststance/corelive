// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import { categoryTable, type User, userTable } from '@/db/schema'
import { describeIfDb } from '@/server/procedures/describeIfDb'
import { DEFAULT_CATEGORY_SEED } from '@/server/schemas/category'
import { settleBehindHeldTransaction } from '@/test/heldTransaction'

import { authMiddleware } from './auth'

/**
 * Suite for the auth middleware's Clerk-ID → user resolution. The real-DB half
 * reuses a webhook-synced row, lazily creates a missing one (with "General"), and
 * survives a first request racing the webhook (or a twin request) on the same
 * Clerk ID. The DB-free half pins the fast paths (no credential, bootstrap user)
 * that must never reach the database at all, so it runs in a bare `pnpm test`.
 * Several sequential DB round trips per case, so the suite gets a generous timeout.
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
  vi.restoreAllMocks()
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

  test('returns the row the Clerk webhook committed first when the account-creating insert loses the Clerk ID unique race, leaving one "General"', async () => {
    // Arrange — the webhook's role: a second transaction has inserted the user and its
    // "General" but not committed, so the middleware's lookup sees nothing and its insert parks.
    const clerkId = freshClerkId()
    let webhookUser: User | undefined

    // Act
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        webhookUser = requireRow(
          await tx
            .insert(userTable)
            .values({
              clerkId,
              email: `${clerkId}@example.com`,
              name: 'Webhook User',
            })
            .returning(),
          'user.insert',
        )
        await tx
          .insert(categoryTable)
          .values({ ...DEFAULT_CATEGORY_SEED, userId: webhookUser.id })
      },
      startCall: async () =>
        call(readAuthenticatedUser, undefined, authCallOptions(clerkId)),
    })

    // Assert — the losing insert rolled back with its own "General", and the caller got the winner's row.
    expect(settled).not.toHaveProperty('error')
    expect('value' in settled && settled.value).toEqual(webhookUser)
    expect(await selectUsersByClerkId(clerkId)).toEqual([webhookUser])
    expect(await selectCategoriesByClerkId(clerkId)).toEqual([
      { name: 'General', color: 'blue', isDefault: true },
    ])
  })

  test('gives two overlapping first requests for one account the same row and one "General"', async () => {
    // Arrange — a Clerk ID the database has never seen
    const clerkId = freshClerkId()

    // Act — two first requests race to create it (whichever loses recovers or finds the winner)
    const [firstUser, secondUser] = await Promise.all([
      call(readAuthenticatedUser, undefined, authCallOptions(clerkId)),
      call(readAuthenticatedUser, undefined, authCallOptions(clerkId)),
    ])

    // Assert
    expect(secondUser.id).toBe(firstUser.id)
    expect(secondUser).toEqual(firstUser)
    expect(await selectUsersByClerkId(clerkId)).toEqual([firstUser])
    expect(await selectCategoriesByClerkId(clerkId)).toEqual([
      { name: 'General', color: 'blue', isDefault: true },
    ])
  })
})

describe('authMiddleware fast paths that never reach the database', () => {
  test.each([
    {
      credential: 'a Clerk ID sent without the Bearer scheme',
      headers: () => new Headers({ Authorization: 'user_without_bearer' }),
    },
    { credential: 'no Authorization header', headers: () => new Headers() },
  ])(
    'rejects a call carrying $credential as UNAUTHORIZED before any database work',
    async ({ headers }) => {
      // Arrange
      const execute = vi.spyOn(db, 'execute')
      const select = vi.spyOn(db, 'select')
      const transaction = vi.spyOn(db, 'transaction')

      // Act
      const operation = call(readAuthenticatedUser, undefined, {
        context: { headers: headers() },
      })

      // Assert
      await expect(operation).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(execute).not.toHaveBeenCalled()
      expect(select).not.toHaveBeenCalled()
      expect(transaction).not.toHaveBeenCalled()
    },
  )

  test('reuses a bootstrap-resolved user without the connectivity probe, the user lookup or an account-creating write', async () => {
    // Arrange — the context user has no stored row, so any repeated lookup would
    // lazily create one for the Bearer Clerk ID.
    const clerkId = `test_auth_${randomUUID()}`
    const bootstrapUser: User = {
      id: 7,
      clerkId,
      email: 'synced@example.com',
      name: 'Synced User',
      bio: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    }
    const execute = vi.spyOn(db, 'execute')
    const select = vi.spyOn(db, 'select')
    const transaction = vi.spyOn(db, 'transaction')
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
    expect(execute).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })
})
