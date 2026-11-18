import { stripJournalSearchLineBreaks } from '@corelive/desktop-contract/journal-search'
import { ORPCError, os } from '@orpc/server'

import { getLocalTodayIsoDate } from '@/lib/getLocalTodayIsoDate'
import { shiftIsoDate } from '@/lib/shiftIsoDate'
import { toLocalDayKey } from '@/lib/toLocalDayKey'
import type { CategoryWithCount } from '@/server/schemas/category'
import {
  CompletedJournalInputSchema,
  DayDetailInputSchema,
  HeatmapInputSchema,
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
  [29, 1, 'Copy the word λόγος'],
  [47, 2, 'Review the\r\n archive'],
  [88, 1, 'Start a sketchbook'],
] as const

type DatedCompletion = Omit<DayDetailTask, 'category'> & {
  categoryId: number
}

/**
 * Shares mutable completion history between the Home fixture's activity queries
 * and its category list and deletion handlers.
 * @example
 * const activity = createActivityFixture(categories, new URLSearchParams('activity=empty'))
 */
export function createActivityFixture(
  categories: ReadonlyMap<number, CategoryWithCount>,
  parameters: URLSearchParams,
) {
  const seedToday = getLocalTodayIsoDate()
  const mode = parameters.get('activity')
  let failNextHeatmap = mode === 'retry'
  const records = mode === 'empty' || parameters.has('delete') ? [] : sessions
  const datedEntries = records.map<DatedCompletion>(
    ([daysAgo, categoryId, title], index) => {
      const date = shiftIsoDate(seedToday, -daysAgo)
      return {
        categoryId,
        source: 'completed',
        id: index + 1,
        title,
        completedAt: new Date(date + 'T09:00:00'),
      }
    },
  )
  function describeEntry({
    categoryId,
    id,
    title,
    source,
    completedAt,
  }: DatedCompletion): DayDetailTask {
    const category = categories.get(categoryId)
    return {
      id,
      title,
      source,
      completedAt,
      category: category
        ? {
            id: category.id,
            name: category.name,
            color: category.color,
            parent: null,
          }
        : null,
    }
  }
  function dayDetail(date: string, entries: readonly DatedCompletion[]) {
    const tasks = entries.map(describeEntry)
    const breakdown = [...categories.values()].flatMap(
      ({ id, name, color }) => {
        const count = tasks.filter((task) => task.category?.id === id).length
        return count ? [{ id, name, color, count, parent: null }] : []
      },
    )
    return { date, tasks, count: tasks.length, categories: breakdown }
  }
  const completed = {
    heatmap: os.input(HeatmapInputSchema).handler(({ input }) => {
      // A single failure lets QA exercise the same retry button as a real network error.
      if (failNextHeatmap) {
        failNextHeatmap = false
        throw new ORPCError('INTERNAL_SERVER_ERROR')
      }
      const zone = input.timezone ?? null
      const today = toLocalDayKey(new Date(), zone)
      const start = shiftIsoDate(today, 1 - input.days)
      const days = new Map<string, DatedCompletion[]>()
      for (const entry of datedEntries) {
        const date = toLocalDayKey(entry.completedAt, zone)
        if (date < start || date > today) continue
        const entries = days.get(date) ?? []
        entries.push(entry)
        days.set(date, entries)
      }
      const data = Array.from(days, ([date, entries]) => {
        const { count, categories } = dayDetail(date, entries)
        return { date, count, categories }
      })
      return {
        data,
        total: data.reduce((total, day) => total + day.count, 0),
        streaks: calculateStreaks(
          [...days.keys()],
          today,
          shiftIsoDate(today, -1),
        ),
      }
    }),
    dayDetail: os.input(DayDetailInputSchema).handler(({ input }) => {
      const zone = input.timezone ?? null
      const entries = datedEntries.filter(
        ({ completedAt }) => toLocalDayKey(completedAt, zone) === input.date,
      )
      return dayDetail(input.date, entries)
    }),
    journal: os.input(CompletedJournalInputSchema).handler(({ input }) => {
      const fold = (value: string) =>
        stripJournalSearchLineBreaks(value).toLowerCase().replaceAll('ς', 'σ')
      const search = fold(input.search ?? '')
      const entries = datedEntries.filter(
        ({ categoryId, completedAt, title }) =>
          (!input.categoryId || input.categoryId === categoryId) &&
          (!input.completedFrom || completedAt >= input.completedFrom) &&
          (!input.completedBefore || completedAt < input.completedBefore) &&
          (!search || fold(title).includes(search)),
      )
      const end = input.offset + input.limit
      const hasMore = end < entries.length
      return {
        entries: entries.slice(input.offset, end).map(describeEntry),
        total: entries.length,
        hasMore,
        nextOffset: hasMore ? end : undefined,
      }
    }),
  }
  return {
    completed,
    /** Counts the current completions shown in a category's deletion preview.
     * @example activity.countCategoryRecords(2)
     */
    countCategoryRecords(id: number) {
      return datedEntries.filter((entry) => entry.categoryId === id).length
    },
    /** Reassigns completion categories after the delete handler validates the destination.
     * @example activity.moveCategoryRecords(2, 1)
     */
    moveCategoryRecords(sourceId: number, destinationId: number): void {
      for (const entry of datedEntries) {
        if (entry.categoryId === sourceId) entry.categoryId = destinationId
      }
    },
  }
}
