import { z } from 'zod'

import { CategoryListResponseSchema } from './category'
import {
  CompletedJournalInputSchema,
  CompletedJournalResponseSchema,
  HeatmapInputSchema,
  HeatmapResponseSchema,
} from './completed'
import { TodoListSchema, TodoResponseSchema } from './todo'

/** Validates the canonical slices that one Home bootstrap resolves for SSR and measured API calls. @example `{ todo: { completed: false, limit: 100, offset: 0 }, heatmap: { days: 365 }, journal: { limit: 10, offset: 0 } }` */
export const HomeBootstrapInputSchema = z.object({
  todo: TodoListSchema,
  heatmap: HeatmapInputSchema,
  journal: CompletedJournalInputSchema,
})

/** Keeps the four hydrated client-cache payloads type-safe at the single Home bootstrap boundary. @example `{ category: { categories: [] }, todo: { todos: [], total: 0, hasMore: false }, heatmap: { data: [], streaks: { current: 0, longest: 0 }, total: 0 }, journal: { entries: [], total: 0, hasMore: false } }` */
export const HomeBootstrapResponseSchema = z.object({
  category: CategoryListResponseSchema,
  todo: TodoResponseSchema,
  heatmap: HeatmapResponseSchema,
  journal: CompletedJournalResponseSchema,
})

/**
 * Pre-parse bootstrap input shape shared with the SSR prefetch input builder.
 * `z.input` (not `z.infer`) because callers hand the raw client-side inputs to
 * `call(bootstrapHome, …)` before Zod applies defaults.
 */
export type HomeBootstrapInput = z.input<typeof HomeBootstrapInputSchema>

/** Inferred bootstrap payload so SSR cache writes stay typed to the procedure output. */
export type HomeBootstrapResponse = z.infer<typeof HomeBootstrapResponseSchema>
