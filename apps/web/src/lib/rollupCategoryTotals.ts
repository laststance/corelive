import type { HeatmapCategory } from '@/hooks/useHeatmapData'

import { compareCategoryTotals } from './compareCategoryTotals'

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

/**
 * Resolves an entry's current category path for journal and day-detail rows.
 *
 * @param category - Category metadata supplied with the completion response.
 * @returns Main name or the complete parent/child path.
 * @example
 * getCompletionCategoryPath({ name: 'CoreLive', parent: { name: 'Work' } })
 */
export function getCompletionCategoryPath(category: {
  name: string
  parent?: { name: string } | null
}): string {
  return category.parent
    ? `${category.parent.name} / ${category.name}`
    : category.name
}
