import { z } from 'zod'

import { MAX_IMPORT_LINES_PER_BATCH } from '@/lib/constants/import'

/**
 * Optional IANA timezone the client reports (e.g. `'Asia/Tokyo'`) so the
 * server can bucket completions by the user's *local* calendar day instead
 * of UTC. Kept loose — a sane max-length string, NOT a strict IANA enum —
 * because `toLocalDayKey` validates the zone at use-time and falls back to
 * UTC for absent/garbage values, so an unknown zone degrades gracefully
 * instead of 400-ing an otherwise valid heatmap request.
 *
 * @example
 * 'Asia/Tokyo' // bucket by JST local day
 * undefined    // omitted → server buckets by UTC (legacy behavior)
 */
const TimeZoneInputSchema = z.string().min(1).max(64).optional()

/**
 * Input schema for the completed tasks heatmap endpoint.
 * @example
 * { days: 365, timezone: 'Asia/Tokyo' } // last 365 local days of activity
 */
export const HeatmapInputSchema = z.object({
  days: z.number().int().min(1).max(365).default(365),
  timezone: TimeZoneInputSchema,
})

/**
 * Input schema for creating a Completed row directly (used by BrainDump
 * checkbox flow that bypasses the Todo lifecycle).
 * @example
 * { categoryId: 1, title: "buy milk" }
 */
export const CreateCompletedSchema = z.object({
  categoryId: z.number().int(),
  title: z.string().min(1).max(255),
})

/**
 * Input schema for deleting a Completed row (used by BrainDump's 5-second
 * toast-undo flow when the user retracts a checkbox tick).
 * @example
 * { id: 42 }
 */
export const DeleteCompletedSchema = z.object({
  id: z.number().int(),
})

/**
 * A single item in a paste-import batch destined for the Completed zone.
 *
 * `categoryId` is optional: when omitted the server resolves the user's
 * get-or-create default category. `completedAt` is optional: when omitted the
 * server stamps `now()` (Slice 1 lands everything on today). Title is validated
 * 1..255 here, but the server still re-runs `normalizeCompletedTitle` (Zod's
 * `.min(1)` does not reject a whitespace-only title that normalizes to empty).
 *
 * @example
 * { title: 'shipped the release' }
 * @example
 * { title: 'gym', categoryId: 3, completedAt: new Date('2026-05-01T00:00:00Z') }
 */
export const CreateManyCompletedItemSchema = z.object({
  title: z.string().min(1).max(255),
  categoryId: z.number().int().positive().optional(),
  completedAt: z.date().optional(),
})

/**
 * Input schema for `completed.createMany` (paste-import → Completed zone).
 * `items` is bounded by `MAX_IMPORT_LINES_PER_BATCH` so the cap is single-sourced
 * with the PR2 client preview. `importBatchId` is the client-generated, globally
 * unique idempotency key (one per paste-confirm).
 *
 * @example
 * { items: [{ title: 'a' }, { title: 'b' }], importBatchId: 'b2c1…' }
 */
export const CreateManyCompletedSchema = z.object({
  items: z
    .array(CreateManyCompletedItemSchema)
    .min(1)
    .max(MAX_IMPORT_LINES_PER_BATCH),
  importBatchId: z.string().min(1),
})

/**
 * Output schema for `completed.createMany`. `count` is how many rows the batch
 * resolved to; `idempotent` is `true` when the batch id already existed (P2002
 * no-op → re-queried prior count) and `false` on a fresh insert.
 *
 * @example
 * { count: 50, idempotent: false } // fresh import
 * @example
 * { count: 50, idempotent: true }  // resubmit of the same importBatchId
 */
export const CreateManyCompletedResponseSchema = z.object({
  count: z.number().int().min(0),
  idempotent: z.boolean(),
})

/**
 * Input schema for `completed.deleteMany` (bulk undo of a paste batch).
 * @example
 * { importBatchId: 'b2c1…' }
 */
export const DeleteManyCompletedSchema = z.object({
  importBatchId: z.string().min(1),
})

/**
 * Output schema for `completed.deleteMany`. `count` is the number of rows the
 * window-guarded delete actually removed (0 once the undo window expires).
 * @example
 * { count: 50 } // undone within the window
 * @example
 * { count: 0 }  // window expired, nothing deleted
 */
export const DeleteManyCompletedResponseSchema = z.object({
  count: z.number().int().min(0),
})

/**
 * Schema mirroring the Prisma `Completed` model (selected fields the API
 * round-trips). Used as the output shape of `completed.create`.
 * @example
 * { id: 1, title: "buy milk", categoryId: 2, archived: false, createdAt, updatedAt }
 */
export const CompletedSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  categoryId: z.number().int(),
  archived: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

/**
 * Inferred type of a Completed row exchanged via oRPC. Re-export to give
 * renderer/desktop code a single source of truth for `Completed.id` /
 * `Completed.title` / `Completed.categoryId` types.
 */
export type Completed = z.infer<typeof CompletedSchema>

/**
 * Category breakdown within a single day's heatmap entry.
 * @example
 * { id: 1, name: "CoreLive", color: "blue", count: 3 }
 */
