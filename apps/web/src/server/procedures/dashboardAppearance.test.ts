// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test } from 'vitest'

import { db } from '@/db'
import { userTable } from '@/db/schema'

import {
  getDashboardAppearance,
  setDashboardAppearance,
} from './dashboardAppearance'
import { describeIfDb } from './describeIfDb'

const accounts: string[] = []

/** A test-owned user row exercises the production auth middleware without contacting Clerk. */
async function account() {
  const clerkId = `test_appearance_${randomUUID()}`
  accounts.push(clerkId)
  await db.insert(userTable).values({ clerkId })
  return {
    clerkId,
    context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
  }
}

afterEach(async () => {
  for (const id of accounts.splice(0))
    await db.delete(userTable).where(eq(userTable.clerkId, id))
})

describeIfDb('account-owned dashboard appearance', () => {
  test('the first browser migrates its palette once and explicit future selections are authoritative', async () => {
    // Arrange
    const owner = await account()
    expect(await call(getDashboardAppearance, undefined, owner)).toEqual({
      theme: null,
    })

    // Act
    const migrated = await call(
      setDashboardAppearance,
      {
        theme: 'harbor-dark',
        initializeOnly: true,
        expectedAccountId: owner.clerkId,
      },
      owner,
    )
    const ignored = await call(
      setDashboardAppearance,
      { theme: 'rose-tea-light', initializeOnly: true },
      owner,
    )
    const chosen = await call(
      setDashboardAppearance,
      { theme: 'system' },
      owner,
    )

    // Assert
    expect(migrated).toEqual({ theme: 'harbor-dark' })
    expect(ignored).toEqual({ theme: 'harbor-dark' })
    expect(chosen).toEqual({ theme: 'system' })
    expect(
      await call(
        getDashboardAppearance,
        { expectedAccountId: owner.clerkId },
        owner,
      ),
    ).toEqual({ theme: 'system' })
  })

  test('concurrent browser migrations agree on one palette, and a concurrent explicit choice always prevails', async () => {
    // Arrange
    const migrations = await account()
    const explicit = await account()

    // Act
    const [first, second] = await Promise.all([
      call(
        setDashboardAppearance,
        { theme: 'light', initializeOnly: true },
        migrations,
      ),
      call(
        setDashboardAppearance,
        { theme: 'dark', initializeOnly: true },
        migrations,
      ),
    ])
    await Promise.all([
      call(
        setDashboardAppearance,
        { theme: 'iris-light', initializeOnly: true },
        explicit,
      ),
      call(setDashboardAppearance, { theme: 'cathedral-dark' }, explicit),
      call(
        setDashboardAppearance,
        { theme: 'graphite-dark', initializeOnly: true },
        explicit,
      ),
    ])

    // Assert
    expect(['light', 'dark']).toContain(first.theme)
    expect(second).toEqual(first)
    expect(await call(getDashboardAppearance, undefined, migrations)).toEqual(
      first,
    )
    expect(await call(getDashboardAppearance, undefined, explicit)).toEqual({
      theme: 'cathedral-dark',
    })
  })

  test('a browser holding the previous account ID cannot read or change the currently signed-in account', async () => {
    // Arrange
    const original = await account()
    const next = await account()
    await call(setDashboardAppearance, { theme: 'grove-light' }, original)
    await call(setDashboardAppearance, { theme: 'graphite-dark' }, next)

    // Act and Assert
    await expect(
      call(
        getDashboardAppearance,
        { expectedAccountId: original.clerkId },
        next,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call(
        setDashboardAppearance,
        { theme: 'dark', expectedAccountId: original.clerkId },
        next,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await call(getDashboardAppearance, undefined, original)).toEqual({
      theme: 'grove-light',
    })
    expect(await call(getDashboardAppearance, undefined, next)).toEqual({
      theme: 'graphite-dark',
    })
  })
})

test('a signed-out call cannot read or store a dashboard palette', async () => {
  // Arrange
  const signedOut = { context: { headers: new Headers() } }

  // Act and Assert
  await expect(
    call(getDashboardAppearance, undefined, signedOut),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  await expect(
    call(setDashboardAppearance, { theme: 'light' }, signedOut),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})
