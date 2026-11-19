import type { ActivityCardInput } from '@corelive/desktop-contract/ipc'

import { compareCategoryTotals } from './compareCategoryTotals'

/** Account day totals use the same current category hierarchy as the dashboard. */
export type HeatmapCategory = {
  id: number
  name: string
  color: string
  count: number
  /** Current hierarchy, also returned for historical completions. */
  parent?: { id: number; name: string; color: string } | null
}

/** A root's period total; child detail exists only when that period includes child entries. */
export type RootCategoryTotal = Pick<
  HeatmapCategory,
  'id' | 'name' | 'color' | 'count'
> & {
  directCount?: number
  children?: Array<Pick<HeatmapCategory, 'id' | 'name' | 'color' | 'count'>>
}

/**
 * Groups period category counts under their current parent for retrospective callers.
 *
 * @param categories - Direct counts for any days inside the caller's reporting period.
 * @returns Root totals, ranked with the same tie rules as the existing summaries.
 * @example
 * const roots = rollupCategoryTotals(day.categories)
 */
export function rollupCategoryTotals(
  categories: readonly HeatmapCategory[],
): RootCategoryTotal[] {
  const roots = new Map<number, RootCategoryTotal>()
  // Each direct count contributes once to its root, including repeated daily category rows.
  for (const category of categories) {
    const root = category.parent ?? category
    let total = roots.get(root.id)
    if (!total) {
      total = { id: root.id, name: root.name, color: root.color, count: 0 }
      roots.set(root.id, total)
    }
    total.count += category.count
    // Roots without contributing children retain the original flat-summary shape.
    if (!category.parent) {
      if (total.children)
        total.directCount = (total.directCount ?? 0) + category.count
      continue
    }
    if (!total.children) {
      total.directCount = total.count - category.count
      total.children = []
    }
    const child = total.children.find((entry) => entry.id === category.id)
    if (child) child.count += category.count
    else
      total.children.push({
        id: category.id,
        name: category.name,
        color: category.color,
        count: category.count,
      })
  }
  // Child ordering uses the same factual count/name rule as root totals.
  for (const total of roots.values())
    total.children?.sort(compareCategoryTotals)
  return Array.from(roots.values()).sort(compareCategoryTotals)
}

type DayEntry = { category: Omit<HeatmapCategory, 'count'> | null }

/**
 * Counts direct and nested completions using the same current roots on both surfaces.
 * The dashboard also uses this result for its day-detail breakdown.
 * @example getDayCategoryTotals(day.tasks)
 */
export function getDayCategoryTotals(
  tasks: readonly DayEntry[],
): RootCategoryTotal[] {
  return rollupCategoryTotals(
    tasks.flatMap(({ category }) =>
      category ? [{ ...category, count: 1 }] : [],
    ),
  )
}

/**
 * Selects the authorized account day that can produce a shareable card.
 * The dashboard and Mac export reject missing, empty, partial and stale query responses.
 * @example const input = getActivityCardInput('2026-05-12', day)
 */
export function getActivityCardInput(
  selectedDay: string,
  detail:
    { date: string; count: number; tasks: readonly DayEntry[] } | undefined,
): ActivityCardInput | null {
  if (
    !detail ||
    detail.date !== selectedDay ||
    detail.count < 1 ||
    detail.count !== detail.tasks.length
  )
    return null
  return {
    isoDate: selectedDay,
    totalCompleted: detail.count,
    topCategoryName: getDayCategoryTotals(detail.tasks)[0]?.name ?? null,
  }
}
