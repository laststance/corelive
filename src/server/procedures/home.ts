import { call } from '@orpc/server'

import { authMiddleware } from '../middleware/auth'
import {
  HomeBootstrapInputSchema,
  HomeBootstrapResponseSchema,
} from '../schemas/home'

import { listCategories } from './category'
import { getHeatmap, getJournal } from './completed'
import { listTodos } from './todo'

/** Resolves the four critical Home regions concurrently after one auth/connection/user phase whenever SSR or `home.bootstrap` calls it. @returns Category, Todo, heatmap, and journal payloads ready for their existing Query cache keys. @example `await call(bootstrapHome, input, { context: { headers } })` */
export const bootstrapHome = authMiddleware
  .input(HomeBootstrapInputSchema)
  .output(HomeBootstrapResponseSchema)
  .handler(async ({ context, input }) => {
    return context.serverTiming.measure('sql', async () => {
      // Each child receives the already-resolved user, so its auth middleware performs no additional database work.
      const [category, todo, heatmap, journal] = await Promise.all([
        call(listCategories, undefined, { context }),
        call(listTodos, input.todo, { context }),
        call(getHeatmap, input.heatmap, { context }),
        call(getJournal, input.journal, { context }),
      ])

      return { category, todo, heatmap, journal }
    })
  })
