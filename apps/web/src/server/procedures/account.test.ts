// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { categoryTable, userTable } from '@/db/schema'

import { whoami } from './account'
import { describeIfDb } from './describeIfDb'

const getUser = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { getUser } }),
}))

const owners: string[] = []

afterEach(async () => {
  getUser.mockReset()
  for (const clerkId of owners.splice(0)) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
})

describeIfDb('account.whoami', () => {
  test('returns the verified Clerk id of the bearer credential and no email before the webhook synced one', async () => {
    // Arrange
    const clerkId = `test_whoami_${randomUUID()}`
    owners.push(clerkId)
    const context = {
      context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
    }

    // Act
    getUser.mockRejectedValue(new Error('Clerk unavailable'))
    const identity = await call(whoami, undefined, context)

    // Assert
    expect(identity).toEqual({ clerkId, email: null })
  })

  test('falls back to the primary email read from Clerk server-side when the stored email is null', async () => {
    // Arrange
    const clerkId = `test_whoami_${randomUUID()}`
    owners.push(clerkId)
    const context = {
      context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
    }
    getUser.mockResolvedValue({
      primaryEmailAddressId: 'idn_2',
      emailAddresses: [
        { id: 'idn_1', emailAddress: 'secondary@example.com' },
        { id: 'idn_2', emailAddress: 'primary@example.com' },
      ],
    })

    // Act
    const identity = await call(whoami, undefined, context)

    // Assert
    expect(identity).toEqual({ clerkId, email: 'primary@example.com' })
    expect(getUser).toHaveBeenCalledWith(clerkId)
  })

  test('returns the primary email stored for the account', async () => {
    // Arrange
    const clerkId = `test_whoami_${randomUUID()}`
    owners.push(clerkId)
    const context = {
      context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
    }
    await call(whoami, undefined, context)
    await db
      .update(userTable)
      .set({ email: `${clerkId}@example.com` })
      .where(eq(userTable.clerkId, clerkId))

    // Act
    const identity = await call(whoami, undefined, context)

    // Assert
    expect(identity).toEqual({ clerkId, email: `${clerkId}@example.com` })
  })
})
