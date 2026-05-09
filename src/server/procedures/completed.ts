import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import {
  CompletedSchema,
  CreateCompletedSchema,
  DeleteCompletedSchema,
  HeatmapInputSchema,
  HeatmapResponseSchema,
} from '../schemas/completed'

/**
 * Fetches heatmap data for completed tasks, aggregated by date with category breakdown.
 * @param input.days - Number of days to look back (default: 365)
 * @returns
 * - data: Array of daily entries with count and category breakdown
 * - streaks: Current and longest consecutive-day streaks
 * - total: Total completed tasks in the period
 * @example
 * getHeatmap({ days: 365 })
 * // => { data: [{ date: "2026-03-24", count: 5, categories: [...] }], streaks: { current: 3, longest: 12 }, total: 89 }
 */
export const getHeatmap = authMiddleware
  .input(HeatmapInputSchema)
  .output(HeatmapResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { days } = input
      const { user } = context

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      startDate.setHours(0, 0, 0, 0)

      // Fetch all completed todos in the date range with their categories
      const completedTodos = await prisma.todo.findMany({
        where: {
          userId: user.id,
          completed: true,
          updatedAt: { gte: startDate },
        },
        select: {
          updatedAt: true,
          categoryId: true,
          category: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
        orderBy: { updatedAt: 'asc' },
      })

      // Aggregate by date and category
      const dayMap = new Map<
        string,
        {
          count: number
          categories: Map<
            number,
            { id: number; name: string; color: string; count: number }
          >
        }
      >()

      for (const todo of completedTodos) {
        const dateKey = todo.updatedAt.toISOString().split('T')[0]!
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, { count: 0, categories: new Map() })
        }
        const day = dayMap.get(dateKey)!
        day.count++

        if (todo.category) {
          const catId = todo.category.id
          if (!day.categories.has(catId)) {
            day.categories.set(catId, {
              id: catId,
              name: todo.category.name,
              color: todo.category.color,
              count: 0,
            })
          }
          day.categories.get(catId)!.count++
        }
      }

      // Convert to array
      const data = Array.from(dayMap.entries()).map(([date, entry]) => ({
        date,
        count: entry.count,
        categories: Array.from(entry.categories.values()),
      }))

      // Calculate streaks
      const streaks = calculateStreaks(data.map((d) => d.date))

      return {
        data,
        streaks,
        total: completedTodos.length,
      }
    } catch (error) {
      log.error('Error in getHeatmap:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch heatmap data',
        cause: error,
      })
    }
  })

/**
 * Calculates current and longest consecutive-day streaks from a sorted list of date strings.
 * @param dates - Array of date strings in "YYYY-MM-DD" format (must be sorted ascending)
 * @returns
 * - current: Number of consecutive days ending today (or yesterday)
 * - longest: Maximum consecutive-day streak in the dataset
 * @example
 * calculateStreaks(["2026-03-22", "2026-03-23", "2026-03-24"])
 * // => { current: 3, longest: 3 }
 */
function calculateStreaks(dates: string[]): {
  current: number
  longest: number
} {
  if (dates.length === 0) return { current: 0, longest: 0 }

  const uniqueDates = [...new Set(dates)].sort()
  const today = new Date().toISOString().split('T')[0]!
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!

  let longest = 1
  let currentStreak = 1
  let tempStreak = 1

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]!)
    const curr = new Date(uniqueDates[i]!)
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000

    if (diffDays === 1) {
      tempStreak++
      longest = Math.max(longest, tempStreak)
    } else {
      tempStreak = 1
    }
  }

  // Calculate current streak (must include today or yesterday)
  const lastDate = uniqueDates[uniqueDates.length - 1]!
  if (lastDate !== today && lastDate !== yesterday) {
    currentStreak = 0
  } else {
    currentStreak = 1
    for (let i = uniqueDates.length - 2; i >= 0; i--) {
      const curr = new Date(uniqueDates[i + 1]!)
      const prev = new Date(uniqueDates[i]!)
      const diffDays = (curr.getTime() - prev.getTime()) / 86400000

      if (diffDays === 1) {
        currentStreak++
      } else {
        break
      }
    }
  }

  return { current: currentStreak, longest: Math.max(longest, currentStreak) }
}

/**
 * Inserts a row directly into the Completed table for the authenticated user.
 * Used by BrainDump's checkbox-tick flow which bypasses the Todo lifecycle —
 * the user has already decided the item is done at the moment of capture.
 *
 * @param input.categoryId - Target category (must belong to the caller)
 * @param input.title - Free-text title (1-255 chars; longer text is rejected
 *   by Zod, callers should truncate before calling)
 * @returns The newly created Completed row
 * @example
 * createCompleted({ categoryId: 1, title: "buy milk" })
 * // => { id: 42, categoryId: 1, title: "buy milk", archived: false, ... }
 */
export const createCompleted = authMiddleware
  .input(CreateCompletedSchema)
  .output(CompletedSchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context
      const { categoryId, title } = input

      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId: user.id },
      })
      if (!category) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Category not found',
        })
      }

      const completed = await prisma.completed.create({
        data: {
          title,
          categoryId,
          userId: user.id,
        },
      })

      return completed
    } catch (error) {
      if (error instanceof ORPCError) throw error
      log.error('Error in createCompleted:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create completed row',
        cause: error,
      })
    }
  })

/**
 * Window during which a Completed row may be hard-deleted via this endpoint.
 * Picked to cover the 5 s toast plus generous slack for slow networks; older
 * rows must go through archival flows so the destructive endpoint cannot be
 * weaponised against historical data.
 */
const COMPLETED_UNDO_WINDOW_MS = 60 * 1000

/**
 * Hard-deletes a Completed row owned by the authenticated user, but only
 * within {@link COMPLETED_UNDO_WINDOW_MS} of creation. Used by BrainDump's
 * 5-second toast-undo flow when the user retracts a checkbox tick — the
 * row is ephemeral and reversed before any archival semantics matter.
 *
 * The time window scopes the destructive surface area: even if a Bearer
 * token leaks, an attacker cannot use this endpoint to wipe historical
 * Completed history.
 *
 * @param input.id - Completed row id
 * @returns The deleted row id (echoed back so optimistic clients can confirm)
 * @example
 * deleteCompleted({ id: 42 }) // => { id: 42 }
 */
export const deleteCompleted = authMiddleware
  .input(DeleteCompletedSchema)
  .output(z.object({ id: z.number().int() }))
  .handler(async ({ input, context }) => {
    const { user } = context
    const { id } = input

    const existing = await prisma.completed.findFirst({
      where: { id, userId: user.id },
    })
    if (!existing) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Completed row not found',
      })
    }

    const ageMs = Date.now() - existing.createdAt.getTime()
    if (ageMs > COMPLETED_UNDO_WINDOW_MS) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Undo window has expired for this completion',
      })
    }

    await prisma.completed.delete({ where: { id } })

    return { id }
  })
