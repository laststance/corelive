import type { Category } from '@/server/schemas/category'

type HierarchyCategory = Pick<Category, 'id' | 'name'> & {
  parentId?: number | null
  createdAt?: Date | string
}

/**
 * Projects a flat category list into deterministic parent-first rows for category controls.
 *
 * @param categories - Current authoritative rows; missing parents remain visible as roots.
 * @returns Ordered rows, ID lookup, and display paths without parsing user-entered slashes.
 * @example
 * const { ordered, paths } = createCategoryHierarchy(categories)
 * paths.get(12) // 'Work / CoreLive'
 */
export function createCategoryHierarchy<T extends HierarchyCategory>(
  categories: readonly T[],
) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const sorted = [...categories].sort(
    (left, right) =>
      (left.createdAt === undefined || right.createdAt === undefined
        ? categories.indexOf(left) - categories.indexOf(right)
        : new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime()) || left.id - right.id,
  )
  const children = new Map<number, T[]>()
  const roots: T[] = []
  const paths = new Map<number, string>()
  // Orphans stay reachable while category queries reconcile an external mutation.
  for (const category of sorted) {
    const parent = category.parentId ? byId.get(category.parentId) : undefined
    paths.set(
      category.id,
      parent ? `${parent.name} / ${category.name}` : category.name,
    )
    if (parent) {
      const siblings = children.get(parent.id) ?? []
      siblings.push(category)
      children.set(parent.id, siblings)
    } else {
      roots.push(category)
    }
  }
  return {
    ordered: roots.flatMap((category) => [
      category,
      ...(children.get(category.id) ?? []),
    ]),
    byId,
    paths,
  }
}

/**
 * Finds a display path for a category when a row or selection needs its parent context.
 *
 * @returns The original parent and child spelling, or the root name when no parent exists.
 * @example
 * getCategoryPath(coreLive, categories) // 'Work / CoreLive'
 */
export function getCategoryPath<T extends HierarchyCategory>(
  category: T,
  categories: readonly T[],
): string {
  const parent = categories.find(
    (candidate) => candidate.id === category.parentId,
  )
  return parent ? `${parent.name} / ${category.name}` : category.name
}

/**
 * Searches displayed paths without cmdk ranking away the category hierarchy.
 *
 * @param query - Every NFKC-normalized whitespace-separated token must match the path.
 * @returns Parent-first matches; normalization never changes the stored names.
 * @example
 * searchCategoryHierarchy(categories, 'ＷＯＲＫ client').map(row => row.name) // ['Client work']
 */
export function searchCategoryHierarchy<T extends HierarchyCategory>(
  categories: readonly T[],
  query: string,
): T[] {
  const hierarchy = createCategoryHierarchy(categories)
  const tokens = query
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  return hierarchy.ordered.filter((category) => {
    const path = (hierarchy.paths.get(category.id) ?? category.name)
      .normalize('NFKC')
      .toLowerCase()
    return tokens.every((token) => path.includes(token))
  })
}
