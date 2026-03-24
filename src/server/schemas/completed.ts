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
 * Category breakdown within a single day's heatmap entry.
 * @example
 * { id: 1, name: "Corelive", color: "blue", count: 3 }
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
