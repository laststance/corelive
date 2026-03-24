import { ORPCError } from '@orpc/server'

import { prisma } from '@/lib/prisma'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import { HeatmapInputSchema, HeatmapResponseSchema } from '../schemas/completed'

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