export const HeatmapCategorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  color: z.string(),
  count: z.number().int(),
})

/**
 * A single day entry in the heatmap.
 * @example
 * { date: "2026-03-24", count: 5, categories: [...] }
 */
export const HeatmapDaySchema = z.object({
  date: z.string(),
  count: z.number().int(),
  categories: z.array(HeatmapCategorySchema),
})

/**
 * Response schema for the heatmap endpoint.
 * @example
 * { data: [...], streaks: { current: 12, longest: 28 }, total: 89 }
 */
export const HeatmapResponseSchema = z.object({
  data: z.array(HeatmapDaySchema),
  streaks: z.object({
    current: z.number().int(),
    longest: z.number().int(),
  }),
  total: z.number().int(),
})

/**
 * Input schema for the day-detail endpoint used by DayDetailDialog.
 * Date is the local calendar date the user clicked on the heatmap.
 * @example
 * { date: "2026-05-10" }
 */
export const DayDetailInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'date must be YYYY-MM-DD',
    })
    .refine(
      (value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`)
        return (
          !Number.isNaN(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === value
        )
      },
      { message: 'date must be a valid calendar date' },
    ),
  timezone: TimeZoneInputSchema,
})

/**
 * Single completed task entry surfaced in the day-detail dialog.
 *
 * `source` discriminates which Prisma table the entry came from. The pair
 * `(source, id)` is globally unique; the dialog uses it as the React key
 * because `Todo.id` and `Completed.id` are independent autoincrement
 * sequences and can collide on the same day.
 *
 * @example
 * { source: 'todo', id: 12, title: "draft sunday digest", completedAt: Date, category: { id: 1, name: "writing", color: "blue" } }
 * @example
 * { source: 'completed', id: 7, title: "buy milk", completedAt: Date, category: null }
 */
export const DayDetailTaskSchema = z.object({
  source: z.enum(['todo', 'completed']),
  id: z.number().int(),
  title: z.string(),
  completedAt: z.date(),
  category: z
    .object({
      id: z.number().int(),
      name: z.string(),
      color: z.string(),
    })
    .nullable(),
})

/**
 * Inferred type of a single completed-task entry. Shared source of truth for
 * both the day-detail dialog row and the permanent journal row (they render the
 * same `{ source, id, title, completedAt, category }` shape), so renderer code
 * imports this instead of re-declaring the shape.
 */
export type DayDetailTask = z.infer<typeof DayDetailTaskSchema>

/**
 * Response schema for the day-detail endpoint.
 * @example
 * { date: "2026-05-10", count: 3, tasks: [...], categories: [...] }
 */
export const DayDetailResponseSchema = z.object({
  date: z.string(),
  count: z.number().int(),
  tasks: z.array(DayDetailTaskSchema),
  categories: z.array(HeatmapCategorySchema),
})

/**
 * Input schema for the permanent completion journal (`completed.journal`).
 * Offset pagination plus optional period/category predicates for the home
 * Completed Tasks filters. Periods use a half-open `[from, before)` interval so
 * adjacent calendar presets cannot overlap at midnight.
 * @example
 * { limit: 20, offset: 0, categoryId: 3, completedFrom: new Date('2026-07-01T00:00:00Z'), completedBefore: new Date('2026-08-01T00:00:00Z') }
 */
export const CompletedJournalInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
    categoryId: z.number().int().positive().optional(),
    completedFrom: z.date().optional(),
    completedBefore: z.date().optional(),
  })
  .superRefine(({ completedFrom, completedBefore }, context) => {
    // Reject empty/reversed windows before they can reach the raw SQL path.
    if (
      completedFrom !== undefined &&
      completedBefore !== undefined &&
      completedBefore.getTime() <= completedFrom.getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['completedBefore'],
        message: 'completedBefore must be after completedFrom',
      })
    }
  })

/**
 * Response schema for `completed.journal` — one newest-first page of the merged
 * `Todo(completed:true) ∪ Completed(archived:false)` stream. Each entry reuses
 * {@link DayDetailTaskSchema} (`{ source, id, title, completedAt, category }`)
 * because the journal row and the day-detail row are the same shape; `source`
 * lets the renderer route per-row affordances (todo-source keeps the uncomplete
 * checkbox; completed-source is display-only).
 *
 * @example
 * { entries: [{ source: 'todo', id: 12, title: 'ship release', completedAt: Date, category: { id: 1, name: 'Work', color: 'green' } }], total: 462, hasMore: true, nextOffset: 20 }
 */
export const CompletedJournalResponseSchema = z.object({
  entries: z.array(DayDetailTaskSchema),
  total: z.number().int().min(0),
  hasMore: z.boolean(),
  nextOffset: z.number().int().min(0).optional(),
})

/**
 * Inferred type of one `completed.journal` page. Shared so the optimistic
 * toggle in `useTodoMutations` can type its `setQueriesData` cache writes
 * against the exact response shape instead of re-declaring it.
 */
export type CompletedJournalResponse = z.infer<
  typeof CompletedJournalResponseSchema
>
