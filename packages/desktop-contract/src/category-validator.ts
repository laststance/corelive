/**
 * The ONE shared category validator (#216 C33).
 *
 * C16 (default category invariants), C17 (name-path uniqueness and the two-level
 * hierarchy), EA8 (a delete may not promote a child onto an existing root name) and
 * EA11a (NFC normalization before trim and compare) live here as pure functions so
 * the desktop main process and the server `category.ts` paths cannot drift apart.
 * Ids are generic: the desktop validates local UUIDs, the server validates numbers.
 *
 * @module category-validator
 */

/** Longest category name the server accepts (`CategorySchema.name`). */
export const CATEGORY_NAME_MAX_LENGTH = 30

/** Stable refusal reasons; the desktop shows DA8 copy for them and queues nothing. */
export type CategoryRefusal =
  | 'default-locked'
  | 'name-taken-local'
  | 'invalid-parent'
  | 'invalid-name'
  | 'invalid-destination'
  | 'not-found'

/** The slice of a category the rules depend on. */
export interface ValidatedCategory<Id extends string | number> {
  id: Id
  name: string
  isDefault: boolean
  parentId: Id | null
  /** A server-removed category that only keeps writing alive; it never takes part in the rules. */
  removed?: boolean
  /** A migrated placeholder that is never created on the server; it never takes part in the rules. */
  historical?: boolean
}

/** One local edit to judge before anything is queued. */
export type CategoryAction<Id extends string | number> =
  | { type: 'create'; name: string; parentId: Id | null }
  | { type: 'rename'; id: Id; name: string }
  | { type: 'recolor'; id: Id }
  | { type: 'reparent'; id: Id; parentId: Id | null }
  | { type: 'delete'; id: Id; destinationId: Id }

/** Verdict of {@link validateCategoryAction}. `name` is the normalized name to store. */
export type CategoryVerdict =
  | { ok: true; name?: string }
  | { ok: false; reason: CategoryRefusal; childName?: string }

/**
 * Normalizes a category name the way both sides compare it: NFC first, then trim (EA11a).
 *
 * @param name - Raw user input.
 * @returns The NFC-normalized, trimmed name.
 * @example
 * ```ts
 * normalizeCategoryName(' Café ') // 'Café'
 * ```
 */
export function normalizeCategoryName(name: string): string {
  return name.normalize('NFC').trim()
}

/**
 * Judges one local category edit against the whole current set.
 *
 * Called by the desktop category commands before queueing (step 3/4) and by the
 * server create/update/delete paths (step 4). Matching is exact and case-sensitive,
 * like the server's unique indexes.
 *
 * @param categories - Every category currently known to the caller.
 * @param action - The edit under consideration.
 * @returns `{ ok: true }` (with the normalized name for create/rename) or a refusal.
 * @example
 * ```ts
 * validateCategoryAction(categories, { type: 'rename', id, name: 'Work' })
 * ```
 */
export function validateCategoryAction<Id extends string | number>(
  categories: readonly ValidatedCategory<Id>[],
  action: CategoryAction<Id>,
): CategoryVerdict {
  const live = categories.filter((c) => !c.removed && !c.historical)
  const byId = new Map(live.map((c) => [c.id, c]))

  if (action.type === 'create') {
    return judgeNewPlacement(live, byId, null, action.name, action.parentId)
  }
  const target = byId.get(action.id)
  if (!target) return { ok: false, reason: 'not-found' }

  switch (action.type) {
    case 'recolor':
      // The default's color is editable, exactly as on the server.
      return { ok: true }
    case 'rename':
      if (target.isDefault) return { ok: false, reason: 'default-locked' }
      return judgeNewPlacement(live, byId, target, action.name, target.parentId)
    case 'reparent':
      if (target.isDefault) return { ok: false, reason: 'default-locked' }
      return judgeNewPlacement(live, byId, target, target.name, action.parentId)
    case 'delete':
      return judgeDelete(live, byId, target, action.destinationId)
  }
}

/**
 * Finds every violation in a complete category set (EA5 whole-set validity).
 *
 * Runs after each merge so a desired local value that would collide with an applied
 * server value is caught even though each single edit looked valid.
 *
 * @param categories - The merged set to check.
 * @returns Offending category ids with their reasons; empty when the set is valid.
 * @example
 * ```ts
 * validateCategorySet(merged) // [{ id: 'b', reason: 'name-taken-local' }]
 * ```
 */
export function validateCategorySet<Id extends string | number>(
  categories: readonly ValidatedCategory<Id>[],
): { id: Id; reason: CategoryRefusal }[] {
  const live = categories.filter((c) => !c.removed && !c.historical)
  const byId = new Map(live.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const problems: { id: Id; reason: CategoryRefusal }[] = []
  for (const category of live) {
    const parent =
      category.parentId === null ? null : byId.get(category.parentId)
    if (category.parentId !== null && (!parent || parent.parentId !== null))
      problems.push({ id: category.id, reason: 'invalid-parent' })
    else if (category.isDefault && category.parentId !== null)
      problems.push({ id: category.id, reason: 'default-locked' })
    const key = `${String(category.parentId)}\u0000${normalizeCategoryName(category.name)}`
    if (seen.has(key))
      problems.push({ id: category.id, reason: 'name-taken-local' })
    seen.add(key)
  }
  return problems
}

/** Judges a create, rename or reparent: name length, sibling uniqueness and hierarchy. */
function judgeNewPlacement<Id extends string | number>(
  live: readonly ValidatedCategory<Id>[],
  byId: Map<Id, ValidatedCategory<Id>>,
  target: ValidatedCategory<Id> | null,
  rawName: string,
  parentId: Id | null,
): CategoryVerdict {
  const name = normalizeCategoryName(rawName)
  if (name.length < 1 || name.length > CATEGORY_NAME_MAX_LENGTH)
    return { ok: false, reason: 'invalid-name' }

  if (parentId !== null) {
    const parent = byId.get(parentId)
    // A parent must exist, may not be the category itself, and must be a root (two levels).
    if (!parent || parent.id === target?.id || parent.parentId !== null)
      return { ok: false, reason: 'invalid-parent' }
    // A root that already has children cannot become a child.
    if (target && live.some((c) => c.parentId === target.id))
      return { ok: false, reason: 'invalid-parent' }
  }

  const taken = live.some(
    (c) =>
      c.id !== target?.id &&
      c.parentId === parentId &&
      normalizeCategoryName(c.name) === name,
  )
  if (taken) return { ok: false, reason: 'name-taken-local' }
  return { ok: true, name }
}

/** Judges a delete: default lock, destination, and the EA8 child-promotion collision. */
function judgeDelete<Id extends string | number>(
  live: readonly ValidatedCategory<Id>[],
  byId: Map<Id, ValidatedCategory<Id>>,
  target: ValidatedCategory<Id>,
  destinationId: Id,
): CategoryVerdict {
  if (target.isDefault) return { ok: false, reason: 'default-locked' }
  if (destinationId === target.id || !byId.has(destinationId))
    return { ok: false, reason: 'invalid-destination' }

  // Children are promoted to roots, so each must stay unique among the remaining roots.
  const rootNames = new Set(
    live
      .filter((c) => c.parentId === null && c.id !== target.id)
      .map((c) => normalizeCategoryName(c.name)),
  )
  for (const child of live.filter((c) => c.parentId === target.id)) {
    const childName = normalizeCategoryName(child.name)
    if (rootNames.has(childName))
      return { ok: false, reason: 'name-taken-local', childName: child.name }
    rootNames.add(childName)
  }
  return { ok: true }
}
