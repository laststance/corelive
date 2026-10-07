// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { call, onError, type RouterClient } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { categoryTable, userTable } from '@/db/schema'
import { router, type AppRouter } from '@/server/router'

import { getJournal } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-database guard for the error surface: drizzle-orm's `DrizzleQueryError`
 * message embeds the full SQL text and every bound parameter, so if a procedure
 * ever echoed `error.message` (or the wrapper leaked through `cause`) a client
 * would receive query internals. A genuine failing query is pushed through the
 * same `RPCHandler` the `/api/orpc` route uses and the raw HTTP body is inspected.
 */
vi.setConfig({ testTimeout: 30_000 })

/** Fits `journal.categoryId` (a positive JS integer) but overflows PostgreSQL's int4 column, so the query fails at execution. */
const OVERFLOWING_CATEGORY_ID = 2_147_483_648

const createdClerkIds = new Set<string>()

/**
 * Reserves a unique Clerk id for one test and registers it for teardown.
 * @returns A clerk id no other test uses.
 * @example
 * const clerkId = freshClerkId() // => 'test_leak_3f2c…'
 */
function freshClerkId(): string {
  const clerkId = `test_leak_${randomUUID()}`
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
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('query failure error surface (real PostgreSQL)', () => {
  test('answers INTERNAL_SERVER_ERROR without the SQL text or bound parameters in the HTTP body', async () => {
    // Arrange — the same handler shape the /api/orpc route builds.
    const clerkId = freshClerkId()
    const serverErrors: unknown[] = []
    const handler = new RPCHandler(router, {
      clientInterceptors: [
        onError((error) => {
          serverErrors.push(error)
        }),
      ],
    })
    let responseStatus: number | undefined
    let responseBody = ''
    const client: RouterClient<AppRouter> = createORPCClient(
      new RPCLink({
        url: '/api/orpc',
        origin: 'http://localhost',
        headers: { authorization: `Bearer ${clerkId}` },
        fetch: async (url, init) => {
          const request = new Request(url, init)
          const { response } = await handler.handle(request, {
            prefix: '/api/orpc',
            context: { headers: request.headers },
          })
          if (!response)
            throw new Error('The RPC request did not match a procedure')
          responseStatus = response.status
          responseBody = await response.clone().text()
          return response
        },
      }),
    )

    // Act
    const failure = client.completed.journal({
      limit: 20,
      offset: 0,
      categoryId: OVERFLOWING_CATEGORY_ID,
    })
    await expect(failure).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch completion journal',
    })
    const body = responseBody

    // Assert
    expect(serverErrors).toEqual([
      expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        cause: expect.objectContaining({
          message: expect.stringContaining('Failed query'),
        }),
      }),
    ])
    expect(responseStatus).toBe(500)
    expect(body).toContain('INTERNAL_SERVER_ERROR')
    expect(body).not.toContain('Failed query')
    expect(body).not.toContain(String(OVERFLOWING_CATEGORY_ID))
    expect(body).not.toContain('SELECT')
    expect(body).not.toContain('"Todo"')
  })

  test('is a genuine drizzle query failure underneath, so the leak check above is not vacuous', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const options = {
      context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
    }

    // Act
    const failure = call(
      getJournal,
      { limit: 20, offset: 0, categoryId: OVERFLOWING_CATEGORY_ID },
      options,
    )

    // Assert — the wrapped error carries the query text server-side (for logs), never to the client.
    await expect(failure).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch completion journal',
      cause: { message: expect.stringContaining('Failed query') },
    })
  })
})
