// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { DrizzleQueryError, eq, or } from 'drizzle-orm'
import { Webhook } from 'svix'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { categoryTable, userTable } from '@/db/schema'
import type * as LoggerModule from '@/lib/logger'
import { listCategories } from '@/server/procedures/category'
import { describeIfDb } from '@/server/procedures/describeIfDb'

const { mockHeaders, testSigningSecret, webhookWarn, webhookError } =
  vi.hoisted(() => ({
    mockHeaders: vi.fn(),
    testSigningSecret: 'whsec_d2ViaG9vay10ZXN0LXNpZ25pbmctc2VjcmV0',
    webhookWarn: vi.fn(),
    webhookError: vi.fn(),
  }))

vi.mock('next/headers', () => ({ headers: mockHeaders }))
vi.mock('@/env.mjs', () => ({ env: { WEBHOOK_SECRET: testSigningSecret } }))
// Only the webhook's own module logger is replaced, so its log calls can be asserted; every other logger stays real.
vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof LoggerModule>()
  return {
    ...actual,
    createModuleLogger: (module: string) => {
      const real = actual.createModuleLogger(module)
      return module === 'clerkWebhook'
        ? Object.assign(Object.create(real), {
            warn: webhookWarn,
            error: webhookError,
          })
        : real
    },
  }
})

import { POST } from './route'

/**
 * Suite for Clerk webhook deliveries beyond the first clean `user.created`: one
 * that arrives late (the auth middleware already created the account), one that
 * is delivered twice, one whose email a stale account still holds, one with no
 * email address, and a database write that fails. The webhook shares the app's
 * one `db` and writes the user and its "General" in one transaction.
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
  webhookWarn.mockClear()
  webhookError.mockClear()
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

/**
 * Builds a signed `user.created` request for one account.
 * @param messageId - Svix message identifier bound into the signature.
 * @param clerkId - Clerk user identifier in the payload.
 * @param email - Address in the payload's first email entry.
 * @param username - Username the route stores as the account name.
 * @returns The signed webhook request.
 * @example
 * userCreatedRequest('msg_1', 'test_webhook_delivery_…', 'a@example.com', 'ann')
 */
function userCreatedRequest(
  messageId: string,
  clerkId: string,
  email: string,
  username: string,
): Request {
  return signedWebhookRequest(
    messageId,
    JSON.stringify({
      type: 'user.created',
      data: {
        id: clerkId,
        email_addresses: [{ email_address: email }],
        username,
      },
    }),
  )
}

/**
 * Creates the account the way the auth middleware does on a first request: a user row with no name or email, plus "General".
 * @param clerkId - Clerk user identifier the request authenticates as.
 * @returns Nothing once the account exists.
 * @example
 * await createAccountThroughMiddleware(freshClerkId())
 */
async function createAccountThroughMiddleware(clerkId: string): Promise<void> {
  await call(listCategories, undefined, {
    context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
  })
}

