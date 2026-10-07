// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryTable,
  completedTable,
  todoTable,
  userTable,
} from '@/db/schema'

import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from './category'
import { createCompleted, getDayDetail, getJournal } from './completed'
import { describeIfDb } from './describeIfDb'

vi.setConfig({ testTimeout: 30_000 })
const createdUsers = new Set<number>()

/** Builds authenticated direct-call options so hierarchy tests exercise real middleware and PostgreSQL.
 * @example const options = authOptions('test_hierarchy')
 */
function authOptions(clerkId: string) {
  return {
    context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
  }
}

/** Provisions General through the real bootstrap so every hierarchy scenario starts from a writing-ready account.
 * @example const account = await arrangeAccount()
 */
async function arrangeAccount() {
  const options = authOptions(`test_hierarchy_${randomUUID()}`)
  const { categories } = await call(listCategories, undefined, options)
  const general = categories[0]!
  createdUsers.add(general.userId)
  return { options, general, userId: general.userId }
}

/** Adds the approved Work/CoreLive/Client work fixture through the category API.
 * @example const fixture = await arrangeHierarchy()
 */
async function arrangeHierarchy() {
  const account = await arrangeAccount()
  const work = await call(
    createCategory,
    { name: 'Work', color: 'rose' },
    account.options,
  )
  const corelive = await call(
    createCategory,
    { name: 'CoreLive', parentId: work.id },
    account.options,
  )
  const client = await call(
    createCategory,
    { name: 'Client work', parentId: work.id },
    account.options,
  )
  return { ...account, work, corelive, client }
}

afterEach(async () => {
  // Delete child references before roots; every touched account is owned by this suite.
  for (const userId of createdUsers) {
    await db.delete(completedTable).where(eq(completedTable.userId, userId))
    await db.delete(todoTable).where(eq(todoTable.userId, userId))
    await db
      .delete(categoryTable)
      .where(
        and(
          eq(categoryTable.userId, userId),
          isNotNull(categoryTable.parentId),
        ),
      )
    await db.delete(categoryTable).where(eq(categoryTable.userId, userId))
    await db.delete(userTable).where(eq(userTable.id, userId))
  }
  createdUsers.clear()
})

