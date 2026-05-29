import { ORPCError } from '@orpc/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { normalizeCompletedTitle } from '@/components/braindump/braindumpUtils'
import { COMPLETED_UNDO_WINDOW_MS } from '@/lib/constants/import'
import { prisma } from '@/lib/prisma'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import {
  CompletedSchema,
  CreateCompletedSchema,
  CreateManyCompletedResponseSchema,
  CreateManyCompletedSchema,
  DayDetailInputSchema,
  DayDetailResponseSchema,
  DeleteCompletedSchema,
  DeleteManyCompletedResponseSchema,
  DeleteManyCompletedSchema,
  HeatmapInputSchema,
  HeatmapResponseSchema,
} from '../schemas/completed'
import { fetchCompletedEntries } from '../utils/completedAggregation'
import { resolveImportCategoryIds } from '../utils/resolveImportCategoryIds'

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

/**
 * Bulk-inserts paste-imported rows into the Completed zone for the
 * authenticated user, lighting the heatmap. Triggered by the PR2 paste-import
 * dialog's confirm on the Completed zone. Idempotent via `importBatchId`: a
 * resubmit of the same batch (network retry, double-click, second tab) is a
 * no-op that returns the already-inserted count instead of duplicating rows.
 *
 * No dedup — repeated titles are intentional habit/XP signals. The only
 * uniqueness is on the batch id (the `ImportBatch` PK), never on task content.
 *
 * Flow:
 * 1. Server-side normalize + drop empty titles (Zod `.min(1)` does not catch a
 *    whitespace-only title that normalizes to `""`), so preview == inserted.
 * 2. Resolve every item's categoryId BEFORE the transaction (ownership-verify
 *    provided ids; get-or-create the default for omitted ones) so the only
 *    in-transaction P2002 source is the ImportBatch insert.
 * 3. In one `$transaction`: insert the ImportBatch guard row, then createMany.
 *    A duplicate batch id throws P2002 (caught outside) → idempotent re-query.
 *
 * @param input.items - 1..1000 items `{ title, categoryId?, completedAt? }`
 * @param input.importBatchId - Client-generated globally-unique batch id
 * @returns
 * - `{ count, idempotent: false }` on a fresh insert (count = rows inserted)
 * - `{ count, idempotent: true }` when the batch id already existed (no-op)
 * @throws ORPCError('BAD_REQUEST') when every line normalizes to empty
 * @throws ORPCError('NOT_FOUND') when a provided categoryId is not owned
 * @example
 * createManyCompleted({ items: [{ title: 'gym' }, { title: 'gym' }], importBatchId: 'b2c1…' })
 * // => { count: 2, idempotent: false } (two real rows — repetition preserved)
 */
export const createManyCompleted = authMiddleware
  .input(CreateManyCompletedSchema)
  .output(CreateManyCompletedResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context
      const { items, importBatchId } = input

      // Step 1: normalize titles and drop lines that become empty. This mirrors
      // the client preview's parser so the inserted count == the previewed
      // count, and prevents a whitespace-only title from reaching the DB.
      const normalizedItems = items
        .map((item) => ({
          title: normalizeCompletedTitle(item.title),
          categoryId: item.categoryId,
          completedAt: item.completedAt,
        }))
        .filter((item) => item.title.length > 0)

      if (normalizedItems.length === 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'No importable lines after normalization',
        })
      }

      // Step 2: resolve categories outside the transaction so the only
      // in-transaction P2002 source is the ImportBatch guard insert.
      const resolveCategoryId = await resolveImportCategoryIds(
        user.id,
        normalizedItems,
      )

      // Slice 1 lands everything on today; `completedAt` defaults to now() when
      // the item omits it. createdAt (real insert time) stays separate so the
      // undo window works even for a past completedAt.
      const importedAt = new Date()
      const rows = normalizedItems.map((item) => ({
        title: item.title,
        categoryId: resolveCategoryId(item),
        userId: user.id,
        completedAt: item.completedAt ?? importedAt,
        importBatchId,
      }))

      // Step 3: ImportBatch guard insert + createMany in one transaction. A
      // failed createMany rolls back the guard so a genuine retry still inserts.
      const result = await prisma.$transaction(async (tx) => {
        await tx.importBatch.create({
          data: { id: importBatchId, userId: user.id },
        })
        const created = await tx.completed.createMany({ data: rows })
        return { count: created.count, idempotent: false }
      })

      return result
    } catch (error) {
      // P2002 on the ImportBatch insert = this batch id was already imported.
      // Idempotent no-op: re-query the prior count and return it. Caught here,
      // OUTSIDE the transaction, because a failed statement aborts the PG tx
      // (cannot catch-and-continue on `tx`).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const count = await prisma.completed.count({
          where: {
            userId: context.user.id,
            importBatchId: input.importBatchId,
          },
        })
        return { count, idempotent: true }
      }
      if (error instanceof ORPCError) throw error
      log.error('Error in createManyCompleted:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to import completed rows',
        cause: error,
      })
    }
  })

/**
 * Bulk-undoes a paste-import batch by deleting every Completed row tagged with
 * the given `importBatchId`, scoped to the caller and guarded by
 * {@link COMPLETED_UNDO_WINDOW_MS}. Triggered by PR2's "Undo import" toast /
 * inline control within 60 s of the import.
 *
 * Atomic single-statement delete: ownership + freshness are part of the `where`
 * so a second tab or an undo racing the window expiry cannot double-delete.
 * Deletes by `importBatchId` (never by ids — `createMany` returns only a
 * count); the window keys off `createdAt` (the real insert time), so it works
 * even when the batch's `completedAt` is a past date.
 *
 * @param input.importBatchId - The batch id returned/used at import time
 * @returns `{ count }` — rows removed (0 once the undo window has expired)
 * @example
 * deleteManyCompleted({ importBatchId: 'b2c1…' }) // => { count: 50 }
 */
export const deleteManyCompleted = authMiddleware
  .input(DeleteManyCompletedSchema)
  .output(DeleteManyCompletedResponseSchema)
  .handler(async ({ input, context }) => {
    const { user } = context
    const { importBatchId } = input

    const result = await prisma.completed.deleteMany({
      where: {
        userId: user.id,
        importBatchId,
        createdAt: {
          gte: new Date(Date.now() - COMPLETED_UNDO_WINDOW_MS),
        },
      },
    })

    return { count: result.count }
  })
