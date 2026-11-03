/**
 * Small pure helpers shared by the category merge, receipt and Sync details modules (#216 D4).
 *
 * Everything here mutates or reads an {@link OfflineWorkspace} the caller already cloned inside a
 * disk transaction; nothing touches I/O, time or randomness except through the passed context.
 *
 * @module categoryState
 */
import { CategoryColorSchema } from '@corelive/desktop-contract/category'
import {
  type CategoryField,
  type CategoryOperation,
} from '@corelive/desktop-contract/category-sync'
import { normalizeCategoryName } from '@corelive/desktop-contract/category-validator'
import {
  SYNC_HISTORY_LIMIT,
  type AccountBinding,
  type CategoryOutboxEntry,
  type LocalCategory,
  type OfflineCompletion,
  type OfflineWorkspace,
  type SyncHistoryItem,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { getDraftInputLimit } from '../../renderer/editor/draftInputLimit'

export type BaseEntry = AccountBinding['base'][string]
export type DeclinedMarker = AccountBinding['declined'][string][string]

/** Time and identity sources injected by the caller so reducers stay deterministic in tests. */
export interface CategoryContext {
  now: number
  nextId: () => string
  /** Archived never-uploaded keeps; they count as sendable work for C22. */
  archivedUnsent?: ReadonlyMap<string, OfflineCompletion>
}

/** Categories that take part in the sync rules: not server-removed, not migration placeholders. */
export function liveCategories(state: OfflineWorkspace): LocalCategory[] {
  return state.categories.filter(
    (category) => !category.removed && !category.historical,
  )
}

/**
 * Reads one syncable field of a local category as a comparable string.
 *
 * @param category - The local category.
 * @param field - `name`, `color` or `parentLocalId`.
 * @returns The value; the parent is the local parent id or null.
 * @example fieldValue(category, 'color') // 'blue'
 */
export function fieldValue(
  category: LocalCategory,
  field: CategoryField,
): string | null {
  if (field === 'name') return category.name
  if (field === 'color') return category.color
  return category.parentId
}

/**
 * Writes one syncable field of a local category without bumping its revision (server/revert writes).
 *
 * @param category - The local category to mutate.
 * @param field - The field to set.
 * @param value - The new value (a color name, a name or a parent id).
 * @example setFieldValue(category, 'name', 'Work')
 */
export function setFieldValue(
  category: LocalCategory,
  field: CategoryField,
  value: string | null,
): void {
  if (field === 'name' && value !== null) category.name = value
  else if (field === 'color' && value !== null)
    category.color = CategoryColorSchema.parse(value)
  else if (field === 'parentLocalId') category.parentId = value
}

/** Reads a field from a `base` entry. */
export function baseFieldValue(
  entry: BaseEntry,
  field: CategoryField,
): string | null {
  if (field === 'name') return entry.name
  if (field === 'color') return entry.color
  return entry.parentLocalId
}

/** Writes a field into a `base` entry. */
export function setBaseFieldValue(
  entry: BaseEntry,
  field: CategoryField,
  value: string | null,
): void {
  if (field === 'name' && value !== null) entry.name = value
  else if (field === 'color' && value !== null)
    entry.color = CategoryColorSchema.parse(value)
  else if (field === 'parentLocalId') entry.parentLocalId = value
}

/**
 * Follows `categoryMoves` to the surviving category (EA11c).
 *
 * @param moves - Local source id to local destination id.
 * @param id - The category to resolve.
 * @returns The final id; `ok: false` when the chain loops or exceeds 1,000 hops.
 * @example resolveMove({ a: 'b', b: 'c' }, 'a') // { id: 'c', ok: true }
 */
export function resolveMove(
  moves: Record<string, string>,
  id: string,
): { id: string; ok: boolean } {
  const visited = new Set<string>()
  let current = id
  for (let hop = 0; hop < 1000; hop++) {
    const next = moves[current]
    if (next === undefined) return { id: current, ok: true }
    if (visited.has(current)) return { id: current, ok: false }
    visited.add(current)
    current = next
  }
  return { id: current, ok: false }
}

/** The server-id to local-id reverse map of the binding. */
export function serverToLocalMap(binding: AccountBinding): Map<number, string> {
  return new Map(
    Object.entries(binding.serverCategoryIds).map(
      ([localId, serverId]) => [serverId, localId] as const,
    ),
  )
}

/**
 * Display path of a category (`Parent / Child`), falling back to the last server state for a
 * category that is gone locally.
 *
 * @example pathOf(state, id) // 'Work / Reading'
 */
export function pathOf(state: OfflineWorkspace, id: string | null): string {
  if (id === null) return 'Top level'
  const category = state.categories.find((entry) => entry.id === id)
  if (category) {
    const parent = category.parentId
      ? state.categories.find((entry) => entry.id === category.parentId)
      : undefined
    return parent ? `${parent.name} / ${category.name}` : category.name
  }
  const base = state.binding?.base[id]
  if (!base) return 'Deleted category'
  const parentBase = base.parentLocalId
    ? (state.categories.find((entry) => entry.id === base.parentLocalId)
        ?.name ?? state.binding?.base[base.parentLocalId]?.name)
    : undefined
  return parentBase ? `${parentBase} / ${base.name}` : base.name
}

/** Display text of a field value: colors as names, parents as full paths. */
export function displayValue(
  state: OfflineWorkspace,
  field: string,
  value: string | null,
): string | null {
  if (field === 'parentLocalId') return pathOf(state, value)
  if (field === 'delete') return value === null ? null : pathOf(state, value)
  return value
}

/** Reads the declined marker of one field. */
export function getMarker(
  binding: AccountBinding,
  localId: string,
  field: string,
): DeclinedMarker | undefined {
  return binding.declined[localId]?.[field]
}

/** Records a declined marker (C18/EA8). */
export function setMarker(
  binding: AccountBinding,
  localId: string,
  field: string,
  marker: DeclinedMarker,
): void {
  binding.declined[localId] = { ...binding.declined[localId], [field]: marker }
}

/** Clears one declined marker; removes the category's record when it is empty. */
export function clearMarker(
  binding: AccountBinding,
  localId: string,
  field: string,
): void {
  const fields = binding.declined[localId]
  if (!fields) return
  delete fields[field]
  if (!Object.keys(fields).length) delete binding.declined[localId]
}

/** Removes a category from the binding entirely (server id, base and markers). */
export function dropBinding(binding: AccountBinding, localId: string): void {
  delete binding.serverCategoryIds[localId]
  delete binding.base[localId]
  delete binding.declined[localId]
}

/**
 * Prepends a Sync details History item and keeps the latest 50 (DA7).
 *
 * @example pushHistory(state, ctx, { kind: 'resolved', categoryPath: 'Work', field: 'name', macValue: 'A', dashboardValue: 'B' })
 */
export function pushHistory(
  state: OfflineWorkspace,
  context: CategoryContext,
  item: Omit<SyncHistoryItem, 'id' | 'at'>,
): void {
  state.syncHistory = [
    { ...item, id: context.nextId(), at: context.now },
    ...state.syncHistory,
  ].slice(0, SYNC_HISTORY_LIMIT)
}

/** The ids of every local category an operation mentions (own, parent, destination, set items). */
export function operationLocalIds(operation: CategoryOperation): string[] {
  switch (operation.type) {
    case 'create':
      return [operation.localId, operation.parentLocalId].filter(
        (id): id is string => id !== null,
      )
    case 'rename':
    case 'recolor':
      return [operation.localId]
    case 'reparent':
      return [
        operation.localId,
        operation.parentLocalId,
        operation.expected.parentLocalId,
      ].filter((id): id is string => id !== null)
    case 'delete':
      return [operation.localId, operation.destinationLocalId]
    case 'renameSet':
      return operation.items.map((item) => item.localId)
  }
}

/** The declined-marker field an operation belongs to (`create`/`delete` have their own keys). */
export function operationField(operation: CategoryOperation): string {
  switch (operation.type) {
    case 'create':
      return 'create'
    case 'rename':
      return 'name'
    case 'recolor':
      return 'color'
    case 'reparent':
      return 'parentLocalId'
    case 'delete':
      return 'delete'
    case 'renameSet':
      return 'name'
  }
}

/** The local category an operation's marker hangs on. */
export function operationMarkerId(operation: CategoryOperation): string {
  return operation.type === 'renameSet'
    ? operation.items[0]!.localId
    : operation.localId
}

/** JSON with object keys sorted, so a schema-parsed operation and a derived one compare equal. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

/** Stable identity of an operation ignoring its `operationId`, so an unchanged derivation keeps its id. */
export function operationSignature(operation: CategoryOperation): string {
  if (operation.type === 'renameSet')
    return canonicalJson({
      type: 'renameSet',
      items: [...operation.items].sort((a, b) =>
        a.localId.localeCompare(b.localId),
      ),
    })
  const { operationId: _operationId, ...rest } = operation
  return canonicalJson(rest)
}

/** Comparison key of a create: the marker value for a declined create. */
export function createKey(category: LocalCategory): string {
  return `${normalizeCategoryName(category.name)}\u0000${category.color}\u0000${category.parentId ?? ''}`
}

/**
 * Re-targets local completions from a retired category (D4); unsent uploads are derived from them.
 *
 * The server already moved its records, so a completion that is known there only changes its
 * local category (and its remembered projection). Sent operations are untouched: the server's `category-removed` answer repairs them.
 *
 * @param state - Workspace being mutated.
 * @param source - The retired local category.
 * @param destination - Its local destination.
 * @example retargetCompletions(state, sourceId, destinationId)
 */
function retargetCompletions(
  state: OfflineWorkspace,
  source: string,
  destination: string,
): void {
  for (const completion of Object.values(state.completions)) {
    if (completion.categoryId !== source) continue
    completion.categoryId = destination
    if (completion.remote?.categoryId === source)
      completion.remote = { ...completion.remote, categoryId: destination }
  }
}

/**
 * Folds a category into another one: its writing is appended to the destination's draft, its
 * records re-target, children move up and `categoryMoves` remembers the way (no writing is lost).
 *
 * Used when a second local category turns out to be the same dashboard category (an adopted
 * `create` that hits an already-bound id) and for server deletions without recovery needs.
 *
 * @param state - Workspace being mutated.
 * @param source - The local category to remove.
 * @param destination - The surviving local category.
 * @param nextId - Id source for the separator row.
 * @example retireIntoCategory(state, duplicateId, survivorId, nextId)
 */
export function retireIntoCategory(
  state: OfflineWorkspace,
  source: string,
  destination: string,
  nextId: () => string,
): void {
  const from = state.drafts[source]
  const to = state.drafts[destination]
  if (from && to && from.rows.some((row) => row.text.length > 0)) {
    to.inputLimit = Math.max(getDraftInputLimit(to), getDraftInputLimit(from))
    if (to.rows.some((row) => row.text.length > 0))
      to.rows.push({ id: nextId(), text: '' })
    else to.rows = []
    to.rows.push(...from.rows)
    to.revision++
  }
  const survivor = state.categories.find((c) => c.id === destination)
  for (const child of state.categories)
    if (child.parentId === source)
      child.parentId = survivor?.parentId === null ? destination : null
  state.categoryMoves[source] = destination
  delete state.drafts[source]
  state.categories = state.categories.filter((c) => c.id !== source)
  if (state.selectedCategoryId === source)
    state.selectedCategoryId = destination
  retargetCompletions(state, source, destination)
}

/** Whether an outbox entry mentions the local category. */
export function entryTouches(
  entry: CategoryOutboxEntry,
  localId: string,
): boolean {
  const operation = entry.operation
  if (operation.type === 'renameSet')
    return operation.items.some((item) => item.localId === localId)
  return (
    operation.localId === localId ||
    (operation.type === 'create' && operation.parentLocalId === localId) ||
    (operation.type === 'delete' && operation.destinationLocalId === localId) ||
    (operation.type === 'reparent' && operation.parentLocalId === localId)
  )
}

/** Removes queued/blocked/parked operations that mention a vanished category; sent ones stay for their receipt. */
export function dropCategoryOperations(
  state: OfflineWorkspace,
  localId: string,
): void {
  for (const [id, entry] of Object.entries(state.categoryOutbox))
    if (entry.state !== 'sent' && entryTouches(entry, localId))
      delete state.categoryOutbox[id]
}
