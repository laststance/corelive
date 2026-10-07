import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { match } from 'ts-pattern'

import {
  LAST_THIRTY_DAY_LOOKBACK_DAYS,
  MONDAY_WEEK_START_DAY_INDEX,
  NEXT_MONTH_OFFSET_MONTHS,
  NEXT_WEEK_OFFSET_WEEKS,
  NEXT_YEAR_OFFSET_YEARS,
} from '@/lib/constants/completed'
import { NEXT_LOCAL_DAY_OFFSET_DAYS } from '@/lib/constants/date'

export type CompletedPeriod =
  'all' | 'week' | 'month' | 'year' | 'last-30-days' | 'custom'

export type CompletedJournalDateRange = Readonly<{
  completedFrom?: Date
  completedBefore?: Date
}>

/**
 * Converts the active Warm Preset Bar period into the half-open bounds sent to `completed.journal` whenever a filter changes.
 * @param period - Selected preset or Custom period.
 * @param now - Local clock anchor, injectable for deterministic preset tests.
 * @param customDateRange - Inclusive calendar selection used only by Custom.
 * @returns Inclusive lower and exclusive upper completion bounds, or no bounds for All/incomplete Custom.
 * @example
 * resolveCompletedJournalDateRange('month', new Date(2026, 6, 14)) // => July 1 through August 1
 */
export function resolveCompletedJournalDateRange(
  period: CompletedPeriod,
  now = new Date(),
  customDateRange?: DateRange,
): CompletedJournalDateRange {
  return match(period)
    .with('all', () => ({}))
    .with('week', () => {
      const completedFrom = startOfWeek(now, {
        weekStartsOn: MONDAY_WEEK_START_DAY_INDEX,
      })
      return {
        completedFrom,
        completedBefore: addWeeks(completedFrom, NEXT_WEEK_OFFSET_WEEKS),
      }
    })
    .with('month', () => {
      const completedFrom = startOfMonth(now)
      return {
        completedFrom,
        completedBefore: addMonths(completedFrom, NEXT_MONTH_OFFSET_MONTHS),
      }
    })
    .with('year', () => {
      const completedFrom = startOfYear(now)
      return {
        completedFrom,
        completedBefore: addYears(completedFrom, NEXT_YEAR_OFFSET_YEARS),
      }
    })
    .with('last-30-days', () => {
      const today = startOfDay(now)
      return {
        completedFrom: addDays(today, -LAST_THIRTY_DAY_LOOKBACK_DAYS),
        completedBefore: addDays(today, NEXT_LOCAL_DAY_OFFSET_DAYS),
      }
    })
    .with('custom', () => {
      if (
        customDateRange?.from === undefined ||
        customDateRange.to === undefined
      ) {
        return {}
      }

      return {
        completedFrom: startOfDay(customDateRange.from),
        // DayPicker's range is inclusive; the server contract is exclusive at the upper bound.
        completedBefore: addDays(
          startOfDay(customDateRange.to),
          NEXT_LOCAL_DAY_OFFSET_DAYS,
        ),
      }
    })
    .exhaustive()
}
