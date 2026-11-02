import { z } from 'zod'

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

/** Parent metadata used by retrospective paths and root totals; endpoint readers derive it from the current hierarchy.
 * @example const parent = ParentCategorySchema.parse({ id: 1, name: 'Work', color: 'blue' })
 */
const ParentCategorySchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    color: z.string(),
  })
  .nullable()

/**
 * Category breakdown within a single day's heatmap entry.
 * @example
 * { id: 1, name: "CoreLive", color: "blue", count: 3 }
 */
const HeatmapCategorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  color: z.string(),
  count: z.number().int(),
  parent: ParentCategorySchema,
})

/**
 * A single day entry in the heatmap.
 * @example
 * { date: "2026-03-24", count: 5, categories: [...] }
 */
const HeatmapDaySchema = z.object({
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
 * `source` discriminates which table the entry came from. The pair
 * `(source, id)` is globally unique; the dialog uses it as the React key
 * because `Todo.id` and `Completed.id` are independent autoincrement
 * sequences and can collide on the same day.
 *
 * @example
 * { source: 'todo', id: 12, title: "draft sunday digest", completedAt: Date, category: { id: 1, name: "writing", color: "blue" } }
 * @example
 * { source: 'completed', id: 7, title: "buy milk", completedAt: Date, category: null }
 */
const DayDetailTaskSchema = z.object({
  source: z.enum(['todo', 'completed']),
  id: z.number().int(),
  title: z.string(),
  completedAt: z.date(),
  category: z
    .object({
      id: z.number().int(),
      name: z.string(),
      color: z.string(),
      parent: ParentCategorySchema,
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
    includeSubcategories: z.boolean().default(true),
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
