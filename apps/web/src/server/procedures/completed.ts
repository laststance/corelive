import { ORPCError } from '@orpc/server'
import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { parseUtcTimestamp } from '@/db/parseUtcTimestamp'
import { shiftIsoDate } from '@/lib/shiftIsoDate'
import { toLocalDayKey } from '@/lib/toLocalDayKey'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import type { DayDetailTask } from '../schemas/completed'
import {
  CompletedJournalInputSchema,
  CompletedJournalResponseSchema,
  DayDetailInputSchema,
  DayDetailResponseSchema,
  HeatmapInputSchema,
  HeatmapResponseSchema,
} from '../schemas/completed'
import { calculateStreaks } from '../utils/calculateStreaks'
import { fetchCompletedEntries } from '../utils/completedAggregation'

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
            NonNullable<DayDetailTask['category']> & { count: number }
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

        // Both aggregation queries inner-join the category (a required FK), so every entry has one.
        const categoryId = entry.category.id
        if (!day.categories.has(categoryId)) {
          day.categories.set(categoryId, {
            id: categoryId,
            name: entry.category.name,
            color: entry.category.color,
            parent: entry.category.parent,
            count: 0,
          })
        }
        day.categories.get(categoryId)!.count++
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
        NonNullable<DayDetailTask['category']> & { count: number }
      >()
      for (const entry of entries) {
        const existing = categoryRollup.get(entry.category.id)
        if (existing) {
          existing.count++
        } else {
          categoryRollup.set(entry.category.id, {
            id: entry.category.id,
            name: entry.category.name,
            color: entry.category.color,
            parent: entry.category.parent,
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
      const {
        limit,
        offset,
        categoryId,
        includeSubcategories,
        completedFrom,
        completedBefore,
      } = input
      const { user } = context

      // Raw UNION row shape. Int4 columns (id, category_id) arrive as numbers;
      // the timestamp arrives as the driver's raw text (drizzle does not convert
      // timestamps in raw rows) and is turned into a UTC Date below. The COUNT is
      // cast `::int` in SQL so it is a number, not a bigint string.
      type JournalRow = {
        source: 'todo' | 'completed' | null
        id: number
        title: string
        completed_at: string
        category_id: number | null
        category_name: string | null
        category_color: string | null
        parent_id: number | null
        parent_name: string | null
        parent_color: string | null
        total: number
      }

      // Build the normalized feed once so list + count cannot drift on fallback
      // timestamps or filter semantics. Every interpolation is parameterized.
      const mergedJournalRows = sql`
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
          ? sql``
          : sql`AND (c.id = ${categoryId} ${includeSubcategories ? sql`OR c."parentId" = ${categoryId}` : sql``})`
      // Bind the bounds as UTC ISO strings, never as Date objects: pg serializes a
      // Date with the process's local offset, and Postgres drops the offset when it
      // compares against `timestamp without time zone`, which would shift the
      // filter by the server's UTC offset (9h on a JST machine, 0 on Vercel).
      const completedFromFilter =
        completedFrom === undefined
          ? sql``
          : sql`AND m.completed_at >= ${completedFrom.toISOString()}`
      const completedBeforeFilter =
        completedBefore === undefined
          ? sql``
          : sql`AND m.completed_at < ${completedBefore.toISOString()}`

      // One statement gives page and count the same snapshot even when another window moves a category.
      const { rows } = await db.execute<JournalRow>(sql`
        WITH scoped AS (
          SELECT m.source, m.id, m.title, m.completed_at, c.id AS category_id, c.name AS category_name,
                 c.color AS category_color, p.id AS parent_id,
                 p.name AS parent_name, p.color AS parent_color
          FROM (${mergedJournalRows}) m
          INNER JOIN "Category" c ON c.id = m.category_id AND c."userId" = ${user.id}
          LEFT JOIN "Category" p ON p.id = c."parentId" AND p."userId" = c."userId"
          WHERE TRUE ${categoryFilter} ${completedFromFilter} ${completedBeforeFilter}
        ), page AS (
          SELECT * FROM scoped
          ORDER BY completed_at DESC, source ASC, id ASC
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT page.*, totals.total
        FROM (SELECT COUNT(*)::int AS total FROM scoped) totals
        LEFT JOIN page ON TRUE
        ORDER BY page.completed_at DESC, page.source ASC, page.id ASC
      `)
      const total = rows[0]?.total ?? 0

      // Coalesce the joined category columns back into the nested shape the
      // entry schema (DayDetailTaskSchema) expects. categoryId is a required FK
      // on both tables, so a non-null category_id always joins a row — the null
      // branch is defensive (the schema permits a null category).
      const entries = rows
        .filter((row) => row.source !== null)
        .map((row) => ({
          source: row.source as 'todo' | 'completed',
          id: row.id,
          title: row.title,
          completedAt: parseUtcTimestamp(row.completed_at),
          category:
            row.category_id !== null
              ? {
                  id: row.category_id,
                  name: row.category_name ?? '',
                  color: row.category_color ?? 'blue',
                  parent:
                    row.parent_id === null
                      ? null
                      : {
                          id: row.parent_id,
                          name: row.parent_name ?? '',
                          color: row.parent_color ?? 'blue',
                        },
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
