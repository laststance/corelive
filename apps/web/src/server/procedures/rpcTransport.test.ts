// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryTable,
  completedTable,
  electronSettingsTable,
  todoTable,
  userTable,
} from '@/db/schema'
import { router, type AppRouter } from '@/server/router'

import { describeIfDb } from './describeIfDb'

vi.setConfig({ testTimeout: 30_000 })
const createdClerkIds = new Set<string>()

/** Encodes each integration call with the real link and decodes its response from the production handler, replacing only the network socket. @param clerkId - Isolated fixture identity, omitted for authentication failures. @example `const client = transportClient('test_transport_123')` */
function transportClient(
  clerkId?: string,
  responseStatuses: number[] = [],
): RouterClient<AppRouter> {
  const handler = new RPCHandler(router)
  return createORPCClient(
    new RPCLink({
      url: '/api/orpc',
      origin: 'http://localhost',
      headers: clerkId ? { authorization: `Bearer ${clerkId}` } : {},
      fetch: async (url, init) => {
        const request = new Request(url, init)
        const { response } = await handler.handle(request, {
          prefix: '/api/orpc',
          context: { headers: request.headers },
        })
        if (!response)
          throw new Error('The RPC request did not match a procedure')
        responseStatuses.push(response.status)
        return response
      },
    }),
  )
}

beforeEach(() => {
  // Freeze Date only, leaving the real socket and PostgreSQL timers untouched.
  vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'))
})

afterEach(async () => {
  vi.useRealTimers()
  // Remove only this suite's user-owned rows, leaving the owner's local QA database intact.
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db
      .delete(electronSettingsTable)
      .where(eq(electronSettingsTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    // Skill trees, assignments, and import batches cascade from this isolated user.
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('v2 RPC transport with real PostgreSQL', () => {
  test('preserves all 17 procedure paths and Date inputs/outputs across the five router groups', async () => {
    // Arrange
    const clerkId = `test_transport_${randomUUID()}`
    createdClerkIds.add(clerkId)
    const client = transportClient(clerkId)
    const completedAt = new Date('2026-09-30T09:00:00.000Z')

    // Act — category CRUD establishes the fixture used by the remaining router groups.
    const categories = await client.category.list()
    const defaultCategory = categories.categories.find(
      (category) => category.isDefault,
    )!
    const createdCategory = await client.category.create({
      name: 'Transport category',
      color: 'blue',
    })
    const updatedCategory = await client.category.update({
      id: createdCategory.id,
      data: { name: 'Updated transport category' },
    })
    const completed = await client.completed.create({
      categoryId: createdCategory.id,
      title: 'Direct completion',
    })
    const imported = await client.completed.importLocal({
      batchId: 'transport-batch',
      items: [
        {
          localId: 'transport-keep',
          title: 'Imported completion',
          completedAt,
        },
      ],
    })
    const journal = await client.completed.journal({
      limit: 20,
      offset: 0,
      completedFrom: new Date('2026-09-30T00:00:00.000Z'),
      completedBefore: new Date('2026-10-01T00:00:00.000Z'),
    })
    const detail = await client.completed.dayDetail({
      date: '2026-09-30',
      timezone: 'UTC',
    })
    const heatmap = await client.completed.heatmap({
      days: 365,
      timezone: 'UTC',
    })
    const bootstrap = await client.home.bootstrap({
      heatmap: { days: 365, timezone: 'UTC' },
      journal: { limit: 10, offset: 0 },
    })
    const settings = await client.electronSettings.get()
    const savedSettings = await client.electronSettings.upsert({
      hideAppIcon: true,
    })
    const tree = await client.skillTree.getMyTree()
    const [todo] = await db
      .insert(todoTable)
      .values({
        userId: tree.userId,
        categoryId: defaultCategory.id,
        text: 'Completed skill task',
        completed: true,
        completedAt,
      })
      .returning()
    const pool = await client.skillTree.getUnassignedPool()
    const assignment = await client.skillTree.assignTask({
      nodeId: tree.nodes[0]!.id,
      todoId: todo!.id,
    })
    const removedAssignment = await client.skillTree.unassignTask({
      nodeId: tree.nodes[0]!.id,
      todoId: todo!.id,
    })
    const removedCompletion = await client.completed.delete({
      id: completed.id,
    })
    const removedCategory = await client.category.delete({
      id: createdCategory.id,
    })

    // Assert
    expect(updatedCategory.name).toBe('Updated transport category')
    expect(createdCategory.createdAt).toBeInstanceOf(Date)
    expect(completed.createdAt).toBeInstanceOf(Date)
    expect(imported).toEqual({
      batchId: 'transport-batch',
      imported: 1,
      alreadyImported: false,
    })
    expect(journal.entries.map((entry) => entry.title)).toEqual([
      'Imported completion',
    ])
    expect(journal.entries[0]!.completedAt).toEqual(
      new Date('2026-09-30T09:00:00.000Z'),
    )
    expect(detail.tasks[0]!.completedAt).toEqual(
      new Date('2026-09-30T09:00:00.000Z'),
    )
    expect(heatmap.total).toBe(2)
    expect(bootstrap.journal.total).toBe(2)
    expect(
      bootstrap.journal.entries.every(
        (entry) => entry.completedAt instanceof Date,
      ),
    ).toBe(true)
    expect(settings.createdAt).toBeInstanceOf(Date)
    expect(savedSettings.hideAppIcon).toBe(true)
    expect(tree.createdAt).toBeInstanceOf(Date)
    expect(pool.map((entry) => entry.text)).toEqual(['Completed skill task'])
    expect(assignment.createdAt).toBeInstanceOf(Date)
    expect(removedAssignment?.todoText).toBe('Completed skill task')
    expect(removedCompletion.id).toBe(completed.id)
    expect(removedCategory).toEqual({
      success: true,
      movedToCategoryId: defaultCategory.id,
      promotedCategoryIds: [],
    })
  })

  test('delivers the existing UNAUTHORIZED error over the v2 wire for missing authentication', async () => {
    // Arrange
    const responseStatuses: number[] = []
    const client = transportClient(undefined, responseStatuses)

    // Act
    const request = client.category.list()

    // Assert
    await expect(request).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    })
    expect(responseStatuses).toEqual([401])
  })

  test('rejects invalid journal input through v2 decoding before running the procedure', async () => {
    // Arrange
    const clerkId = `test_transport_${randomUUID()}`
    createdClerkIds.add(clerkId)
    const responseStatuses: number[] = []
    const client = transportClient(clerkId, responseStatuses)

    // Act
    const request = client.completed.journal({ limit: 0, offset: 0 })

    // Assert
    await expect(request).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(responseStatuses).toEqual([400])
  })
})
