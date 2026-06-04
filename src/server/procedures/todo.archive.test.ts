// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { fetchCompletedEntries } from '../utils/completedAggregation'

import { clearCompleted, createManyTodo, deleteTodo, toggleTodo } from './todo'

// Each case makes several sequential round-trips to the real Postgres (user
// upsert + category get-or-create + writes), which can exceed the 5s default —
// give the whole suite a generous ceiling so it never flakes on DB latency.
vi.setConfig({ testTimeout: 30_000 })

// Real-DB integration suite: runs only when RUN_DB_INTEGRATION_TESTS=1 (the CI
// `test` job sets it after Postgres is up; set it locally with `docker compose
// up`). Skips cleanly in DB-less contexts so it never blocks unrelated runs.
const describeIfDb =
  process.env.RUN_DB_INTEGRATION_TESTS === '1' ? describe : describe.skip

// A date window wide enough to always contain "now" plus the fixed past day the
// edit-drift test uses, so fetchCompletedEntries never excludes a row on range.
const RANGE_START = new Date('2000-01-01T00:00:00.000Z')
const RANGE_END = new Date('2100-01-01T00:00:00.000Z')
const PAST_COMPLETION_DAY = new Date('2026-05-01T10:00:00.000Z')

function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

const createdClerkIds = new Set<string>()

