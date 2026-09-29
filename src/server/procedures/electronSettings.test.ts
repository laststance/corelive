// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { categoryTable, electronSettingsTable, userTable } from '@/db/schema'

import { describeIfDb } from './describeIfDb'
import { getElectronSettings, upsertElectronSettings } from './electronSettings'

/**
 * Real-database coverage for the Electron settings row. The read-or-create path is
 * now a select plus an `INSERT … RETURNING`, and the save is an
 * `INSERT … ON CONFLICT ("userId") DO UPDATE` whose `SET` lists only the fields the
 * client sent. A wrong `SET` would silently reset the toggles the user did not touch.
 */
vi.setConfig({ testTimeout: 30_000 })

/**
 * Builds the direct-call options every authenticated procedure needs.
 * @param clerkId - Clerk user id placed in the Bearer header.
 * @returns oRPC call options carrying the auth header.
 * @example
 * await call(getElectronSettings, undefined, authContext('user_1'))
 */
function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

// Every clerk id a test touches, so afterEach can delete the user and its rows.
const createdClerkIds = new Set<string>()

/**
 * Reserves a unique Clerk id for one test and registers it for teardown.
 * @returns A clerk id no other test uses.
 * @example
 * const clerkId = freshClerkId() // => 'test_electron_settings_3f2c…'
 */
function freshClerkId(): string {
  const clerkId = `test_electron_settings_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    await db
      .delete(electronSettingsTable)
      .where(eq(electronSettingsTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('electronSettings get and save (real PostgreSQL)', () => {
  test('creates the default settings on the first read and hands back that same row on the next read', async () => {
    // Arrange
    const clerkId = freshClerkId()

    // Act
    const first = await call(
      getElectronSettings,
      undefined,
      authContext(clerkId),
    )
    const second = await call(
      getElectronSettings,
      undefined,
      authContext(clerkId),
    )

    // Assert
    expect(first).toMatchObject({
      hideAppIcon: false,
      showInMenuBar: true,
      startAtLogin: false,
    })
    expect(second).toEqual(first)
  })

  test('saving one toggle keeps the other toggles the user already changed', async () => {
    // Arrange
    const clerkId = freshClerkId()
    await call(
      upsertElectronSettings,
      { showInMenuBar: false, startAtLogin: true },
      authContext(clerkId),
    )

    // Act
    const saved = await call(
      upsertElectronSettings,
      { hideAppIcon: true },
      authContext(clerkId),
    )

    // Assert
    expect(saved).toMatchObject({
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
    const [stored] = await db
      .select()
      .from(electronSettingsTable)
      .where(eq(electronSettingsTable.id, saved.id))
    expect(stored).toMatchObject({
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
  })

  test('an empty save returns the stored settings unchanged instead of failing', async () => {
    // Arrange — one non-default toggle, with updatedAt parked in the past.
    const clerkId = freshClerkId()
    const first = await call(
      upsertElectronSettings,
      { startAtLogin: true },
      authContext(clerkId),
    )
    const parkedAt = new Date('2026-01-01T00:00:00.000Z')
    await db
      .update(electronSettingsTable)
      .set({ updatedAt: parkedAt })
      .where(eq(electronSettingsTable.id, first.id))

    // Act
    const saved = await call(upsertElectronSettings, {}, authContext(clerkId))

    // Assert — same row, same toggles, and the save is stamped as a touch.
    expect(saved).toMatchObject({
      id: first.id,
      hideAppIcon: false,
      showInMenuBar: true,
      startAtLogin: true,
    })
    expect(saved.updatedAt.getTime()).toBeGreaterThan(parkedAt.getTime())
  })
})
