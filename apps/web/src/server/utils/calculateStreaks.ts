/**
 * Calculates current and longest consecutive-day streaks from a list of date
 * strings. Pure on its inputs: `today`/`yesterday` are supplied by the caller
 * (the local-day keys from getHeatmap) rather than derived from `new Date()`
 * here, so the "is the streak still alive?" check honors the user's timezone
 * AND the function stays deterministically testable.
 *
 * @param dates - Date strings in "YYYY-MM-DD" format (any order; de-duped here)
 * @param today - The caller's "today" as a YYYY-MM-DD local-day key
 * @param yesterday - The caller's "yesterday" as a YYYY-MM-DD local-day key
 * @returns
 * - current: Number of consecutive days ending today (or yesterday — grace)
 * - longest: Maximum consecutive-day streak in the dataset
 * @example
 * calculateStreaks(["2026-03-22", "2026-03-23", "2026-03-24"], "2026-03-24", "2026-03-23")
 * // => { current: 3, longest: 3 }
 * @example
 * // last activity older than yesterday → current streak is broken
 * calculateStreaks(["2026-03-20"], "2026-03-24", "2026-03-23")
 * // => { current: 0, longest: 1 }
 */
export function calculateStreaks(
  dates: string[],
  today: string,
  yesterday: string,
): {
  current: number
  longest: number
} {
  if (dates.length === 0) return { current: 0, longest: 0 }

  const uniqueDates = [...new Set(dates)].sort()

  let longest = 1
  let currentStreak = 1
  let tempStreak = 1

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]!)
    const curr = new Date(uniqueDates[i]!)
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000

    if (diffDays === 1) {
      tempStreak++
      longest = Math.max(longest, tempStreak)
    } else {
      tempStreak = 1
    }
  }

  // Calculate current streak (must include today or yesterday)
  const lastDate = uniqueDates[uniqueDates.length - 1]!
  if (lastDate !== today && lastDate !== yesterday) {
    currentStreak = 0
  } else {
    currentStreak = 1
    for (let i = uniqueDates.length - 2; i >= 0; i--) {
      const curr = new Date(uniqueDates[i + 1]!)
      const prev = new Date(uniqueDates[i]!)
      const diffDays = (curr.getTime() - prev.getTime()) / 86400000

      if (diffDays === 1) {
        currentStreak++
      } else {
        break
      }
    }
  }

  return { current: currentStreak, longest: Math.max(longest, currentStreak) }
}
