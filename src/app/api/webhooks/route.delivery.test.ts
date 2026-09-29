// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { DrizzleQueryError, eq, or } from 'drizzle-orm'
import type { PoolClient } from 'pg'
import { Webhook } from 'svix'
import { afterEach, expect, test, vi, type MockInstance } from 'vitest'

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

/** When the older of two accounts sharing an address was created, in Clerk and as a row. */
const OLDER_ACCOUNT_CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

/** When the newer account was created in Clerk: after the older account's row already existed. */
const NEWER_ACCOUNT_CREATED_AT = new Date('2026-06-01T00:00:00.000Z')

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
 * @param createdAt - When Clerk created the account, sent as the payload's `created_at`.
 * @returns The signed webhook request.
 * @example
 * userCreatedRequest('msg_1', 'test_webhook_delivery_…', 'a@example.com', 'ann')
 */
function userCreatedRequest(
  messageId: string,
  clerkId: string,
  email: string,
  username: string,
  createdAt: Date = NEWER_ACCOUNT_CREATED_AT,
): Request {
  return signedWebhookRequest(
    messageId,
    JSON.stringify({
      type: 'user.created',
      data: {
        id: clerkId,
        email_addresses: [{ email_address: email }],
        username,
        created_at: createdAt.getTime(),
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
      createdAt: OLDER_ACCOUNT_CREATED_AT,
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

  test('records which accounts lost their address by row id only, never the address or a Clerk ID, because clearing it cannot be undone and a Clerk ID is a working API credential', async () => {
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
        createdAt: OLDER_ACCOUNT_CREATED_AT,
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
    const [created] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.clerkId, newClerkId))
    expect(webhookWarn).toHaveBeenCalledTimes(1)
    expect(webhookWarn).toHaveBeenCalledWith(
      { userId: created?.id, releasedUserIds: [stale?.id] },
      'Released an email address from stale accounts',
    )
    const logged = JSON.stringify(webhookWarn.mock.calls)
    expect(logged).not.toContain(sharedEmail)
    expect(logged).not.toContain(staleClerkId)
    expect(logged).not.toContain(newClerkId)
  })

  test('rolls the release back when a later statement of the same transaction fails, so the stale account keeps its address and no release is logged', async () => {
    // Arrange — a stale account holds the address, and the transaction's "General" insert is made to fail
    // on the connection the route checks out, after the release UPDATE already ran inside the transaction.
    const staleClerkId = freshClerkId()
    const newClerkId = freshClerkId()
    const sharedEmail = `${newClerkId}@example.com`
    await db.insert(userTable).values({
      clerkId: staleClerkId,
      email: sharedEmail,
      name: 'Old Account',
      createdAt: OLDER_ACCOUNT_CREATED_AT,
    })
    let categoryInsertSpy: MockInstance | undefined
    const failCategoryInsert = (client: PoolClient) => {
      const realQuery = client.query.bind(client) as (
        ...args: unknown[]
      ) => unknown
      categoryInsertSpy = vi
        .spyOn(client, 'query')
        .mockImplementation((...args: unknown[]) => {
          const first = args[0]
          const text =
            typeof first === 'string'
              ? first
              : ((first as { text?: string }).text ?? '')
          return text.startsWith('insert into "Category"')
            ? Promise.reject(new Error('category insert failed'))
            : realQuery(...args)
        })
    }
    db.$client.once('acquire', failCategoryInsert)
    const request = userCreatedRequest(
      'msg_rolled_back',
      newClerkId,
      sharedEmail,
      'new-account',
    )

    try {
      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(500)
      expect(webhookWarn).not.toHaveBeenCalled()
      const [stale] = await db
        .select({ email: userTable.email })
        .from(userTable)
        .where(eq(userTable.clerkId, staleClerkId))
      expect(stale).toEqual({ email: sharedEmail })
      expect(await readAccountRows(newClerkId)).toEqual({
        userCount: 0,
        categoryNames: [],
      })
    } finally {
      // The pooled connection is reused by later tests: put its real `query` back.
      db.$client.off('acquire', failCategoryInsert)
      categoryInsertSpy?.mockRestore()
    }
  })

  test("keeps the address with the newer account when an older account's user.created is replayed, storing the replayed account without an email", async () => {
    // Arrange — the older account was deleted in Clerk, the newer one registered with its address, and the
    // route already handed the address over. Then Svix replays the older account's historical event.
    const olderClerkId = freshClerkId()
    const newerClerkId = freshClerkId()
    const sharedEmail = `${newerClerkId}@example.com`
    const [older] = await db
      .insert(userTable)
      .values({
        clerkId: olderClerkId,
        email: sharedEmail,
        name: 'Old Account',
        createdAt: OLDER_ACCOUNT_CREATED_AT,
      })
      .returning({ id: userTable.id })
    await POST(
      userCreatedRequest(
        'msg_newer_registers',
        newerClerkId,
        sharedEmail,
        'newer-account',
        NEWER_ACCOUNT_CREATED_AT,
      ),
    )
    webhookWarn.mockClear()

    // Act
    const replay = await POST(
      userCreatedRequest(
        'msg_older_replayed',
        olderClerkId,
        sharedEmail,
        'older-account',
        OLDER_ACCOUNT_CREATED_AT,
      ),
    )

    // Assert
    expect(replay.status).toBe(201)
    const stored = await db
      .select({
        id: userTable.id,
        clerkId: userTable.clerkId,
        email: userTable.email,
      })
      .from(userTable)
      .where(
        or(
          eq(userTable.clerkId, olderClerkId),
          eq(userTable.clerkId, newerClerkId),
        ),
      )
    expect(stored).toEqual(
      expect.arrayContaining([
        { id: older?.id, clerkId: olderClerkId, email: null },
        { id: expect.any(Number), clerkId: newerClerkId, email: sharedEmail },
      ]),
    )
    const newer = stored.find((row) => row.clerkId === newerClerkId)
    expect(webhookWarn).toHaveBeenCalledTimes(1)
    expect(webhookWarn).toHaveBeenCalledWith(
      { userId: older?.id, heldByUserId: newer?.id },
      'Stored an account without an email: a newer account holds the address',
    )
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
  // Arrange — the failure is injected where the route first touches the database: the pool checkout inside
  // `runTransaction`. The error has the shape drizzle throws (SQL and bound values on the error object), so the
  // test proves those never reach the response body. No row is ever written, so the ID stays out of the DB
  // teardown set and the test runs without a database.
  const clerkId = `test_webhook_delivery_${randomUUID()}`
  const email = `${clerkId}@example.com`
  const connectionFailure = new DrizzleQueryError(
    'insert into "User" ("clerkId", "email") values ($1, $2)',
    [clerkId, email],
    new Error('connection terminated'),
  )
  const connect = vi
    .spyOn(db.$client, 'connect')
    .mockRejectedValueOnce(connectionFailure)
  const request = userCreatedRequest('msg_db_down', clerkId, email, 'unlucky')

  // Act
  const response = await POST(request)

  // Assert
  expect(response.status).toBe(500)
  expect(await response.text()).toBe('Error occured')
  expect(webhookError).toHaveBeenCalledWith(
    { error: connectionFailure, svixId: 'msg_db_down' },
    'Clerk user sync failed',
  )
  connect.mockRestore()
})
