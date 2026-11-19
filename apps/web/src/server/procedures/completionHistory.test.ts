// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'

import { call } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'
import { eq, sql } from 'drizzle-orm'
import { afterEach, expect, test } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import {
  categoryTable,
  completedTable,
  completionSyncStateTable,
  userTable,
} from '@/db/schema'

import { readAccountFrames } from '../../../../desktop/electron/mcp/historyStream'
import { createMcpAccountClient } from '../../../../desktop/electron/offline/createSyncTransport'

import { historyRange } from './completionHistory'
import { describeIfDb } from './describeIfDb'

const during = {
  from: Date.parse('2026-05-12T00:00:00Z'),
  before: Date.parse('2026-05-13T00:00:00Z'),
}
const cleanupUsers: number[] = []

async function seedOwner(count: number) {
  const clerkId = `test_mcp_history_${randomUUID()}`
  const user = requireRow(
    await db
      .insert(userTable)
      .values({ clerkId })
      .returning({ id: userTable.id }),
    'user.insert',
  )
  cleanupUsers.push(user.id)
  const category = requireRow(
    await db
      .insert(categoryTable)
      .values({ name: 'Writing', color: 'blue', userId: user.id })
      .returning({ id: categoryTable.id }),
    'category.insert',
  )
  // A single fixture statement keeps the 36,500-row test practical in CI and local PostgreSQL.
  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO "Completed" (title, "userId", "categoryId", "completedAt", "createdAt", "updatedAt")
    SELECT 'Ship ' || n || ' ' || repeat('x', 125), ${user.id}, ${category.id},
           '2026-05-12T10:00:00'::timestamp, now(), now() FROM generate_series(1, ${count}::integer) n
    RETURNING id
  `)
  return {
    clerkId,
    userId: user.id,
    categoryId: category.id,
    ids: result.rows.map((row) => row.id),
  }
}

afterEach(async () => {
  for (const userId of cleanupUsers.splice(0)) {
    await db
      .delete(completionSyncStateTable)
      .where(eq(completionSyncStateTable.userId, userId))
    await db.delete(completedTable).where(eq(completedTable.userId, userId))
    await db.delete(categoryTable).where(eq(categoryTable.userId, userId))
    await db.delete(userTable).where(eq(userTable.id, userId))
  }
})

describeIfDb('attached Mac history from PostgreSQL', () => {
  test('the stream fixes titles and membership before the next database edit and joins only the issuing account’s confirmed identities', async () => {
    // Arrange
    const owner = await seedOwner(130),
      other = await seedOwner(1)
    await db
      .update(completedTable)
      .set({ title: 'Original title' })
      .where(eq(completedTable.userId, owner.userId))
    const completionId = randomUUID()
    const state = {
      revision: 1,
      cancelled: false,
      categoryId: owner.categoryId,
      title: 'sample',
      completedAt: new Date(during.from),
      originalCompletedAt: new Date(during.from),
      timezone: 'UTC',
      deviceId: randomUUID(),
    }
    await db.insert(completionSyncStateTable).values([
      {
        ...state,
        userId: owner.userId,
        completionId,
        completedId: owner.ids[0]!,
      },
      {
        ...state,
        userId: other.userId,
        completionId: randomUUID(),
        completedId: owner.ids[1]!,
      },
    ])
    const context = {
      headers: new Headers({ Authorization: `Bearer ${owner.clerkId}` }),
    }
    const frames = await call(historyRange, during, { context })
    const first = await frames.next()
    expect(first.value).toMatchObject({ type: 'rows', offset: 0 })
    if (first.done || first.value.type !== 'rows')
      throw new Error('Expected the first history page')
    const firstPageIds = new Set(first.value.entries.map((row) => row.id))
    const [toUpdate, toDelete] = owner.ids.filter((id) => !firstPageIds.has(id))
    if (toUpdate === undefined || toDelete === undefined)
      throw new Error('Expected two unread rows')

    // Act
    await db
      .update(completedTable)
      .set({ title: 'Changed mid-read' })
      .where(eq(completedTable.id, toUpdate))
    await db.delete(completedTable).where(eq(completedTable.id, toDelete))
    const original = await readAccountFrames(
      (async function* () {
        yield first.value
        yield* frames
      })(),
      owner.clerkId,
      during,
    )
    const next = await readAccountFrames(
      await call(historyRange, during, { context }),
      owner.clerkId,
      during,
    )

    // Assert
    expect(original).toHaveLength(130)
    expect(original.find((row) => row.id === owner.ids[0])?.completionId).toBe(
      completionId,
    )
    expect(
      original.find((row) => row.id === owner.ids[1])?.completionId,
    ).toBeNull()
    expect(original.some((row) => row.id === other.ids[0])).toBe(false)
    expect(original.find((row) => row.id === toUpdate)?.title).toBe(
      'Original title',
    )
    expect(original.find((row) => row.id === toDelete)?.title).toBe(
      'Original title',
    )
    expect(next).toHaveLength(129)
    expect(next.find((row) => row.id === toUpdate)?.title).toBe(
      'Changed mid-read',
    )
    expect(next.some((row) => row.id === toDelete)).toBe(false)
  }, 30_000)

  test('the ordinary Mac transport verifies every member of a 36,500-row account range over a streamed HTTP response larger than 4.5 MB', async () => {
    // Arrange
    const owner = await seedOwner(36_500)
    const handler = new RPCHandler({ completed: { historyRange } })
    const server = createServer((request, response) => {
      // This isolated adapter verifies a synthetic bearer. The production route verifies Clerk instead.
      if (request.headers.authorization !== 'Bearer mcp-local-qa') {
        response.writeHead(401).end()
        return
      }
      void handler
        .handle(request, response, {
          prefix: '/api/orpc',
          context: {
            headers: new Headers({ Authorization: `Bearer ${owner.clerkId}` }),
          },
        })
        .catch(() => response.destroy())
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw Error('Expected a local HTTP address')
    let bytes = 0
    const client = createMcpAccountClient(
      `http://127.0.0.1:${address.port}`,
      'mcp-local-qa',
      async (url, init) => {
        const response = await fetch(url, init)
        const body = response.body?.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              bytes += chunk.byteLength
              controller.enqueue(chunk)
            },
          }),
        )
        return new Response(body, {
          headers: response.headers,
          status: response.status,
        })
      },
    )
    const before = performance.now()
    let peakRss = process.memoryUsage.rss()
    const sampling = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage.rss())
    }, 10)
    try {
      // Act
      const rows = await readAccountFrames(
        await client.completed.historyRange(during),
        owner.clerkId,
        during,
      )

      // Assert
      expect(bytes).toBeGreaterThan(4_500_000)
      expect(rows).toHaveLength(36_500)
      expect(new Set(rows.map((row) => row.id))).toEqual(new Set(owner.ids))
      process.stdout.write(
        `MCP history loopback: ${rows.length} verified rows, ${bytes} wire bytes, ${Math.round(performance.now() - before)} ms, ${peakRss} bytes peak test-process RSS\n`,
      )
    } finally {
      clearInterval(sampling)
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  }, 40_000)

  test('the full supported local calendar covers UTC instants just outside four-digit years', async () => {
    // Arrange
    const owner = await seedOwner(3)
    await db.execute(
      sql`UPDATE "Completed" SET "completedAt" = '0001-12-31 16:00:00 BC'::timestamp WHERE id = ${owner.ids[0]}`,
    )
    await db.execute(
      sql`UPDATE "Completed" SET "completedAt" = '10000-01-01 04:00:00'::timestamp WHERE id = ${owner.ids[2]}`,
    )
    const context = {
      headers: new Headers({ Authorization: `Bearer ${owner.clerkId}` }),
    }
    const entireCalendar = {
      from: Date.parse('0000-12-31T12:00:00Z'),
      before: Date.parse('+010000-01-01T08:00:00Z'),
    }

    // Act
    const frames = await call(historyRange, entireCalendar, { context })
    const rows = await readAccountFrames(frames, owner.clerkId, entireCalendar)

    // Assert
    expect(rows.map((row) => row.completedAt).sort((a, b) => a - b)).toEqual([
      -62135625600000, 1778580000000, 253402315200000,
    ])
  })
})
