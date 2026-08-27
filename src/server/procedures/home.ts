import { call } from '@orpc/server'

import { authMiddleware } from '../middleware/auth'
import {
  HomeBootstrapInputSchema,
  HomeBootstrapResponseSchema,
} from '../schemas/home'

import { listCategories } from './category'
import { getHeatmap, getJournal } from './completed'

/** Resolves the three critical Home regions after one auth phase so the dashboard's first paint costs zero oRPC round-trips. @returns Category, heatmap, and journal payloads ready for their existing Query cache keys. @example `await call(bootstrapHome, input, { context: { headers } })` */
export const bootstrapHome = authMiddleware
  .input(HomeBootstrapInputSchema)
  .output(HomeBootstrapResponseSchema)
  .handler(async ({ context, input }) => {
    return context.serverTiming.measure('sql', async () => {
      // Every region is independent, so start all three at once.
      const categoryPromise = call(listCategories, undefined, { context })
      const heatmapPromise = call(getHeatmap, input.heatmap, { context })
      const journalPromise = call(getJournal, input.journal, { context })

      // Child procedures reuse the resolved user, avoiding repeated auth DB work.
      const [category, heatmap, journal] = await Promise.all([
        categoryPromise,
        heatmapPromise,
        journalPromise,
      ])

      return { category, heatmap, journal }
    })
  })
