import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { parseUtcTimestamp } from '@/db/parseUtcTimestamp'
import type { DayDetailTask } from '@/server/schemas/completed'

/**
 * One row in the merged Todo+Completed completion stream consumed by the
 * heatmap and day-detail procedures. The `source` discriminator stays
 * server-side (it's not surfaced in the API response shape) and exists so
 * unit tests can assert UNION composition without relying on title equality.
 *
 * @example
 * { source: 'todo', id: 12, title: 'draft digest', completedAt: Date, category: { id: 3, name: 'writing', color: 'blue' } }
 * @example
 * { source: 'completed', id: 42, title: 'buy milk', completedAt: Date, category: { id: 1, name: 'General', color: 'blue' } }
 */
export type CompletedEntry = {
  source: 'todo' | 'completed'
  id: number
  title: string
  completedAt: Date
  category: NonNullable<DayDetailTask['category']>
}

/**
 * Returns Todo+Completed entries (UNION) for a user within a UTC date range,
 * with category join. Single source of truth for the heatmap and day-detail
 * oRPC procedures.
 *
 * Heatmap UNION semantics (both halves now key off the stable completion day):
 *   Todo bucket      = (completedAt ?? updatedAt).toISOString()[0..10]  (UTC date)
 *   Completed bucket = (completedAt ?? createdAt).toISOString()[0..10]  (UTC date)
 *
 * Both halves FILTER and BUCKET by `completedAt`, with a null-coalescing
 * fallback (Todo → updatedAt, Completed → createdAt) for any row whose
 * completedAt is null. Earlier migrations (now folded into drizzle/0000_init.sql)
 * added Todo.completedAt, backfilled from updatedAt, and Completed.completedAt,
 * backfilled from createdAt; the now-removed toggleTodo wrote it on each false→true
 * completion. Because the filter and the bucket now use the
 * SAME field, a completion always lands on its real day's range — this fixes
 * both the dated-import drop and the edit-drift noted below.
 *
 * Resolved drift: Todo.updatedAt mutates on text/notes edit, so before
 * completedAt existed a completed Todo edited later moved dates on the heatmap.
 * Keying off the stable completedAt removes that drift (居残りモード was the
 * forcing function for the migration).
 *
 * Dedup: Todo and Completed are disjoint surfaces by construction —
 * LiveEditor's checkbox-tick writes Completed directly, and the legacy
 * `Todo` branch is now read-only history (no code path writes it).
 * Therefore no row-level dedup is needed; this invariant is asserted by a
 * unit test.
 *
 * @param userId - Internal `User.id` (NOT the Clerk `userId` string).
 * @param startDate - Inclusive lower bound (caller aligns to UTC midnight).
 * @param endDate - Inclusive upper bound (caller aligns to UTC end-of-day).
 * @returns
 * - `CompletedEntry[]` sorted ascending by `completedAt`
 * - Empty array when neither table has rows in the range
 * @example
 * await fetchCompletedEntries(7, new Date('2026-05-04T00:00:00.000Z'), new Date('2026-05-10T23:59:59.999Z'))
 * // => [{ source: 'todo', id: 1, ..., completedAt: 2026-05-04 }, { source: 'completed', id: 9, ..., completedAt: 2026-05-10 }]
 */
export async function fetchCompletedEntries(
  userId: number,
  startDate: Date,
  endDate: Date,
): Promise<CompletedEntry[]> {
  type CompletionRow = {
    source: CompletedEntry['source']
    id: number
    title: string
    completed_at: string
    category_id: number
    category_name: string
    category_color: string
    parent_id: number | null
    parent_name: string | null
    parent_color: string | null
  }
  // One statement pins both legacy and kept entries to the same hierarchy snapshot.
  // ISO text parameters preserve UTC wall-clock comparisons for timestamp-without-zone columns.
  const { rows } = await db.execute<CompletionRow>(sql`
    WITH entries AS (
      SELECT 'todo'::text AS source, t.id, t.text AS title,
             COALESCE(t."completedAt", t."updatedAt") AS completed_at,
             t."categoryId" AS category_id
      FROM "Todo" t
      WHERE t."userId" = ${userId} AND t.completed = true
        AND ((t."completedAt" BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()})
          OR (t."completedAt" IS NULL AND t."updatedAt" BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()}))
      UNION ALL
      SELECT 'completed'::text AS source, cp.id, cp.title,
             COALESCE(cp."completedAt", cp."createdAt") AS completed_at,
             cp."categoryId" AS category_id
      FROM "Completed" cp
      WHERE cp."userId" = ${userId} AND cp.archived = false
        AND ((cp."completedAt" BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()})
          OR (cp."completedAt" IS NULL AND cp."createdAt" BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()}))
    )
    SELECT e.source, e.id, e.title, e.completed_at,
           c.id AS category_id, c.name AS category_name, c.color AS category_color,
           p.id AS parent_id, p.name AS parent_name, p.color AS parent_color
    FROM entries e
    INNER JOIN "Category" c ON c.id = e.category_id AND c."userId" = ${userId}
    LEFT JOIN "Category" p ON p.id = c."parentId" AND p."userId" = c."userId"
  `)
  // Preserve the established source/id tie order after parsing raw UTC timestamps.
  return rows
    .map((row) => ({
      source: row.source,
      id: row.id,
      title: row.title,
      completedAt: parseUtcTimestamp(row.completed_at),
      category: {
        id: row.category_id,
        name: row.category_name,
        color: row.category_color,
        parent:
          row.parent_id === null
            ? null
            : {
                id: row.parent_id,
                name: row.parent_name ?? '',
                color: row.parent_color ?? 'blue',
              },
      },
    }))
    .sort(compareCompletedEntries)
}

/**
 * Orders completion entries by completion time ascending, breaking ties by source (todo first) and then id.
 *
 * The tie-break keeps rows that share an instant, such as a bulk import or a test seed, in one deterministic order instead of the database's unspecified row order.
 * Called as the sort comparator of {@link fetchCompletedEntries}.
 *
 * @param a - First entry.
 * @param b - Second entry.
 * @returns Negative when `a` comes first, positive when `b` does, never zero for distinct entries.
 * @example
 * [entryAt10, entryAt09].sort(compareCompletedEntries) // => [entryAt09, entryAt10]
 */
export function compareCompletedEntries(
  a: CompletedEntry,
  b: CompletedEntry,
): number {
  const timeDiff = a.completedAt.getTime() - b.completedAt.getTime()
  if (timeDiff !== 0) return timeDiff
  if (a.source !== b.source) return a.source === 'todo' ? -1 : 1
  return a.id - b.id
}
