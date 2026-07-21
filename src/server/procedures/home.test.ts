// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { afterEach, expect, it } from 'vitest'

import { COMPLETED_JOURNAL_PAGE_SIZE } from '@/lib/constants/completed'
import { HOME_HEATMAP_DAYS, HOME_TODO_QUERY_LIMIT } from '@/lib/constants/home'
import { prisma } from '@/lib/prisma'

import { describeIfDb } from './describeIfDb'
import { bootstrapHome } from './home'

const createdClerkIds = new Set<string>()

/** Creates an isolated Clerk identity whenever the real bootstrap integration test seeds Home rows. @returns A unique Clerk ID tracked for FK-safe teardown. @example `const clerkId = freshClerkId()` */
function freshClerkId(): string {
  const clerkId = `test_home_bootstrap_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

afterEach(async () => {
  // Remove every dependent row before its test user because these relations do not all cascade.
  for (const clerkId of createdClerkIds) {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) continue
    await prisma.completed.deleteMany({ where: { userId: user.id } })
    await prisma.todo.deleteMany({ where: { userId: user.id } })
    await prisma.category.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
  }
  createdClerkIds.clear()
})

describeIfDb('home.bootstrap', () => {
  it('returns every critical Home region through one authenticated procedure call', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const user = await prisma.user.create({ data: { clerkId } })
    const category = await prisma.category.create({
      data: {
        color: 'blue',
        isDefault: true,
        name: 'General',
        userId: user.id,
      },
    })
    await prisma.todo.create({
      data: {
        categoryId: category.id,
        completed: false,
        text: "Review Sarah's PR before standup",
        userId: user.id,
      },
    })
    await prisma.completed.create({
      data: {
        categoryId: category.id,
        completedAt: new Date(),
        title: 'Shipped the bootstrap',
        userId: user.id,
      },
    })

    // Act
    const result = await call(
      bootstrapHome,
      {
        heatmap: { days: HOME_HEATMAP_DAYS, timezone: 'UTC' },
        journal: { limit: COMPLETED_JOURNAL_PAGE_SIZE, offset: 0 },
        todo: {
          completed: false,
          limit: HOME_TODO_QUERY_LIMIT,
          offset: 0,
        },
      },
      {
        context: {
          headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
        },
      },
    )

    // Assert
    expect(result.category.categories.map((entry) => entry.name)).toEqual([
      'General',
    ])
    expect(result.todo.todos.map((entry) => entry.text)).toEqual([
      "Review Sarah's PR before standup",
    ])
    expect(result.heatmap.total).toBe(1)
    expect(result.journal.entries.map((entry) => entry.title)).toEqual([
      'Shipped the bootstrap',
    ])
  })

  it('shows only default-category todos when a first Home visit has no stored selection', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const user = await prisma.user.create({ data: { clerkId } })
    const defaultCategory = await prisma.category.create({
      data: {
        color: 'blue',
        isDefault: true,
        name: 'Default Work',
        userId: user.id,
      },
    })
    const otherCategory = await prisma.category.create({
      data: {
        color: 'green',
        isDefault: false,
        name: 'Other Work',
        userId: user.id,
      },
    })
    await prisma.todo.createMany({
      data: [
        {
          categoryId: defaultCategory.id,
          completed: false,
          text: 'Visible on the first Home visit',
          userId: user.id,
        },
        {
          categoryId: otherCategory.id,
          completed: false,
          text: 'Hidden until the other category is selected',
          userId: user.id,
        },
      ],
    })

    // Act
    const result = await call(
      bootstrapHome,
      {
        heatmap: { days: HOME_HEATMAP_DAYS, timezone: 'UTC' },
        journal: { limit: COMPLETED_JOURNAL_PAGE_SIZE, offset: 0 },
        todo: {
          completed: false,
          limit: HOME_TODO_QUERY_LIMIT,
          offset: 0,
        },
      },
      {
        context: {
          headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
        },
      },
    )

    // Assert
    expect(result.todo.todos.map((entry) => entry.text)).toEqual([
      'Visible on the first Home visit',
    ])
  })
})
