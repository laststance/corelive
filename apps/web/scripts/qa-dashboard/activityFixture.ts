import { ORPCError, os } from '@orpc/server'

import { getLocalTodayIsoDate } from '@/lib/getLocalTodayIsoDate'
import { shiftIsoDate } from '@/lib/shiftIsoDate'
import type { CategoryWithCount } from '@/server/schemas/category'
import {
  CompletedJournalInputSchema,
  DayDetailInputSchema,
  type DayDetailTask,
} from '@/server/schemas/completed'
import { calculateStreaks } from '@/server/utils/calculateStreaks'

const sessions = [
  [0, 1, 'Sketch the first spread'],
  [0, 2, 'Read the chapter on color'],
  [1, 1, 'Revise the cover illustration'],
  [1, 2, 'Finish the field guide'],
  [1, 1, 'Choose paper samples'],
  [3, 1, 'Print the first proof'],
  [4, 2, 'Annotate the field guide'],
  [6, 1, 'Photograph the binding'],
  [9, 2, 'Collect references for the cover'],
  [12, 1, 'Draft the introduction'],
  [12, 2, 'Read the interview notes'],
  [17, 1, 'Test the new ink'],
  [23, 2, 'Find the original field guide'],
  [29, 1, 'Draw thumbnail layouts'],
  [47, 2, 'Review the archive'],
  [88, 1, 'Start a sketchbook'],
] as const

/**
 * Supplies the isolated Dashboard with consistent day details, heatmap and journal pages.
 * @example
 * const completed = createActivityFixture(categories, new URLSearchParams('activity=empty'))
 */
export function createActivityFixture(
  categories: readonly CategoryWithCount[],
  parameters: URLSearchParams,
) {
  const today = getLocalTodayIsoDate()
  const mode = parameters.get('activity')
  let failNextHeatmap = mode === 'retry'
  const records = mode === 'empty' || parameters.has('delete') ? [] : sessions
  const datedEntries = records.map(([daysAgo, categoryId, title], index) => {
    const date = shiftIsoDate(today, -daysAgo)
    const { id, name, color } = categories.find(
      (item) => item.id === categoryId,
    )!
    const task: DayDetailTask = {
      source: 'completed',
      id: index + 1,
      title,
      category: { id, name, color, parent: null },
      completedAt: new Date(date + 'T09:00:00'),
    }
    return { date, task }
  })
  const days = [...new Set(datedEntries.map(({ date }) => date))]
  function dayDetail(date: string) {
    const tasks = datedEntries
      .filter((entry) => entry.date === date)
      .map((entry) => entry.task)
    const breakdown = categories.flatMap(({ id, name, color }) => {
      const count = tasks.filter((task) => task.category?.id === id).length
      return count ? [{ id, name, color, count, parent: null }] : []
    })
    return { date, tasks, count: tasks.length, categories: breakdown }
  }
  return {
    heatmap: os.handler(() => {
      // A single failure lets QA exercise the same retry button as a real network error.
      if (failNextHeatmap) {
        failNextHeatmap = false
        throw new ORPCError('INTERNAL_SERVER_ERROR')
      }
      return {
        data: days.map(dayDetail),
        total: datedEntries.length,
        streaks: calculateStreaks(days, today, shiftIsoDate(today, -1)),
      }
    }),
    dayDetail: os
      .input(DayDetailInputSchema)
      .handler(({ input }) => dayDetail(input.date)),
    journal: os.input(CompletedJournalInputSchema).handler(({ input }) => {
      const entries = datedEntries
        .map(({ task }) => task)
        .filter(
          (task) =>
            (!input.categoryId || input.categoryId === task.category?.id) &&
            (!input.completedFrom || task.completedAt >= input.completedFrom) &&
            (!input.completedBefore ||
              task.completedAt < input.completedBefore) &&
            (!input.search ||
              task.title.toLowerCase().includes(input.search.toLowerCase())),
        )
      const end = input.offset + input.limit
      const hasMore = end < entries.length
      return {
        entries: entries.slice(input.offset, end),
        total: entries.length,
        hasMore,
        nextOffset: hasMore ? end : undefined,
      }
    }),
  }
}
