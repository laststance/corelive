export {
  rollupCategoryTotals,
  type RootCategoryTotal,
} from '@corelive/live-editor/activity-card'

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
