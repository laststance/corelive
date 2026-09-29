// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { Webhook } from 'svix'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { categoryTable, userTable } from '@/db/schema'
import { describeIfDb } from '@/server/procedures/describeIfDb'

const { mockHeaders, testSigningSecret } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  testSigningSecret: 'whsec_d2ViaG9vay10ZXN0LXNpZ25pbmctc2VjcmV0',
}))

vi.mock('next/headers', () => ({ headers: mockHeaders }))
vi.mock('@/env.mjs', () => ({ env: { WEBHOOK_SECRET: testSigningSecret } }))

import { POST } from './route'

/**
 * Real-DB suite for the Clerk webhook: a verified `user.created` event must
 * leave the user row and its default "General" category in Postgres, and a
 * tampered payload must leave nothing behind. Sequential DB round trips per
 * case, so the suite gets a generous timeout.
 */
vi.setConfig({ testTimeout: 30_000 })

// Every Clerk ID a test sends, so teardown can remove exactly the rows it made.
const createdClerkIds = new Set<string>()

/**
 * Mints a Clerk ID no other test (or the dev seed user) owns and registers it for teardown.
 * @returns A unique Clerk user identifier for one webhook payload.
 * @example
 * freshClerkId() // => 'test_webhook_3f2b…'
 */
function freshClerkId(): string {
  const clerkId = `test_webhook_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

/**
 * Stubs the Svix headers the route reads, signing `body` exactly like Clerk does.
 * @param messageId - Svix message identifier bound into the signature.
 * @param body - Raw payload bytes the signature covers.
 * @returns Nothing after the `next/headers` mock resolves to the signed headers.
 * @example
 * mockSignedHeaders('msg_signed', '{"type":"user.created",…}')
 */
function mockSignedHeaders(messageId: string, body: string): void {
  const timestamp = new Date()
  mockHeaders.mockResolvedValue(
    new Headers({
      'svix-id': messageId,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': new Webhook(testSigningSecret).sign(
        messageId,
        timestamp,
        body,
      ),
    }),
  )
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    // Category rows restrict the user's delete, so they go first.
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('Clerk webhook signature verification', () => {
  test.each([
    { format: 'compact', indentation: undefined },
    { format: 'formatted', indentation: 2 },
  ])(
    'creates the user and default category from a $format signed payload',
    async ({ indentation }) => {
      // Arrange
      const clerkId = freshClerkId()
      const email = `${clerkId}@example.com`
      const body = JSON.stringify(
        {
          type: 'user.created',
          data: {
            id: clerkId,
            email_addresses: [{ email_address: email }],
            username: 'signed-user',
          },
        },
        null,
        indentation,
      )
      mockSignedHeaders('msg_signed', body)
      const request = new Request('https://corelive.app/api/webhooks', {
        method: 'POST',
        body,
      })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(201)
      const storedUsers = await db
        .select({
          clerkId: userTable.clerkId,
          name: userTable.name,
          email: userTable.email,
        })
        .from(userTable)
        .where(eq(userTable.clerkId, clerkId))
      expect(storedUsers).toEqual([{ clerkId, name: 'signed-user', email }])
      const storedCategories = await db
        .select({
          name: categoryTable.name,
          color: categoryTable.color,
          isDefault: categoryTable.isDefault,
        })
        .from(categoryTable)
        .innerJoin(userTable, eq(categoryTable.userId, userTable.id))
        .where(eq(userTable.clerkId, clerkId))
      expect(storedCategories).toEqual([
        { name: 'General', color: 'blue', isDefault: true },
      ])
    },
  )
})

describe('Clerk webhook signature rejection', () => {
  test('rejects a tampered signed payload with 400 before any database write', async () => {
    // Arrange — the signed payload is complete (it carries an email), so only
    // the signature check stands between it and a user row.
    const signedClerkId = `test_webhook_${randomUUID()}`
    const tamperedClerkId = `test_webhook_${randomUUID()}`
    const signedBody = JSON.stringify({
      type: 'user.created',
      data: {
        id: signedClerkId,
        email_addresses: [{ email_address: `${signedClerkId}@example.com` }],
      },
    })
    mockSignedHeaders('msg_tampered', signedBody)
    const request = new Request('https://corelive.app/api/webhooks', {
      method: 'POST',
      body: signedBody.replaceAll(signedClerkId, tamperedClerkId),
    })
    const transaction = vi.spyOn(db, 'transaction')

    // Act
    const response = await POST(request)

    // Assert — every write the route makes goes through a transaction, and none was opened.
    expect(response.status).toBe(400)
    expect(transaction).not.toHaveBeenCalled()
    transaction.mockRestore()
  })
})
