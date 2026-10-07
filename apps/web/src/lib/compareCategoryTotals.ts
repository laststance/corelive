/** Orders weekly and yearly category totals by count, then a stable English name tie-break.
 * @param first - First category total.
 * @param second - Second category total.
 * @returns A sort comparison with the most frequent category first.
 * @example totals.sort(compareCategoryTotals)
 */
export function compareCategoryTotals(
  first: { count: number; name: string },
  second: { count: number; name: string },
): number {
  if (second.count !== first.count) return second.count - first.count
  return first.name.localeCompare(second.name, 'en')
}