describeIfDb(
  'two-level categories preserve writing and parent retrospectives (real PostgreSQL)',
  () => {
    test('creates main and subcategories with explicit colors or their parent color, trimming names only', async () => {
      // Arrange
      const { options, work, corelive } = await arrangeHierarchy()
      // Act
      const explicit = await call(
        createCategory,
        { name: '  Design  ', parentId: work.id, color: 'blue' },
        options,
      )
      const root = await call(createCategory, { name: 'Life' }, options)
      // Assert
      expect(corelive).toMatchObject({
        name: 'CoreLive',
        parentId: work.id,
        color: 'rose',
      })
      expect(explicit).toMatchObject({
        name: 'Design',
        parentId: work.id,
        color: 'blue',
      })
      expect(root).toMatchObject({ parentId: null, color: 'blue' })
    })

    test('allows duplicate child names in different parents but rejects sibling or root duplicates', async () => {
      // Arrange
      const { options, work } = await arrangeHierarchy()
      const personal = await call(createCategory, { name: 'Personal' }, options)
      await call(createCategory, { name: 'Design', parentId: work.id }, options)
      // Act
      const other = await call(
        createCategory,
        { name: 'Design', parentId: personal.id },
        options,
      )
      const sibling = call(
        createCategory,
        { name: 'Design', parentId: work.id },
        options,
      )
      const root = call(createCategory, { name: 'Work' }, options)
      // Assert
      expect(other.parentId).toBe(personal.id)
      await expect(sibling).rejects.toMatchObject({
        code: 'CONFLICT',
        message:
          'A subcategory named "Design" already exists under this parent.',
      })
      await expect(root).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A main category named "Work" already exists.',
      })
    })

    test('names an existing child when a parent-only move collides with a sibling and keeps its original parent', async () => {
      // Arrange
      const { options, work } = await arrangeHierarchy()
      const personal = await call(createCategory, { name: 'Personal' }, options)
      const design = await call(
        createCategory,
        { name: 'Design', parentId: work.id },
        options,
      )
      await call(
        createCategory,
        { name: 'Design', parentId: personal.id },
        options,
      )
      // Act — no name is supplied; the conflict must report the stored name.
      const move = call(
        updateCategory,
        { id: design.id, data: { parentId: personal.id } },
        options,
      )
      // Assert
      await expect(move).rejects.toMatchObject({
        code: 'CONFLICT',
        message:
          'A subcategory named "Design" already exists under this parent.',
      })
      const { categories } = await call(listCategories, undefined, options)
      expect(
        categories.find((category) => category.id === design.id),
      ).toMatchObject({ name: 'Design', parentId: work.id })
    })

    test('blocks third levels, self-parenting, cycles and foreign-owned parents without changing the hierarchy', async () => {
      // Arrange
      const { options, work, corelive } = await arrangeHierarchy()
      const other = await arrangeAccount()
      // Act / Assert
      await expect(
        call(
          createCategory,
          { name: 'Grandchild', parentId: corelive.id },
          options,
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
        call(
          updateCategory,
          { id: corelive.id, data: { parentId: corelive.id } },
          options,
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
        call(
          updateCategory,
          { id: work.id, data: { parentId: corelive.id } },
          options,
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
        call(
          createCategory,
          { name: 'Foreign', parentId: other.general.id },
          options,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const { categories } = await call(listCategories, undefined, options)
      expect(
        categories.find((category) => category.id === work.id)?.parentId,
      ).toBe(null)
      expect(
        categories.find((category) => category.id === corelive.id)?.parentId,
      ).toBe(work.id)
    })

    test('keeps General rooted and protected while allowing a child named General elsewhere', async () => {
      // Arrange
      const { options, work, general } = await arrangeHierarchy()
      // Act
      const child = await call(
        createCategory,
        { name: 'General', parentId: work.id },
        options,
      )
      await expect(
        call(
          updateCategory,
          { id: general.id, data: { parentId: work.id } },
          options,
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(
        call(deleteCategory, { id: general.id }, options),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      // Assert
      const { categories } = await call(listCategories, undefined, options)
      expect(child.parentId).toBe(work.id)
      expect(
        categories
          .filter((category) => category.isDefault)
          .map((category) => category.id),
      ).toEqual([general.id])
    })

    test('requires moving children before their main category becomes a subcategory', async () => {
      // Arrange
      const { options, work } = await arrangeHierarchy()
      const personal = await call(createCategory, { name: 'Personal' }, options)
      // Act
      const move = call(
        updateCategory,
        { id: work.id, data: { parentId: personal.id } },
        options,
      )
      // Assert
      await expect(move).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    test('counts all direct records for deletion without multiplying Todo and Completed rows or counting children', async () => {
      // Arrange
      const { options, userId, work, corelive } = await arrangeHierarchy()
      await db.insert(todoTable).values([
        { userId, categoryId: work.id, text: 'Open' },
        { userId, categoryId: work.id, text: 'Done', completed: true },
      ])
      await db.insert(completedTable).values([
        { userId, categoryId: work.id, title: 'Keep' },
        { userId, categoryId: work.id, title: 'Archived', archived: true },
        { userId, categoryId: corelive.id, title: 'Child' },
      ])
      // Act
      const { categories } = await call(listCategories, undefined, options)
      // Assert
      expect(
        categories.find((category) => category.id === work.id),
      ).toMatchObject({ recordCount: 4, _count: { todos: 1 } })
      expect(
        categories.find((category) => category.id === corelive.id)?.recordCount,
      ).toBe(1)
    })

    test('promotes children when deleting a parent and transfers only direct records without changing legacy completion dates', async () => {
      // Arrange
      const { options, userId, work, corelive, client, general } =
        await arrangeHierarchy()
      const oldDate = new Date('2025-01-02T03:04:05.000Z')
      const [legacy] = await db
        .insert(todoTable)
        .values({
          userId,
          categoryId: work.id,
          text: 'Legacy',
          completed: true,
          completedAt: null,
          updatedAt: oldDate,
          createdAt: oldDate,
        })
        .returning()
      const [direct] = await db
        .insert(completedTable)
        .values({
          userId,
          categoryId: work.id,
          title: 'Direct',
          archived: true,
          completedAt: oldDate,
          updatedAt: oldDate,
          createdAt: oldDate,
        })
        .returning()
      const child = await call(
        createCompleted,
        { categoryId: corelive.id, title: 'Child' },
        options,
      )
      // Act
      const deleted = await call(deleteCategory, { id: work.id }, options)
      // Assert
      expect(deleted).toEqual({
        success: true,
        movedToCategoryId: general.id,
        promotedCategoryIds: [corelive.id, client.id],
      })
      const [storedTodo] = await db
        .select()
        .from(todoTable)
        .where(eq(todoTable.id, legacy!.id))
      const [storedDirect] = await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.id, direct!.id))
      const [storedChild] = await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.id, child.id))
      expect(storedTodo).toMatchObject({
        categoryId: general.id,
        createdAt: oldDate,
        updatedAt: oldDate,
        completedAt: null,
      })
      expect(storedDirect).toMatchObject({
        categoryId: general.id,
        createdAt: oldDate,
        updatedAt: oldDate,
        completedAt: oldDate,
      })
      expect(storedChild?.categoryId).toBe(corelive.id)
      const day = await call(
        getDayDetail,
        { date: '2025-01-02', timezone: 'UTC' },
        options,
      )
      expect(day.count).toBe(1)
      expect(day.tasks[0]?.completedAt).toEqual(oldDate)
    })

    test.each(['General', 'same-named child'] as const)(
      'deletes a main category with a same-named child while preserving entries transferred to %s',
      async (destination) => {
        // Arrange — root and child names may match because uniqueness is scoped to siblings.
        const { options, userId, work, corelive, client, general } =
          await arrangeHierarchy()
        const sameNamedChild = await call(
          createCategory,
          { name: 'Work', parentId: work.id },
          options,
        )
        const date = new Date('2025-02-03T04:05:06.000Z')
        const [direct] = await db
          .insert(completedTable)
          .values({
            userId,
            categoryId: work.id,
            title: 'Parent entry',
            createdAt: date,
            updatedAt: date,
            completedAt: date,
          })
          .returning()
        const [childEntry] = await db
          .insert(completedTable)
          .values({
            userId,
            categoryId: sameNamedChild.id,
            title: 'Child entry',
            createdAt: date,
            updatedAt: date,
            completedAt: date,
          })
          .returning()
        const targetId =
          destination === 'General' ? general.id : sameNamedChild.id
        // Act
        const removed = await call(
          deleteCategory,
          {
            id: work.id,
            ...(destination === 'General'
              ? {}
              : { targetCategoryId: sameNamedChild.id }),
          },
          options,
        )
        // Assert
        expect(removed).toEqual({
          success: true,
          movedToCategoryId: targetId,
          promotedCategoryIds: [corelive.id, client.id, sameNamedChild.id],
        })
        const { categories } = await call(listCategories, undefined, options)
        expect(categories.some((category) => category.id === work.id)).toBe(
          false,
        )
        expect(
          categories.find((category) => category.id === sameNamedChild.id),
        ).toMatchObject({ name: 'Work', parentId: null })
        expect(categories.every((category) => category.name.length <= 30)).toBe(
          true,
        )
        const [storedDirect] = await db
          .select()
          .from(completedTable)
          .where(eq(completedTable.id, direct!.id))
        const [storedChild] = await db
          .select()
          .from(completedTable)
          .where(eq(completedTable.id, childEntry!.id))
        expect(storedDirect).toMatchObject({
          id: direct!.id,
          categoryId: targetId,
          createdAt: date,
          updatedAt: date,
          completedAt: date,
        })
        expect(storedChild).toMatchObject({
          id: childEntry!.id,
          categoryId: sameNamedChild.id,
          createdAt: date,
          updatedAt: date,
          completedAt: date,
        })
      },
    )

    test('restores a same-named parent and its children when record transfer fails after promotion', async () => {
      // Arrange — a direct database deletion races the destination after API validation.
      const { options, userId, work, general } = await arrangeHierarchy()
      const child = await call(
        createCategory,
        { name: 'Work', parentId: work.id },
        options,
      )
      const date = new Date('2025-02-03T04:05:06.000Z')
      const [record] = await db
        .insert(completedTable)
        .values({
          userId,
          categoryId: work.id,
          title: 'Retained entry',
          createdAt: date,
          updatedAt: date,
          completedAt: date,
        })
        .returning()
      const holder = await db.$client.connect()
      let failed: Promise<unknown> | undefined
      try {
        const { rows } = await holder.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        )
        const holderPid = rows[0]?.pid
        if (holderPid === undefined) throw new Error('Lock holder PID missing')
        await holder.query('BEGIN')
        await holder.query('DELETE FROM "Category" WHERE id = $1', [general.id])
        failed = call(
          deleteCategory,
          { id: work.id, targetCategoryId: general.id },
          options,
        ).then(
          () => undefined,
          (error: unknown) => error,
        )
        await vi.waitFor(async () => {
          const result = await db.$client.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
            [holderPid],
          )
          expect(result.rows[0]?.count).toBe(1)
        })
        // Act — the transfer's FK fails only after the root name was freed and children promoted.
        await holder.query('COMMIT')
        expect(await failed).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
        // Assert — the entire category transaction rolls back, including its internal temporary name.
        const { categories } = await call(listCategories, undefined, options)
        expect(
          categories.find((category) => category.id === work.id),
        ).toMatchObject({ name: 'Work', parentId: null })
        expect(
          categories.find((category) => category.id === child.id),
        ).toMatchObject({ name: 'Work', parentId: work.id })
        const [retained] = await db
          .select()
          .from(completedTable)
          .where(eq(completedTable.id, record!.id))
        expect(retained).toMatchObject({
          id: record!.id,
          categoryId: work.id,
          createdAt: date,
          updatedAt: date,
          completedAt: date,
        })
      } finally {
        await holder.query('ROLLBACK')
        holder.release()
        await failed
      }
    })

    test('moves a deleted child into its parent or an explicitly selected surviving child', async () => {
      // Arrange
      const { options, userId, work, corelive, client } =
        await arrangeHierarchy()
      const first = await call(
        createCompleted,
        { categoryId: corelive.id, title: 'First' },
        options,
      )
      // Act
      const response = await call(deleteCategory, { id: corelive.id }, options)
      const second = await call(
        createCompleted,
        { categoryId: client.id, title: 'Second' },
        options,
      )
      await call(
        deleteCategory,
        { id: client.id, targetCategoryId: work.id },
        options,
      )
      // Assert
      expect(response.movedToCategoryId).toBe(work.id)
      const records = await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.userId, userId))
      expect(records.map((record) => [record.id, record.categoryId])).toEqual([
        [first.id, work.id],
        [second.id, work.id],
      ])
    })

    test('retains the complete hierarchy and entries when child promotion would conflict with a main category', async () => {
      // Arrange
      const { options, work, corelive } = await arrangeHierarchy()
      await call(createCategory, { name: 'CoreLive' }, options)
      const sameNamedChild = await call(
        createCategory,
        { name: 'Work', parentId: work.id },
        options,
      )
      const entry = await call(
        createCompleted,
        { categoryId: work.id, title: 'Stay' },
        options,
      )
      // Act
      const deletion = call(deleteCategory, { id: work.id }, options)
      // Assert
      await expect(deletion).rejects.toMatchObject({ code: 'CONFLICT' })
      const { categories } = await call(listCategories, undefined, options)
      expect(
        categories.find((category) => category.id === corelive.id)?.parentId,
      ).toBe(work.id)
      expect(
        categories.find((category) => category.id === work.id),
      ).toMatchObject({ name: 'Work', parentId: null })
      expect(
        categories.find((category) => category.id === sameNamedChild.id),
      ).toMatchObject({ name: 'Work', parentId: work.id })
      const [record] = await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.id, entry.id))
      expect(record?.categoryId).toBe(work.id)
    })

    test('rejects foreign or self destinations without moving entries', async () => {
      // Arrange
      const { options, work } = await arrangeHierarchy()
      const other = await arrangeAccount()
      const entry = await call(
        createCompleted,
        { categoryId: work.id, title: 'Stay' },
        options,
      )
      // Act / Assert
      await expect(
        call(
          deleteCategory,
          { id: work.id, targetCategoryId: other.general.id },
          options,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
        call(
          deleteCategory,
          { id: work.id, targetCategoryId: work.id },
          options,
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      const [record] = await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.id, entry.id))
      expect(record?.categoryId).toBe(work.id)
    })

    test('filters parent history across pages with one count and current parent metadata, then follows a moved child', async () => {
      // Arrange
      const { options, userId, work, corelive, client, general } =
        await arrangeHierarchy()
      const date = new Date('2026-09-20T12:00:00.000Z')
      await db.insert(completedTable).values(
        [
          { title: 'Direct', categoryId: work.id },
          { title: 'Core 1', categoryId: corelive.id },
          { title: 'Core 2', categoryId: corelive.id },
          { title: 'Core 3', categoryId: corelive.id },
          { title: 'Client 1', categoryId: client.id },
          { title: 'Client 2', categoryId: client.id },
          { title: 'General', categoryId: general.id },
        ].map((entry) => ({ ...entry, userId, completedAt: date })),
      )
      // Act
      const first = await call(
        getJournal,
        { categoryId: work.id, limit: 2 },
        options,
      )
      const rest = await call(
        getJournal,
        { categoryId: work.id, limit: 100, offset: 2 },
        options,
      )
      const direct = await call(
        getJournal,
        { categoryId: work.id, includeSubcategories: false },
        options,
      )
      const exhausted = await call(
        getJournal,
        { categoryId: work.id, offset: 10 },
        options,
      )
      // Assert
      expect(first.total).toBe(6)
      expect(first.entries).toHaveLength(2)
      expect(rest.entries).toHaveLength(4)
      expect(first.hasMore).toBe(true)
      expect(rest.hasMore).toBe(false)
      expect(direct.entries.map((entry) => entry.title)).toEqual(['Direct'])
      expect(direct.total).toBe(1)
      expect(exhausted).toMatchObject({ total: 6, entries: [], hasMore: false })
      const childEntry = rest.entries.find(
        (entry) => entry.category?.id === corelive.id,
      )
      expect(childEntry?.category?.parent).toEqual({
        id: work.id,
        name: 'Work',
        color: 'rose',
      })
      const personal = await call(createCategory, { name: 'Personal' }, options)
      await call(
        updateCategory,
        { id: corelive.id, data: { parentId: personal.id } },
        options,
      )
      const after = await call(getJournal, { categoryId: work.id }, options)
      const moved = await call(getJournal, { categoryId: personal.id }, options)
      expect(after.total).toBe(3)
      expect(moved.total).toBe(3)
      expect(moved.entries[0]?.category?.parent?.name).toBe('Personal')
      expect(
        moved.entries.every(
          (entry) => entry.completedAt.getTime() === date.getTime(),
        ),
      ).toBe(true)
    })

    test('serializes overlapping category edits so a root can never gain a third-level child', async () => {
      // Arrange
      const { options } = await arrangeAccount()
      const a = await call(createCategory, { name: 'A' }, options)
      const b = await call(createCategory, { name: 'B' }, options)
      // Act
      const outcomes = await Promise.allSettled([
        call(createCategory, { name: 'Child', parentId: a.id }, options),
        call(updateCategory, { id: a.id, data: { parentId: b.id } }, options),
      ])
      // Assert — whichever obtains the owner lock first makes the other operation invalid.
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(
        outcomes.filter((outcome) => outcome.status === 'rejected'),
      ).toHaveLength(1)
      const { rows } = await db.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM "Category" c JOIN "Category" p ON p.id = c."parentId" WHERE c."userId" = ${a.userId} AND p."parentId" IS NOT NULL`,
      )
      expect(rows[0]?.count).toBe(0)
    })

    test('retains a Keep when it completes before category deletion, and refuses Keeps after deletion', async () => {
      // Arrange
      const { options, work, general } = await arrangeHierarchy()
      // Act
      const kept = await call(
        createCompleted,
        { categoryId: work.id, title: 'Before deletion' },
        options,
      )
      await call(deleteCategory, { id: work.id }, options)
      const late = call(
        createCompleted,
        { categoryId: work.id, title: 'After deletion' },
        options,
      )
      // Assert
      const [record] = await db
        .select()
        .from(completedTable)
        .where(eq(completedTable.id, kept.id))
      expect(record?.categoryId).toBe(general.id)
      await expect(late).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
    test.each(['keep-first', 'delete-first'] as const)(
      'orders overlapping Keep and deletion without losing a record (%s)',
      async (order) => {
        // Arrange — a real row lock queues both API transactions in a known order.
        const { options, work, general, userId } = await arrangeHierarchy()
        const holder = await db.$client.connect()
        const requests: Promise<unknown>[] = []
        try {
          const { rows } = await holder.query<{ pid: number }>(
            'SELECT pg_backend_pid() AS pid',
          )
          const holderPid = rows[0]?.pid
          if (holderPid === undefined)
            throw new Error('Lock holder backend PID was not returned')
          await holder.query('BEGIN')
          await holder.query(
            'SELECT id FROM "User" WHERE id = $1 FOR NO KEY UPDATE',
            [userId],
          )
          const keep = async () =>
            call(
              createCompleted,
              { categoryId: work.id, title: 'Concurrent Keep' },
              options,
            )
          const remove = async () =>
            call(deleteCategory, { id: work.id }, options)
          requests.push(order === 'keep-first' ? keep() : remove())
          let firstWaitingPid = 0
          await vi.waitFor(async () => {
            const result = await db.$client.query<{ pid: number }>(
              'SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid)) AND query LIKE $2',
              [holderPid, '%FROM "User" WHERE id =%'],
            )
            expect(result.rows).toHaveLength(1)
            firstWaitingPid = result.rows[0]!.pid
          })
          requests.push(order === 'keep-first' ? remove() : keep())
          // Attach rejection handlers before unblocking so a losing Keep never appears unhandled.
          const outcomes = Promise.allSettled(requests)
          await vi.waitFor(async () => {
            const result = await db.$client.query<{ count: number }>(
              'SELECT count(*)::int AS count FROM pg_stat_activity WHERE query LIKE $3 AND ($1 = ANY(pg_blocking_pids(pid)) OR $2 = ANY(pg_blocking_pids(pid)))',
              [holderPid, firstWaitingPid, '%FROM "User" WHERE id =%'],
            )
            expect(result.rows[0]?.count).toBe(2)
          })
          // Act
          await holder.query('COMMIT')
          const settled = await outcomes
          // Assert
          expect(settled[0]?.status).toBe('fulfilled')
          const entries = await db
            .select()
            .from(completedTable)
            .where(eq(completedTable.userId, userId))
          if (order === 'keep-first') {
            expect(settled[1]?.status).toBe('fulfilled')
            expect(
              entries.map((entry) => [entry.title, entry.categoryId]),
            ).toEqual([['Concurrent Keep', general.id]])
          } else {
            expect(settled[1]).toMatchObject({
              status: 'rejected',
              reason: { code: 'NOT_FOUND' },
            })
            expect(entries).toEqual([])
          }
        } finally {
          await holder.query('ROLLBACK')
          holder.release()
          await Promise.allSettled(requests)
        }
      },
    )
  },
)
