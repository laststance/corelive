import { z } from 'zod'

/**
 * Input schema for the completed tasks heatmap endpoint.
 * @example
 * { days: 365 } // last 365 days of activity
 */
export const HeatmapInputSchema = z.object({
  days: z.number().int().min(1).max(365).default(365),
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  }),
})

/**
 * Single completed task entry surfaced in the day-detail dialog.
 * @example
 * { id: 12, title: "draft sunday digest", completedAt: Date, category: { id: 1, name: "writing", color: "blue" } }
 */
export const DayDetailTaskSchema = z.object({
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
