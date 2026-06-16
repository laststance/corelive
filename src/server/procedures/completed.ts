import { ORPCError } from '@orpc/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { normalizeCompletedTitle } from '@/components/braindump/braindumpUtils'
import { COMPLETED_UNDO_WINDOW_MS } from '@/lib/constants/import'
import { prisma } from '@/lib/prisma'
import { shiftIsoDate } from '@/lib/shiftIsoDate'
import { toLocalDayKey } from '@/lib/toLocalDayKey'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import {
  CompletedJournalInputSchema,
  CompletedJournalResponseSchema,
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
import { calculateStreaks } from '../utils/calculateStreaks'
import { fetchCompletedEntries } from '../utils/completedAggregation'
import { resolveImportCategoryIds } from '../utils/resolveImportCategoryIds'

/**
 * Fetches heatmap data for completed tasks, aggregated by the user's *local*
 * calendar day with a category breakdown. Reads the Todo+Completed UNION via
 * {@link fetchCompletedEntries} so BrainDump checkbox-tick completions (which
 * write directly to the `Completed` table) appear on the heatmap alongside
 * Todos completed through the TodoList lifecycle.
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
 * Reads the Todo+Completed UNION via {@link fetchCompletedEntries} so both
 * lifecycle paths (TodoList complete() and BrainDump checkbox-tick) surface
 * inside the dialog's task list.
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
 * Returns one newest-first page of the permanent completion journal — the union
 * of completed Todos and `archived:false` Completed rows for the user, the same
 * stream the heatmap aggregates but flattened to individual rows with DB-level
 * pagination. Powers the home "Completed Tasks" list (CompletedTodos), now a
 * permanent win journal spanning all four completion routes (main app, floating
 * window, paste-import, braindump).
 *
 * Pagination is done in SQL (`UNION ALL` + `ORDER BY completed_at DESC` +
 * `LIMIT/OFFSET`) rather than fetching the whole history and slicing in JS: the
 * journal is unbounded (no date range, unlike the heatmap's window), so a
 * multi-year user would otherwise transfer their entire completion history on
 * every page fetch and every refetch (TanStack refetches all loaded pages on
 * invalidation). Each request is O(limit). The UNION's filter/coalesce
 * semantics mirror {@link fetchCompletedEntries} (Todo → `completed=true`,
 * `completedAt ?? updatedAt`; Completed → `archived=false`, `completedAt ??
 * createdAt`); a unit test asserts the two agree so the journal and the heatmap
 * can never disagree about what counts as a completion. `COUNT(*)` is cast
 * `::int` so it returns a JS number, not the pg driver adapter's native bigint.
 *
 * @param input.limit - Page size (1-100, default 20)
 * @param input.offset - Rows to skip (default 0)
 * @returns `{ entries, total, hasMore, nextOffset }` — entries newest-first,
 *   each tagged with its `source` ('todo' | 'completed')
 * @example
 * journal({ limit: 20, offset: 0 })
 * // => { entries: [{ source: 'todo', id: 12, title: 'ship', completedAt: Date, category: {…} }], total: 462, hasMore: true, nextOffset: 20 }
 */
export const getJournal = authMiddleware
  .input(CompletedJournalInputSchema)
  .output(CompletedJournalResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { limit, offset } = input
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

      // Two reads in parallel: the page, and the total over the same UNION.
      // `${user.id}` is auto-parameterized by the tagged template (no injection).
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
          FROM (
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
          ) m
          LEFT JOIN "Category" c ON c.id = m.category_id
          ORDER BY m.completed_at DESC, m.source ASC, m.id ASC
          LIMIT ${limit} OFFSET ${offset}
        `,
        prisma.$queryRaw<{ total: number }[]>`
          SELECT COUNT(*)::int AS total
          FROM (
            SELECT t.id
            FROM "Todo" t
            WHERE t."userId" = ${user.id} AND t.completed = true
            UNION ALL
            SELECT cp.id
            FROM "Completed" cp
            WHERE cp."userId" = ${user.id} AND cp.archived = false
          ) m
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
