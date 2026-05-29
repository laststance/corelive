import { prisma } from '@/lib/prisma'

/**
 * One row in the merged Todo+Completed completion stream consumed by the
 * heatmap and day-detail procedures. The `source` discriminator stays
 * server-side (it's not surfaced in the API response shape) and exists so
 * unit tests can assert UNION composition without relying on title equality.
 *
 * @example
 * { source: 'todo', id: 12, title: 'draft digest', completedAt: Date, category: { id: 3, name: 'writing', color: 'blue' } }
 * @example
 * { source: 'completed', id: 42, title: 'buy milk', completedAt: Date, category: null }
 */
export type CompletedEntry = {
  source: 'todo' | 'completed'
  id: number
  title: string
  completedAt: Date
  category: { id: number; name: string; color: string } | null
}

/**
 * Returns Todo+Completed entries (UNION) for a user within a UTC date range,
 * with category join. Single source of truth for the heatmap and day-detail
 * oRPC procedures.
 *
 * Heatmap UNION semantics (locked decision D2=A):
 *   Todo bucket      = updatedAt.toISOString().split('T')[0]            (UTC date)
 *   Completed bucket = (completedAt ?? createdAt).toISOString()[0..10]  (UTC date)
 *
 * Completed buckets by `completedAt ?? createdAt` (paste-import, Issue #53):
 * completedAt is the semantic completion day; createdAt is the defensive
 * fallback for any row missed by the migration backfill (which set
 * completedAt = createdAt, so existing rows do not shift days). The date-range
 * FILTER still uses createdAt in Slice 1 — see the inline TODO in the query.
 *
 * Known drift: Todo.updatedAt mutates on text/notes edit, so a completed
 * Todo edited later will move dates on the heatmap. Acceptable for now;
 * tracked in TODOS.md → "Migrate Todo heatmap bucket to a stable
 * completedAt column". PR3 (Streak Notifications) is the forcing function
 * for that migration.
 *
 * Dedup: Todo and Completed are disjoint surfaces by construction —
 * BrainDump's checkbox-tick bypasses the Todo lifecycle (writes Completed
 * directly), while TodoList's complete() flow never writes Completed.
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
  // Two parallel reads; merge in JS. Each query is bounded by userId so the
  // postgres planner uses the primary userId access path. No extra index
  // needed — see /plan-eng-review §4.
  const [todoRows, completedRows] = await Promise.all([
    prisma.todo.findMany({
      where: {
        userId,
        completed: true,
        // Drift caveat: this bucket field is `updatedAt`, which mutates on
        // every edit. Migration to a stable `completedAt` column is tracked
        // in TODOS.md.
        updatedAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        text: true,
        updatedAt: true,
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.completed.findMany({
      where: {
        userId,
        // archived rows are excluded from the heatmap surface. Today nothing
        // sets archived=true, but filtering defensively avoids surprises
        // when an archive flow eventually lands.
        archived: false,
        // Slice 1: the date-range filter stays on `createdAt` (the insert
        // time). Paste-import lands everything on today (`completedAt = now()`),
        // so createdAt and completedAt coincide and the window is correct.
        // TODO(Slice 2 — dated import): when date-override ships, a row may have
        // a past `completedAt` with a today `createdAt`; this filter must then
        // move to `completedAt` or the row will be dropped from its real day's
        // range. (See docs/plans/2026-05-29-paste-import-plan.md, Heatmap §.)
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        title: true,
        // Select both: bucket by `completedAt ?? createdAt` (coalesced in JS
        // below). completedAt is the semantic completion day; createdAt is the
        // defensive fallback for any historical row the migration backfill
        // missed (it backfilled completedAt = createdAt, so existing rows do
        // NOT shift days on the heatmap).
        completedAt: true,
        createdAt: true,
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const todoEntries: CompletedEntry[] = todoRows.map((row) => ({
    source: 'todo',
    id: row.id,
    title: row.text,
    completedAt: row.updatedAt,
    category: row.category,
  }))

  const completedEntries: CompletedEntry[] = completedRows.map((row) => ({
    source: 'completed',
    id: row.id,
    title: row.title,
    // Bucket by the semantic completion day, falling back to the insert time
    // for any row whose completedAt is null (defensive — the migration
    // backfilled existing rows with completedAt = createdAt).
    completedAt: row.completedAt ?? row.createdAt,
    category: row.category,
  }))

  // Stable merge: sort by completedAt ascending. Tie-break by source then id
  // so test seeds with identical timestamps produce deterministic ordering.
  return [...todoEntries, ...completedEntries].sort((a, b) => {
    const timeDiff = a.completedAt.getTime() - b.completedAt.getTime()
    if (timeDiff !== 0) return timeDiff
    if (a.source !== b.source) return a.source === 'todo' ? -1 : 1
    return a.id - b.id
  })
}
