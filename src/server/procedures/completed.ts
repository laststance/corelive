import { ORPCError } from '@orpc/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { shiftIsoDate } from '@/lib/shiftIsoDate'
import { toLocalDayKey } from '@/lib/toLocalDayKey'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import { DEFAULT_CATEGORY_SEED } from '../schemas/category'
import {
  CompletedJournalInputSchema,
  CompletedJournalResponseSchema,
  CompletedSchema,
  CreateCompletedSchema,
  DayDetailInputSchema,
  DayDetailResponseSchema,
  DeleteCompletedSchema,
  HeatmapInputSchema,
  HeatmapResponseSchema,
  ImportLocalResponseSchema,
  ImportLocalSchema,
} from '../schemas/completed'
import { calculateStreaks } from '../utils/calculateStreaks'
import { fetchCompletedEntries } from '../utils/completedAggregation'

/**
 * Window during which a Completed row may be hard-deleted via {@link deleteCompleted}.
 * Covers LiveEditor's undo toast plus slack for slow networks; older rows must go
 * through archival so the destructive endpoint cannot be aimed at real history.
 * Keyed off `createdAt` (the real insert time), never the semantic `completedAt`.
 */
const COMPLETED_UNDO_WINDOW_MS = 60 * 1000

/**
 * Fetches heatmap data for completed tasks, aggregated by the user's *local*
 * calendar day with a category breakdown. Reads the Todo+Completed UNION via
 * {@link fetchCompletedEntries} so LiveEditor checkbox-tick completions (which
 * write directly to the `Completed` table) appear on the heatmap alongside
 * the legacy `Todo` rows completed before the Todo UI was retired.
 *
 * Local-day bucketing (L3): the client reports its IANA `timezone`; each
 * completion is keyed by {@link toLocalDayKey} so a late-night completion
 * lands on the cell the user sees, not the next UTC day. Absent/garbage zone
 * → UTC (the legacy behavior). Not persisted — passed per request because no
 * server-only consumer needs a stored zone.
 *
 * @param input.days - Number of days to look back (default: 365, max 365)
 * @param input.timezone - Optional IANA zone; omitted → UTC bucketing
 * @returns
 * - data: Array of daily entries with count and category breakdown
 * - streaks: Current and longest consecutive-day streaks
 * - total: Total completed tasks within the displayed local-day window
 * @example
 * getHeatmap({ days: 365, timezone: 'Asia/Tokyo' })
 * // => { data: [{ date: "2026-03-24", count: 5, categories: [...] }], streaks: { current: 3, longest: 12 }, total: 89 }
 */