function freshClerkId(): string {
  const clerkId = `test_todo_archive_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

/**
 * Seeds one INCOMPLETE todo (via the real paste-import procedure, which
 * get-or-creates the default category) and returns its row. Completing it is
 * left to toggleTodo so completedAt is stamped through the real write path.
 */
async function seedTodo(clerkId: string, title: string) {
  await call(
    createManyTodo,
    { items: [{ title }], importBatchId: randomUUID() },
    authContext(clerkId),
  )
  const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
  const todo = await prisma.todo.findFirstOrThrow({
    where: { userId: user.id, text: title },
  })
  return { user, todo }
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) continue
    // FK-safe teardown: skill tree cascades node + assignment; todo SetNulls any
    // surviving assignment; then the leaf tables, then the user.
    await prisma.skillTree.deleteMany({ where: { userId: user.id } })
    await prisma.completed.deleteMany({ where: { userId: user.id } })
    await prisma.todo.deleteMany({ where: { userId: user.id } })
    await prisma.importBatch.deleteMany({ where: { userId: user.id } })
    await prisma.category.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
  }
  createdClerkIds.clear()
})

describeIfDb('todo archive-on-removal (Part 0)', () => {
  it('toggleTodo stamps completedAt when a todo is completed', async () => {
    // Arrange — a fresh incomplete todo (completedAt is null).
    const clerkId = freshClerkId()
    const { todo } = await seedTodo(clerkId, 'morning pages')
    expect(todo.completedAt).toBeNull()

    // Act — complete it through the real toggle path.
    await call(toggleTodo, { id: todo.id }, authContext(clerkId))

    // Assert — completedAt is now populated (the stable heatmap day).
    const completed = await prisma.todo.findUniqueOrThrow({
      where: { id: todo.id },
    })
    expect(completed.completed).toBe(true)
    expect(completed.completedAt).not.toBeNull()
  })

  it('clearCompleted archives completed todos (archived:false) instead of deleting them, so the heatmap day survives', async () => {
    // Arrange — one completed todo; capture its pre-clear heatmap presence.
    const clerkId = freshClerkId()
    const { user, todo } = await seedTodo(clerkId, 'evening walk')
    await call(toggleTodo, { id: todo.id }, authContext(clerkId))
    const entriesBeforeClear = await fetchCompletedEntries(
      user.id,
      RANGE_START,
      RANGE_END,
    )
    expect(entriesBeforeClear).toHaveLength(1)
    expect(entriesBeforeClear[0]?.source).toBe('todo')

    // Act — clear all completed.
    const result = await call(clearCompleted, {}, authContext(clerkId))

    // Assert — the Todo row is gone, but an archived Completed row preserves it.
    expect(result).toEqual({ deletedCount: 1 })
    const remainingTodos = await prisma.todo.count({
      where: { userId: user.id },
    })
    expect(remainingTodos).toBe(0)
    const archivedRows = await prisma.completed.findMany({
      where: { userId: user.id },
    })
    expect(archivedRows).toHaveLength(1)
    expect(archivedRows[0]?.archived).toBe(false) // LOAD-BEARING invariant
    expect(archivedRows[0]?.title).toBe('evening walk')
    expect(archivedRows[0]?.importBatchId).toBeNull()

    // Assert — the heatmap still counts the day, now from the Completed source.
    const entriesAfterClear = await fetchCompletedEntries(
      user.id,
      RANGE_START,
      RANGE_END,
    )
    expect(entriesAfterClear).toHaveLength(1)
    expect(entriesAfterClear[0]?.source).toBe('completed')
  })

  it('clearCompleted copies the stable completedAt, NOT the edit-drifting updatedAt', async () => {
    // Arrange — a todo completed long ago, then edited today: completedAt holds
    // the real completion day while updatedAt has drifted to now.
    const clerkId = freshClerkId()
    const { user, todo } = await seedTodo(clerkId, 'gym last week')
    await call(toggleTodo, { id: todo.id }, authContext(clerkId))
    // Force the completed-long-ago / edited-today split (the @updatedAt column
    // auto-bumps to now on this write, so it differs from completedAt).
    await prisma.todo.update({
      where: { id: todo.id },
      data: {
        completedAt: PAST_COMPLETION_DAY,
        text: 'gym last week (edited)',
      },
    })

    // Act — clear it.
    await call(clearCompleted, {}, authContext(clerkId))

    // Assert — the archived row carries the past completion day, not the edit
    // day (proves the helper copies completedAt ?? updatedAt, not bare updatedAt).
    const archived = await prisma.completed.findFirstOrThrow({
      where: { userId: user.id },
    })
    expect(archived.completedAt).toEqual(PAST_COMPLETION_DAY)
  })

  it('deleting a COMPLETED todo archives it (heatmap survives); deleting a PENDING todo hard-deletes it', async () => {
    // Arrange — one completed todo and one pending todo.
    const clerkId = freshClerkId()
    const { user, todo: completedTodo } = await seedTodo(clerkId, 'read a book')
    await call(toggleTodo, { id: completedTodo.id }, authContext(clerkId))
    const { todo: pendingTodo } = await seedTodo(clerkId, 'buy groceries')

    // Act — delete the completed one, then the pending one.
    await call(deleteTodo, { id: completedTodo.id }, authContext(clerkId))
    await call(deleteTodo, { id: pendingTodo.id }, authContext(clerkId))

    // Assert — completed delete archived (Completed row, archived:false); pending
    // delete left no trace; the heatmap still shows the completed day.
    const archivedRows = await prisma.completed.findMany({
      where: { userId: user.id },
    })
    expect(archivedRows).toHaveLength(1)
    expect(archivedRows[0]?.archived).toBe(false)
    expect(archivedRows[0]?.title).toBe('read a book')
    const entries = await fetchCompletedEntries(user.id, RANGE_START, RANGE_END)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.source).toBe('completed')
  })

  it('archive-on-clear preserves earned XP: NodeAssignment survives with todoId→null and the todoText snapshot intact', async () => {
    // Arrange — complete a todo and assign it to a skill node (earned XP).
    const clerkId = freshClerkId()
    const { user, todo } = await seedTodo(clerkId, 'practice piano')
    await call(toggleTodo, { id: todo.id }, authContext(clerkId))
    const tree = await prisma.skillTree.create({
      data: { userId: user.id, name: 'My Tree' },
    })
    const node = await prisma.skillNode.create({
      data: { skillTreeId: tree.id, name: 'Music', x: 0.5, y: 0.5 },
    })
    const assignment = await prisma.nodeAssignment.create({
      data: { nodeId: node.id, todoId: todo.id, todoText: 'practice piano' },
    })

    // Act — clear completed (archives + deletes the Todo).
    await call(clearCompleted, {}, authContext(clerkId))

    // Assert — the assignment row survives, orphaned (todoId null) but with its
    // XP-bearing snapshot intact. Do NOT mirror toggleTodo's deleteMany here.
    const survived = await prisma.nodeAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    })
    expect(survived.todoId).toBeNull()
    expect(survived.todoText).toBe('practice piano')
  })
})