describeIfDb('Clerk webhook deliveries against an existing database', () => {
  test('completes a late user.created for an account the app already created, filling its name and email and keeping one "General"', async () => {
    // Arrange — the first authenticated request created the account before the webhook arrived.
    const clerkId = freshClerkId()
    await createAccountThroughMiddleware(clerkId)
    const request = userCreatedRequest(
      'msg_late',
      clerkId,
      `${clerkId}@example.com`,
      'late-user',
    )

    // Act
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(201)
    expect(await readAccountRows(clerkId)).toEqual({
      userCount: 1,
      categoryNames: ['General'],
    })
    const [stored] = await db
      .select({ name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    expect(stored).toEqual({
      name: 'late-user',
      email: `${clerkId}@example.com`,
    })
  })

  test('keeps the name and email an account already holds when a late user.created carries different ones', async () => {
    // Arrange
    const clerkId = freshClerkId()
    await createAccountThroughMiddleware(clerkId)
    await db
      .update(userTable)
      .set({ name: 'Renamed In App', email: `${clerkId}-current@example.com` })
      .where(eq(userTable.clerkId, clerkId))
    const request = userCreatedRequest(
      'msg_stale_payload',
      clerkId,
      `${clerkId}-original@example.com`,
      'original-name',
    )

    // Act
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(201)
    const [stored] = await db
      .select({ name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    expect(stored).toEqual({
      name: 'Renamed In App',
      email: `${clerkId}-current@example.com`,
    })
  })

  test('answers a Svix retry of an already handled user.created with 201 and no second user or "General"', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const email = `${clerkId}@example.com`
    await POST(userCreatedRequest('msg_first', clerkId, email, 'retried'))

    // Act
    const retry = await POST(
      userCreatedRequest('msg_first', clerkId, email, 'retried'),
    )

    // Assert
    expect(retry.status).toBe(201)
    expect(await readAccountRows(clerkId)).toEqual({
      userCount: 1,
      categoryNames: ['General'],
    })
  })

  test('creates a re-registered Clerk account whose address a deleted account still holds, releasing the address from the stale row', async () => {
    // Arrange — no user.deleted handler exists, so the old account's row keeps the address.
    const staleClerkId = freshClerkId()
    const newClerkId = freshClerkId()
    const sharedEmail = `${newClerkId}@example.com`
    await db.insert(userTable).values({
      clerkId: staleClerkId,
      email: sharedEmail,
      name: 'Old Account',
    })
    const request = userCreatedRequest(
      'msg_reregistered',
      newClerkId,
      sharedEmail,
      'new-account',
    )

    // Act
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(201)
    const stored = await db
      .select({ clerkId: userTable.clerkId, email: userTable.email })
      .from(userTable)
      .where(
        or(
          eq(userTable.clerkId, staleClerkId),
          eq(userTable.clerkId, newClerkId),
        ),
      )
    expect(stored).toEqual(
      expect.arrayContaining([
        { clerkId: staleClerkId, email: null },
        { clerkId: newClerkId, email: sharedEmail },
      ]),
    )
    expect(await readAccountRows(newClerkId)).toEqual({
      userCount: 1,
      categoryNames: ['General'],
    })
  })

  test('records which accounts lost their address, by id and Clerk ID and never the address itself, because clearing it cannot be undone', async () => {
    // Arrange
    const staleClerkId = freshClerkId()
    const newClerkId = freshClerkId()
    const sharedEmail = `${newClerkId}@example.com`
    const [stale] = await db
      .insert(userTable)
      .values({
        clerkId: staleClerkId,
        email: sharedEmail,
        name: 'Old Account',
      })
      .returning({ id: userTable.id })
    const request = userCreatedRequest(
      'msg_release_logged',
      newClerkId,
      sharedEmail,
      'new-account',
    )

    // Act
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(201)
    expect(webhookWarn).toHaveBeenCalledTimes(1)
    expect(webhookWarn).toHaveBeenCalledWith(
      {
        clerkId: newClerkId,
        releasedFrom: [{ id: stale?.id, clerkId: staleClerkId }],
      },
      'Released an email address from stale accounts',
    )
    expect(JSON.stringify(webhookWarn.mock.calls)).not.toContain(sharedEmail)
  })

  test('logs nothing about released addresses when no other account held the address', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const request = userCreatedRequest(
      'msg_nothing_released',
      clerkId,
      `${clerkId}@example.com`,
      'plain-signup',
    )

    // Act
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(201)
    expect(webhookWarn).not.toHaveBeenCalled()
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

test('answers 500 with a bare body when the database write fails, so the failed query and the new user email never reach Clerk or the response', async () => {
  // Arrange — the transaction rejects the way drizzle does: wrapping the SQL and its bound values.
  // No row is ever written, so the ID stays out of the DB teardown set and the test runs without a database.
  const clerkId = `test_webhook_delivery_${randomUUID()}`
  const email = `${clerkId}@example.com`
  const failedInsert = new DrizzleQueryError(
    'insert into "User" ("clerkId", "email") values ($1, $2)',
    [clerkId, email],
    new Error('connection terminated'),
  )
  // `runTransaction` checks a connection out of the pool first, so that is where the failure is injected.
  const connect = vi
    .spyOn(db.$client, 'connect')
    .mockRejectedValueOnce(failedInsert)
  const request = userCreatedRequest('msg_db_down', clerkId, email, 'unlucky')

  // Act
  const response = await POST(request)

  // Assert
  expect(response.status).toBe(500)
  expect(await response.text()).toBe('Error occured')
  expect(webhookError).toHaveBeenCalledWith(
    { error: failedInsert, clerkId },
    'Clerk user sync failed',
  )
  connect.mockRestore()
})
