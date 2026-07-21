import { call } from '@orpc/server'

import { resolveHomeSelectedCategoryId } from '@/lib/query/homeBootstrapQueries'

import { authMiddleware } from '../middleware/auth'
import {
  HomeBootstrapInputSchema,
  HomeBootstrapResponseSchema,
} from '../schemas/home'

import { listCategories } from './category'
import { getHeatmap, getJournal } from './completed'
import { listTodos } from './todo'

/** Resolves the four critical Home regions after one auth phase, making a first visit use its default category before TodoList mounts. @returns Category, Todo, heatmap, and journal payloads ready for their existing Query cache keys. @example `await call(bootstrapHome, input, { context: { headers } })` */
export const bootstrapHome = authMiddleware
  .input(HomeBootstrapInputSchema)
  .output(HomeBootstrapResponseSchema)
  .handler(async ({ context, input }) => {
    return context.serverTiming.measure('sql', async () => {
      // Start the independent regions immediately so resolving a fresh browser's
      // default category delays only its Todo slice.
      const categoryPromise = call(listCategories, undefined, { context })
      const heatmapPromise = call(getHeatmap, input.heatmap, { context })
      const journalPromise = call(getJournal, input.journal, { context })

      const todoPromise =
        input.todo.categoryId === undefined
          ? categoryPromise.then(async (category) => {
              // A first visit has no category cookie yet, so use the same
              // default Category will persist after hydration.
              const selectedCategoryId = resolveHomeSelectedCategoryId(
                undefined,
                category.categories,
              )
              return call(
                listTodos,
                {
                  ...input.todo,
                  ...(selectedCategoryId !== undefined && {
                    categoryId: selectedCategoryId,
                  }),
                },
                { context },
              )
            })
          : call(listTodos, input.todo, { context })

      // Child procedures reuse the resolved user, avoiding repeated auth DB work.
      const [category, todo, heatmap, journal] = await Promise.all([
        categoryPromise,
        todoPromise,
        heatmapPromise,
        journalPromise,
      ])

      return { category, todo, heatmap, journal }
    })
  })
