// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { Webhook } from 'svix'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { PG_UNIQUE_VIOLATION } from '@/db/constants'
import { isPgError } from '@/db/isPgError'
import { categoryTable, userTable } from '@/db/schema'
import { listCategories } from '@/server/procedures/category'
import { describeIfDb } from '@/server/procedures/describeIfDb'

const { mockHeaders, testSigningSecret } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  testSigningSecret: 'whsec_d2ViaG9vay10ZXN0LXNpZ25pbmctc2VjcmV0',
}))

vi.mock('next/headers', () => ({ headers: mockHeaders }))
vi.mock('@/env.mjs', () => ({ env: { WEBHOOK_SECRET: testSigningSecret } }))

import { POST } from './route'

/**
 * Real-DB suite for Clerk webhook deliveries that must not add rows: a
 * `user.created` that arrives after the auth middleware already created the
 * account (the webhook now shares the app's one `db` and writes the user and its
 * "General" in one transaction), and an event carrying no email address.
 */
vi.setConfig({ testTimeout: 30_000 })

// Every Clerk ID a test sends, so teardown can remove exactly the rows it made.
const createdClerkIds = new Set<string>()

/**
 * Mints a Clerk ID no other test (or the dev seed user) owns and registers it for teardown.
 * @returns A unique Clerk user identifier for one webhook payload.
 * @example
 * freshClerkId() // => 'test_webhook_delivery_3f2b…'
 */
function freshClerkId(): string {
  const clerkId = `test_webhook_delivery_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

/**
 * Builds a request whose Svix headers sign `body` exactly like Clerk does.
 * @param messageId - Svix message identifier bound into the signature.
 * @param body - Raw payload bytes the signature covers.
 * @returns The webhook request, with the `next/headers` mock resolving to the signed headers.
 * @example
 * const request = signedWebhookRequest('msg_late', '{"type":"user.created",…}')
 */
function signedWebhookRequest(messageId: string, body: string): Request {
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
  return new Request('https://corelive.app/api/webhooks', {
    method: 'POST',
    body,
  })
}

/**
 * Reads the stored user rows and category names for one Clerk ID.
 * @param clerkId - Clerk user identifier to look up.
 * @returns How many user rows exist and the names of their categories.
 * @example
 * await readAccountRows('test_webhook_delivery_…') // => { userCount: 1, categoryNames: ['General'] }
 */
async function readAccountRows(clerkId: string) {
  const users = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.clerkId, clerkId))
  const categories = await db
    .select({ name: categoryTable.name })
    .from(categoryTable)
    .innerJoin(userTable, eq(categoryTable.userId, userTable.id))
    .where(eq(userTable.clerkId, clerkId))
  return {
    userCount: users.length,
    categoryNames: categories.map((category) => category.name),
  }
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

describeIfDb('Clerk webhook deliveries that add no rows', () => {
  test('rejects a late user.created for an account the app already created, leaving one user and one "General"', async () => {
    // Arrange — the first authenticated request created the account before the webhook arrived.
    const clerkId = freshClerkId()
    await call(listCategories, undefined, {
      context: {
        headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
      },
    })
    const request = signedWebhookRequest(
      'msg_late',
      JSON.stringify({
        type: 'user.created',
        data: {
          id: clerkId,
          email_addresses: [{ email_address: `${clerkId}@example.com` }],
          username: 'late-user',
        },
      }),
    )

    // Act
    const failure = await POST(request).then(
      () => undefined,
      (error: unknown) => error,
    )

    // Assert — the Clerk ID unique index stops the insert and the transaction adds no second "General".
    expect(isPgError(failure, PG_UNIQUE_VIOLATION)).toBe(true)
    expect(await readAccountRows(clerkId)).toEqual({
      userCount: 1,
      categoryNames: ['General'],
    })
  })

  test('answers 400 and writes nothing for a user.created event without an email address', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const request = signedWebhookRequest(
      'msg_no_email',
      JSON.stringify({
        type: 'user.created',
        data: { id: clerkId, email_addresses: [], username: 'no-email' },
      }),
    )

    // Act
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(400)
    expect(await readAccountRows(clerkId)).toEqual({
      userCount: 0,
      categoryNames: [],
    })
  })
})
