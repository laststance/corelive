/**
 * The quiet clear-completed affirmation — one short praise phrase appended to the
 * count, surfaced as a toast when the user clears their completed list (D9 /
 * DESIGN.md "Voice & Microcopy": the product talks like a quiet companion, never a
 * coach). Returns null at 0 so an empty clear stays silent, and never gamifies.
 * @param count - How many completed todos were just cleared (archived, not lost —
 *   the heatmap keeps the day).
 * @returns
 * - the affirmation string when count ≥ 1 (singular "thing" at exactly 1)
 * - null when count ≤ 0 (no affirmation — say nothing rather than "0 things done")
 * @example
 * clearedAffirmation(8) // => '8 things done — good day'
 * clearedAffirmation(1) // => '1 thing done — good day'
 * clearedAffirmation(0) // => null
 */
export function clearedAffirmation(count: number): string | null {
  if (count <= 0) return null
  // Singular noun at exactly one so the praise never reads "1 things done".
  const noun = count === 1 ? 'thing' : 'things'
  return `${count} ${noun} done — good day`
}
