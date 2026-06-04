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
 * Heatmap UNION semantics (both halves now key off the stable completion day):
 *   Todo bucket      = (completedAt ?? updatedAt).toISOString()[0..10]  (UTC date)
 *   Completed bucket = (completedAt ?? createdAt).toISOString()[0..10]  (UTC date)
 *
 * Both halves FILTER and BUCKET by `completedAt`, with a null-coalescing
 * fallback (Todo → updatedAt, Completed → createdAt) for any row whose
 * completedAt is null. Migration 20260603235155 added Todo.completedAt and
 * backfilled it from updatedAt; toggleTodo writes it on each false→true
 * completion. Migration 20260529164052 added Completed.completedAt and
 * backfilled it from createdAt. Because the filter and the bucket now use the
 * SAME field, a completion always lands on its real day's range — this fixes
 * both the dated-import drop and the edit-drift noted below.
 *
 * Resolved drift: Todo.updatedAt mutates on text/notes edit, so before
 * completedAt existed a completed Todo edited later moved dates on the heatmap.
 * Keying off the stable completedAt removes that drift (居残りモード was the
 * forcing function for the migration).
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
        // Filter by the stable completion day. `completedAt` is the semantic
        // completion timestamp (migration 20260603235155); fall back to
        // `updatedAt` only for rows whose `completedAt` is still null (an
        // unconverted write path or a pre-backfill row) so they never vanish
        // from the heatmap.
        OR: [
          { completedAt: { gte: startDate, lte: endDate } },
          { completedAt: null, updatedAt: { gte: startDate, lte: endDate } },
        ],
      },
      select: {
        id: true,
        text: true,
        completedAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.completed.findMany({
      where: {
        userId,
        // archived rows are excluded from the heatmap surface. The archive flow
        // (archiveCompletedTodos) writes every row archived:false, so cleared
        // todos still count; an archived:true row would silently drop its day.
        archived: false,
        // Filter by the semantic completion day, falling back to `createdAt`
        // (insert time) only for rows whose `completedAt` is null. This lands
        // the dated-import case (a row with a past `completedAt` and a today
        // `createdAt`) on its REAL day, and keeps Slice-1 paste-import correct
        // (those rows have completedAt = now() = createdAt). The backfill set
        // completedAt = createdAt, so nulls are not expected — the fallback is
        // defensive.
        OR: [
          { completedAt: { gte: startDate, lte: endDate } },
          { completedAt: null, createdAt: { gte: startDate, lte: endDate } },
        ],
      },
      select: {
        id: true,
        title: true,
        // Bucket by `completedAt ?? createdAt` (coalesced in JS below).
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
    // Bucket by the stable completion day, falling back to updatedAt for any
    // row whose completedAt is null (defensive — see the where clause).
    completedAt: row.completedAt ?? row.updatedAt,
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