export const getHeatmap = authMiddleware
  .input(HeatmapInputSchema)
  .output(HeatmapResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { days, timezone } = input
      const { user } = context
      // `timezone` is optional on the schema; `toLocalDayKey(_, null)` is the
      // UTC fallback that reproduces the pre-L3 bucketing exactly.
      const zone = timezone ?? null

      // Bucket completions by the user's LOCAL calendar day (L3). The window
      // edges and "today" are local-day keys; `shiftIsoDate` is tz-neutral
      // calendar-string math, so it stays correct on local keys.
      const todayLocalKey = toLocalDayKey(new Date(), zone)
      // `days` local calendar days ending today = today + (days - 1) prior.
      const startLocalKey = shiftIsoDate(todayLocalKey, -(days - 1))

      // Over-fetch a UTC window wide enough to contain every instant that can
      // map into [startLocalKey, todayLocalKey]. A local day can begin up to
      // ~14h before its UTC midnight, so one UTC buffer day below the start
      // covers any IANA offset; the upper bound is "now" because no completion
      // is dated in the future. Buffer-day spill is dropped by the in-loop
      // filter below (`fetchCompletedEntries` uses inclusive gte/lte bounds).
      const startDate = new Date(
        `${shiftIsoDate(startLocalKey, -1)}T00:00:00.000Z`,
      )
      const endDate = new Date()

      const entries = await fetchCompletedEntries(user.id, startDate, endDate)

      // Per-day rollup keyed by local-day string. Mirrors the previous shape
      // so the API contract (HeatmapResponseSchema) is unchanged — `Completed`
      // rows contribute counts alongside lifecycle Todos.
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

      // Count only completions inside the requested local-day window; the
      // over-fetched buffer day is discarded here so `total` and the cells
      // reflect exactly what is rendered.
      let totalInWindow = 0
      for (const entry of entries) {
        const dateKey = toLocalDayKey(entry.completedAt, zone)
        if (dateKey < startLocalKey || dateKey > todayLocalKey) continue
        totalInWindow++
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

      // Streaks must use the SAME local today/yesterday the buckets use — a
      // user who completed something tonight (local) but not yet in UTC would
      // otherwise see a broken streak. `calculateStreaks` is pure on the keys.
      const streaks = calculateStreaks(
        data.map((d) => d.date),
        todayLocalKey,
        shiftIsoDate(todayLocalKey, -1),
      )

      return {
        data,
        streaks,
        total: totalInWindow,
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
 * Fetches a single day's completed tasks for the DayDetailDialog opened from
 * a heatmap cell click. The cell is a *local* calendar day (L3), so this
 * over-fetches a ±1 UTC-day window and filters entries by
 * {@link toLocalDayKey} === `date` — matching the heatmap's local bucketing
 * exactly, so cell counts and dialog counts stay in lockstep.
 *
 * Reads the Todo+Completed UNION via {@link fetchCompletedEntries} so
 * LiveEditor check-offs and the legacy `Todo` history both surface inside
 * the dialog's task list.
 *
 * @param input.date - YYYY-MM-DD local day the user clicked on the heatmap
 * @param input.timezone - Optional IANA zone; omitted → UTC day boundaries
 * @returns
 * - date, count, tasks (id/title/completedAt/category), categories (rollup)
 * @example
 * getDayDetail({ date: "2026-05-10", timezone: "Asia/Tokyo" })
 * // => { date: "2026-05-10", count: 3, tasks: [...], categories: [...] }
 */
export const getDayDetail = authMiddleware
  .input(DayDetailInputSchema)
  .output(DayDetailResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { date, timezone } = input
      const { user } = context
      const zone = timezone ?? null

      // The clicked cell is a LOCAL calendar day. A single local day can map
      // to UTC instants spanning ~3 UTC dates (±14h/±12h offsets), so widen
      // the fetch to ±1 UTC day and then filter precisely by local day —
      // this keeps the dialog in lockstep with the heatmap cell's bucketing.
      const dayStart = new Date(`${shiftIsoDate(date, -1)}T00:00:00.000Z`)
      const dayEnd = new Date(`${shiftIsoDate(date, 1)}T23:59:59.999Z`)

      const fetchedEntries = await fetchCompletedEntries(
        user.id,
        dayStart,
        dayEnd,
      )
      // Filter to the requested local day FIRST, then build both the task
      // list and the category rollup from this set so count, list, and
      // rollup are guaranteed to agree.
      const entries = fetchedEntries.filter(
        (entry) => toLocalDayKey(entry.completedAt, zone) === date,
      )

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
 * Returns the filtered, newest-first unified completion journal page when Home loads, scrolls, or changes its Warm Preset Bar.
 * SQL applies normalized Todo/Completed predicates before pagination and count so the rows and total cannot drift.
 *
 * @param input.limit - Page size (1-100, default 20)
 * @param input.offset - Rows to skip (default 0)
 * @param input.categoryId - Optional authenticated-user category ID.
 * @param input.completedFrom - Optional inclusive completion timestamp.
 * @param input.completedBefore - Optional exclusive completion timestamp.
 * @returns `{ entries, total, hasMore, nextOffset }` — entries newest-first,
 *   each tagged with its `source` ('todo' | 'completed')
 * @example
 * journal({ limit: 20, offset: 0, categoryId: 3, completedFrom: new Date('2026-07-01'), completedBefore: new Date('2026-08-01') })
 * // => { entries: [{ source: 'todo', id: 12, title: 'ship', completedAt: Date, category: {…} }], total: 462, hasMore: true, nextOffset: 20 }
 */
export const getJournal = authMiddleware
  .input(CompletedJournalInputSchema)
  .output(CompletedJournalResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { limit, offset, categoryId, completedFrom, completedBefore } =
        input
      const { user } = context

      // Raw UNION row shape. Int4 columns (id, category_id) arrive as numbers
      // and the timestamp as a Date; the COUNT is cast `::int` in SQL so it is a
      // number, not the driver adapter's native bigint.
      type JournalRow = {
        source: 'todo' | 'completed'
        id: number
        title: string
        completed_at: Date
        category_id: number | null
        category_name: string | null
        category_color: string | null
      }

      // Build the normalized feed once so list + count cannot drift on fallback
      // timestamps or filter semantics. Every interpolation is parameterized.
      const mergedJournalRows = Prisma.sql`
        SELECT
          'todo'::text AS source,
          t.id,
          t.text AS title,
          COALESCE(t."completedAt", t."updatedAt") AS completed_at,
          t."categoryId" AS category_id
        FROM "Todo" t
        WHERE t."userId" = ${user.id} AND t.completed = true
        UNION ALL
        SELECT
          'completed'::text AS source,
          cp.id,
          cp.title,
          COALESCE(cp."completedAt", cp."createdAt") AS completed_at,
          cp."categoryId" AS category_id
        FROM "Completed" cp
        WHERE cp."userId" = ${user.id} AND cp.archived = false
      `
      const categoryFilter =
        categoryId === undefined
          ? Prisma.empty
          : Prisma.sql`AND m.category_id = ${categoryId}`
      const completedFromFilter =
        completedFrom === undefined
          ? Prisma.empty
          : Prisma.sql`AND m.completed_at >= ${completedFrom}`
      const completedBeforeFilter =
        completedBefore === undefined
          ? Prisma.empty
          : Prisma.sql`AND m.completed_at < ${completedBefore}`

      // Two reads in parallel: the page and its total share every predicate.
      const [rows, countRows] = await Promise.all([
        prisma.$queryRaw<JournalRow[]>`
          SELECT
            m.source,
            m.id,
            m.title,
            m.completed_at,
            c.id AS category_id,
            c.name AS category_name,
            c.color AS category_color
          FROM (${mergedJournalRows}) m
          LEFT JOIN "Category" c ON c.id = m.category_id
          WHERE TRUE
            ${categoryFilter}
            ${completedFromFilter}
            ${completedBeforeFilter}
          ORDER BY m.completed_at DESC, m.source ASC, m.id ASC
          LIMIT ${limit} OFFSET ${offset}
        `,
        prisma.$queryRaw<{ total: number }[]>`
          SELECT COUNT(*)::int AS total
          FROM (${mergedJournalRows}) m
          WHERE TRUE
            ${categoryFilter}
            ${completedFromFilter}
            ${completedBeforeFilter}
        `,
      ])

      const total = countRows[0]?.total ?? 0

      // Coalesce the joined category columns back into the nested shape the
      // entry schema (DayDetailTaskSchema) expects. categoryId is a required FK
      // on both tables, so a non-null category_id always joins a row — the null
      // branch is defensive (the schema permits a null category).
      const entries = rows.map((row) => ({
        source: row.source,
        id: row.id,
        title: row.title,
        completedAt: row.completed_at,
        category:
          row.category_id !== null
            ? {
                id: row.category_id,
                name: row.category_name ?? '',
                color: row.category_color ?? 'blue',
              }
            : null,
      }))

      const hasMore = offset + entries.length < total

      return {
        entries,
        total,
        hasMore,
        nextOffset: hasMore ? offset + limit : undefined,
      }
    } catch (error) {
      log.error('Error in getJournal:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch completion journal',
        cause: error,
      })
    }
  })

/**
 * Inserts a row directly into the Completed table for the authenticated user.
 * Used by LiveEditor's checkbox-tick flow which bypasses the Todo lifecycle —
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
 * within {@link COMPLETED_UNDO_WINDOW_MS} of creation. Used by LiveEditor's
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
 * Resolves the category every imported keep lands in: the account's default,
 * falling back to any category, seeding "General" when the account has none.
 * Exists because a `/write` visitor can sign up and merge before the Clerk
 * webhook's seed lands, and an import that 404s there would strand the device's
 * whole history. Called only by {@link importLocalCompleted}, outside its
 * transaction — a P2002 from the seed would abort the batch insert.
 * @param userId - Owner whose default category is wanted.
 * @returns The category id to file every imported row under.
 * @example
 * await resolveImportCategoryId(user.id) // => 3
 */
async function resolveImportCategoryId(userId: number): Promise<number> {
  const existing = await prisma.category.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  })
  if (existing) return existing.id

  try {
    const created = await prisma.category.create({
      data: { ...DEFAULT_CATEGORY_SEED, userId },
      select: { id: true },
    })
    return created.id
  } catch (error) {
    // P2002 = @@unique([name, userId]); the webhook (or a non-default "General")
    // already owns the name, so fall through to whatever the account does have.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error
    }
  }

  const fallback = await prisma.category.findFirst({
    where: { userId },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  if (!fallback) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'No category available to import into',
    })
  }
  return fallback.id
}

