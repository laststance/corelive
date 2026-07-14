import { addDays, startOfDay } from 'date-fns'

import { NEXT_LOCAL_DAY_OFFSET_DAYS } from '@/lib/constants/date'

/**
 * Calculates the DST-safe timeout used by the local-day store whenever it schedules its next midnight notification.
 * @param now - Current local instant, injectable for deterministic tests.
 * @returns Milliseconds from `now` until the next local calendar day begins.
 * @example
 * getMillisecondsUntilNextLocalDay(new Date(2026, 6, 14, 23, 59, 59, 500)) // => 500
 */
export function getMillisecondsUntilNextLocalDay(now = new Date()): number {
  const nextLocalDay = addDays(startOfDay(now), NEXT_LOCAL_DAY_OFFSET_DAYS)
  return nextLocalDay.getTime() - now.getTime()
}
