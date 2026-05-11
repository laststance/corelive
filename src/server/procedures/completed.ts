import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import {
  CompletedSchema,
  CreateCompletedSchema,
  DayDetailInputSchema,
  DayDetailResponseSchema,
  DeleteCompletedSchema,
  HeatmapInputSchema,
  HeatmapResponseSchema,
} from '../schemas/completed'
import { fetchCompletedEntries } from '../utils/completedAggregation'

/**
 * Fetches heatmap data for completed tasks, aggregated by UTC date with a
 * category breakdown. Reads the Todo+Completed UNION via
 * {@link fetchCompletedEntries} so BrainDump checkbox-tick completions
 * (which write directly to the `Completed` table) appear on the heatmap
 * alongside Todos completed through the TodoList lifecycle.
 *
 * @param input.days - Number of days to look back (default: 365, max 365)
 * @returns
 * - data: Array of daily entries with count and category breakdown
 * - streaks: Current and longest consecutive-day streaks
 * - total: Total completed tasks in the period (Todo + Completed union)
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

      // UTC-anchored bounds — `fetchCompletedEntries` buckets via
      // `entry.completedAt.toISOString().split('T')[0]` (UTC date string).
      // If we anchored `startDate` to *local* midnight (the previous
      // implementation), rows in the first/last UTC hours that straddle
      // the local-vs-UTC boundary would mis-bucket on any non-UTC host
      // (e.g., a regional deployment). Vercel happens to run UTC by
      // default, which masked the bug — but the contract should be
      // explicit. `getDayDetail` already uses this discipline.
      const todayIso = new Date().toISOString().split('T')[0]!
      const startDate = new Date(`${todayIso}T00:00:00.000Z`)
      // Inclusive bounds: `fetchCompletedEntries` uses `gte`/`lte`, so the
      // window covers `(days - 1)` past calendar dates + today = exactly
      // `days` dates. Subtracting the full `days` would include one extra
      // day at the lower edge (CodeRabbit review on PR #38).
      startDate.setUTCDate(startDate.getUTCDate() - (days - 1))
      // Upper bound = "now" so future-dated rows (clock skew, test seeds)
      // never accidentally surface on the heatmap. fetchCompletedEntries
      // requires an explicit endDate.
      const endDate = new Date()

      const entries = await fetchCompletedEntries(user.id, startDate, endDate)

      // Bucket entries by UTC date string. Per-day category rollup mirrors
      // the previous shape so the API contract (HeatmapResponseSchema) is
      // unchanged — the only difference vs. pre-UNION is that `Completed`
      // rows now contribute counts too.
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

      for (const entry of entries) {
        const dateKey = entry.completedAt.toISOString().split('T')[0]!
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, { count: 0, categories: new Map() })
        }
        const day = dayMap.get(dateKey)!
        day.count++

        if (entry.category) {
          const categoryId = entry.category.id
          if (!day.categories.has(categoryId)) {
            day.categories.set(categoryId, {
              id: categoryId,
              name: entry.category.name,
              color: entry.category.color,
              count: 0,
            })
          }
          day.categories.get(categoryId)!.count++
        }
      }

      const data = Array.from(dayMap.entries()).map(([date, entry]) => ({
        date,
        count: entry.count,
        categories: Array.from(entry.categories.values()),
      }))

      const streaks = calculateStreaks(data.map((d) => d.date))

      return {
        data,
        streaks,
        total: entries.length,
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
 * Fetches a single day's completed tasks for the DayDetailDialog opened from
 * a heatmap cell click. Date range covers the calendar day in UTC; this
 * matches the heatmap's existing aggregation, so cell counts and dialog
 * counts stay in lockstep.
 *
 * Reads the Todo+Completed UNION via {@link fetchCompletedEntries} so both
 * lifecycle paths (TodoList complete() and BrainDump checkbox-tick) surface
 * inside the dialog's task list.
 *
 * @param input.date - YYYY-MM-DD date string the user clicked on the heatmap
 * @returns
 * - date, count, tasks (id/title/completedAt/category), categories (rollup)
 * @example
 * getDayDetail({ date: "2026-05-10" })
 * // => { date: "2026-05-10", count: 3, tasks: [...], categories: [...] }
 */
export const getDayDetail = authMiddleware
  .input(DayDetailInputSchema)
  .output(DayDetailResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { date } = input
      const { user } = context

      // Use UTC day bounds so a dialog opened from a heatmap cell matches the
      // cell's bucket exactly (`completedAt.toISOString().split('T')[0]`).
      const dayStart = new Date(`${date}T00:00:00.000Z`)
      const dayEnd = new Date(`${date}T23:59:59.999Z`)

      const entries = await fetchCompletedEntries(user.id, dayStart, dayEnd)

      const tasks = entries.map((entry) => ({
        source: entry.source,
        id: entry.id,
        title: entry.title,
        completedAt: entry.completedAt,
        category: entry.category,
      }))

      const categoryRollup = new Map<
        number,
        { id: number; name: string; color: string; count: number }
      >()
      for (const entry of entries) {
        if (!entry.category) continue
        const existing = categoryRollup.get(entry.category.id)
        if (existing) {
          existing.count++
        } else {
          categoryRollup.set(entry.category.id, {
            id: entry.category.id,
            name: entry.category.name,
            color: entry.category.color,
            count: 1,
          })
        }
      }

      return {
        date,
        count: tasks.length,
        tasks,
        categories: Array.from(categoryRollup.values()),
      }
    } catch (error) {
      log.error('Error in getDayDetail:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch day detail',
        cause: error,
      })
    }
  })

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

    // Atomic conditional delete: ownership + freshness checks happen inside a
    // single statement so two concurrent undo calls (or an undo racing the
    // window expiry) cannot both observe the row as deletable. The
    // deleteMany count is the authoritative result; we only do an extra
    // existence read on failure to distinguish NOT_FOUND vs FORBIDDEN.
    const result = await prisma.completed.deleteMany({
      where: {
        id,
        userId: user.id,
        createdAt: {
          gte: new Date(Date.now() - COMPLETED_UNDO_WINDOW_MS),
        },
      },
    })

    if (result.count === 1) {
      return { id }
    }

    const stillExists = await prisma.completed.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (stillExists) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Undo window has expired for this completion',
      })
    }
    throw new ORPCError('NOT_FOUND', {
      message: 'Completed row not found',
    })
  })