/**
 * Merges a device's signed-out keeps into the account exactly once. Runs from
 * the root-level merge provider right after sign-in, so a visitor who wrote at
 * `/write` before making an account keeps every ember they earned.
 *
 * Idempotency is the `ImportBatch` primary key, namespaced `"<userId>:<batchId>"`
 * so two accounts can never collide on one client-generated id. The insert and
 * the rows share a single transaction: a duplicate batch throws P2002 and rolls
 * the whole thing back before a row lands, which is why the catch sits outside
 * the callback — catching inside would run against an already-aborting
 * transaction. Repeated titles are never deduplicated; repeating a task is the
 * habit signal this app exists to count.
 *
 * @param input.batchId - Client idempotency key, persisted locally before the call so a retry reuses it.
 * @param input.items - The device's unmerged keeps, each with the timestamp it actually happened at.
 * @returns How many rows landed, and whether this batch had already been imported.
 * @example
 * importLocalCompleted({ batchId: '7d0c…', items: [{ title: 'buy milk', completedAt: new Date() }] })
 * // => { batchId: '7d0c…', imported: 1, alreadyImported: false }
 */
export const importLocalCompleted = authMiddleware
  .input(ImportLocalSchema)
  .output(ImportLocalResponseSchema)
  .handler(async ({ input, context }) => {
    const { user } = context
    const { batchId, items } = input
    const namespacedBatchId = `${user.id}:${batchId}`

    try {
      const categoryId = await resolveImportCategoryId(user.id)

      await prisma.$transaction(async (tx) => {
        await tx.importBatch.create({
          data: { id: namespacedBatchId, userId: user.id },
        })
        await tx.completed.createMany({
          data: items.map((item) => ({
            title: item.title,
            completedAt: item.completedAt,
            categoryId,
            userId: user.id,
            importBatchId: namespacedBatchId,
          })),
        })
      })

      return { batchId, imported: items.length, alreadyImported: false }
    } catch (error) {
      // The batch id is already taken: an earlier attempt committed and only its
      // response was lost. Nothing to do, and the client tags its items either way.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { batchId, imported: 0, alreadyImported: true }
      }
      if (error instanceof ORPCError) throw error
      log.error('Error in importLocalCompleted:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to import local completions',
        cause: error,
      })
    }
  })
