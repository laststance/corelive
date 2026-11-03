/**
 * The pure three-way category merge (#216 D4, C19) — the single owner of category state.
 *
 * It is the only producer of category operations. Run inside the storage worker's disk
 * transaction on a cloned workspace, it:
 *
 * 1. binds the server's categories to local ones (existing binding, else name path; the local
 *    default pairs with the server `isDefault`) and adds server-only categories (D4 table);
 * 2. mirrors server deletions with the recorded destination chain (EA11c guards);
 * 3. applies one-sided server changes and turns two-sided ones into declined rows (C18);
 * 4. validates the whole merged set with the shared validator (EA5);
 * 5. re-derives every not-yet-sent operation (create, rename/EA7 renameSet, recolor, reparent,
 *    delete) and replaces the queued set, keeping unchanged operations' ids.
 *
 * @module categoryMerge
 */
import {
  CATEGORY_FIELDS,
  type CategoryField,
  type CategoryOperation,
} from '@corelive/desktop-contract/category-sync'
import {
  normalizeCategoryName,
  validateCategorySet,
} from '@corelive/desktop-contract/category-validator'
import type { EditorCategory } from '@corelive/desktop-contract/offline-workspace'
import type {
  AccountBinding,
  CategoryOutboxEntry,
  LocalCategory,
  OfflineWorkspace,
} from '@corelive/desktop-contract/offline-workspace-v2'

import {
  baseFieldValue,
  clearMarker,
  createKey,
  dropBinding,
  dropCategoryOperations,
  entryTouches,
  fieldValue,
  getMarker,
  liveCategories,
  operationField,
  operationMarkerId,
  operationSignature,
  pathOf,
  pushHistory,
  resolveMove,
  retireIntoCategory,
  serverToLocalMap,
  setBaseFieldValue,
  setFieldValue,
  setMarker,
  type CategoryContext,
} from './categoryState'

/** What the server told the desktop about one account's categories. */
export interface CategoryMergeInput {
  accountId: string
  displayEmail: string | null
  categories: EditorCategory[]
  deletions: { sourceId: number; destinationId: number }[]
}

/** Hop bound of the deletion chain walk (EA11c). */
const MAX_CHAIN_HOPS = 1000

/** Marker kinds that keep a locally-held value declined while both sides stay unchanged (C18, EA8). */
const SUPPRESSING_KINDS = new Set([
  'name-taken',
  'digest-mismatch',
  'delete-blocked',
  'parked',
])

/**
 * Whether any category operation is in flight or uncertain; the merge waits for receipts (C19).
 *
 * @param state - Workspace to inspect.
 * @returns True when a `sent` category operation exists.
 * @example if (hasUncertainCategoryOperation(state)) return
 */
function hasUncertainCategoryOperation(state: OfflineWorkspace): boolean {
  return Object.values(state.categoryOutbox).some(
    (entry) => entry.state === 'sent',
  )
}

/**
 * Runs the whole merge against the server's current list (see module doc).
 *
 * @param state - A clone of the workspace; mutated in place.
 * @param input - The verified account and the server's categories and deletions.
 * @param context - Clock and id source.
 * @returns False when it deferred because an operation is still uncertain (nothing changed).
 * @throws {@link WorkspaceCommandError} never; refusals become declined rows.
 * @example
 * ```ts
 * const merged = mergeCategories(clone, { accountId, displayEmail, categories, deletions }, ctx)
 * ```
 */
export function mergeCategories(
  state: OfflineWorkspace,
  input: CategoryMergeInput,
  context: CategoryContext,
): boolean {
  // C19: in-flight / uncertain operations settle by receipts first.
  if (hasUncertainCategoryOperation(state)) return false
  const binding = (state.binding ??= {
    accountId: input.accountId,
    displayEmail: input.displayEmail,
    serverCategoryIds: {},
    base: {},
    declined: {},
    deletionReceipts: {},
    lastSyncedAt: null,
  })
  if (input.displayEmail) binding.displayEmail = input.displayEmail
  const serverLive = input.categories.filter((category) => !category.removed)
  const serverById = new Map(
    serverLive.map((category) => [category.id, category]),
  )

  bindServerCategories(state, binding, serverLive, context)
  mirrorServerDeletions(state, binding, serverById, input.deletions, context)
  syncFields(state, binding, serverById)
  validateMergedSet(state, binding)
  deriveOperations(state, binding, serverById, context)
  return true
}

/**
 * Pairs unbound local categories with server ones and adds server-only categories (D4 table).
 *
 * @example bindServerCategories(state, binding, serverLive, ctx)
 */
function bindServerCategories(
  state: OfflineWorkspace,
  binding: AccountBinding,
  serverLive: EditorCategory[],
  context: CategoryContext,
): void {
  const ordered = [
    ...serverLive.filter((category) => category.parentId === null),
    ...serverLive.filter((category) => category.parentId !== null),
  ]
  const serverToLocal = serverToLocalMap(binding)
  for (const server of ordered) {
    if (serverToLocal.has(server.id)) continue
    const parentLocal =
      server.parentId === null
        ? null
        : (serverToLocal.get(server.parentId) ?? null)
    // An existing unbound local category with the same name path (or the default pair) binds.
    const match = liveCategories(state).find(
      (category) =>
        binding.serverCategoryIds[category.id] === undefined &&
        (server.isDefault
          ? category.isDefault
          : !category.isDefault &&
            category.parentId === parentLocal &&
            normalizeCategoryName(category.name) ===
              normalizeCategoryName(server.name)),
    )
    let localId: string
    if (match) {
      localId = match.id
      if (server.isDefault) {
        // The default's name and place are fixed; the pairing adopts the server's.
        match.name = server.name
        match.parentId = null
      }
    } else {
      localId = context.nextId()
      state.categories.push({
        id: localId,
        name: server.name,
        color: server.color,
        isDefault: server.isDefault,
        parentId: parentLocal,
        removed: false,
        historical: false,
        fieldRevisions: { name: 0, color: 0, parentLocalId: 0 },
      })
      state.drafts[localId] ??= {
        revision: 0,
        rows: [{ id: context.nextId(), text: '' }],
      }
    }
    binding.serverCategoryIds[localId] = server.id
    binding.base[localId] = {
      name: server.name,
      color: server.color,
      parentLocalId: parentLocal,
    }
    serverToLocal.set(server.id, localId)
  }
}

/**
 * Mirrors categories the server (web or another Mac) deleted, using the recorded destination chain.
 *
 * Children become roots. A category with no draft text and no pending operation is removed and
 * `categoryMoves` records the destination; otherwise it stays as a `removed` recovery entry with
 * the server-recorded destination as the suggestion (10-21 flow). An unknown destination falls
 * back to the default category with a History entry (never a silent drop).
 *
 * @example mirrorServerDeletions(state, binding, serverById, deletions, ctx)
 */
function mirrorServerDeletions(
  state: OfflineWorkspace,
  binding: AccountBinding,
  serverById: Map<number, EditorCategory>,
  deletions: { sourceId: number; destinationId: number }[],
  context: CategoryContext,
): void {
  const next = new Map(
    deletions.map((entry) => [entry.sourceId, entry.destinationId] as const),
  )
  const serverToLocal = serverToLocalMap(binding)
  for (const [localId, serverId] of Object.entries(binding.serverCategoryIds)) {
    if (serverById.has(serverId)) continue
    const local = state.categories.find((category) => category.id === localId)
    if (!local) {
      // Deleted on both sides: the intent is satisfied.
      dropCategoryOperations(state, localId)
      dropBinding(binding, localId)
      continue
    }
    const chain = walkDeletionChain(serverId, next, serverById, serverToLocal)
    let destination = chain.local
    if (!destination) {
      destination = state.categories.find(
        (category) => category.isDefault && !category.removed,
      )?.id
      pushHistory(state, context, {
        kind: chain.cyclic
          ? 'server-delete-cycle'
          : 'server-delete-unknown-destination',
        categoryPath: pathOf(state, localId),
        field: 'delete',
        macValue: null,
        dashboardValue: null,
      })
    }
    if (!destination || destination === localId) continue
    for (const child of state.categories)
      if (child.parentId === localId) {
        child.parentId = null
        const childBase = binding.base[child.id]
        if (childBase?.parentLocalId === localId) childBase.parentLocalId = null
      }
    const hasDraft = Boolean(
      state.drafts[localId]?.rows.some((row) => row.text.length > 0),
    )
    const hasPending =
      Object.values(state.categoryOutbox).some((entry) =>
        entryTouches(entry, localId),
      ) || Boolean(binding.declined[localId])
    dropCategoryOperations(state, localId)
    if (hasDraft || hasPending) {
      local.removed = true
      binding.deletionReceipts[localId] = destination
    } else {
      retireIntoCategory(state, localId, destination, context.nextId)
    }
    dropBinding(binding, localId)
  }
}

/**
 * Follows chained server deletions to a live, bound local category (EA11c visited-set + 1,000 hops).
 *
 * @returns The local destination, or `undefined` with `cyclic` set when the chain loops or is cut.
 * @example walkDeletionChain(7, next, serverById, serverToLocal)
 */
function walkDeletionChain(
  sourceServerId: number,
  next: Map<number, number>,
  serverById: Map<number, EditorCategory>,
  serverToLocal: Map<number, string>,
): { local?: string; cyclic: boolean } {
  const visited = new Set<number>([sourceServerId])
  let current = next.get(sourceServerId)
  for (let hop = 0; current !== undefined; hop++) {
    if (hop >= MAX_CHAIN_HOPS) return { cyclic: true }
    const local = serverById.has(current)
      ? serverToLocal.get(current)
      : undefined
    if (local) return { local, cyclic: false }
    if (visited.has(current)) return { cyclic: true }
    visited.add(current)
    current = next.get(current)
  }
  return { cyclic: false }
}

/**
 * Three-way sync of each bound pair's fields (D4 merge table).
 *
 * Server-only change: apply it. Both changed and different: the server value wins locally and a
 * `conflict` row keeps the Mac's value (no clocks). Local-only change: untouched here, derived later.
 *
 * @example syncFields(state, binding, serverById)
 */
function syncFields(
  state: OfflineWorkspace,
  binding: AccountBinding,
  serverById: Map<number, EditorCategory>,
): void {
  const serverToLocal = serverToLocalMap(binding)
  for (const [localId, serverId] of Object.entries(binding.serverCategoryIds)) {
    const local = state.categories.find((category) => category.id === localId)
    const server = serverById.get(serverId)
    if (!local || !server) continue
    const serverState = {
      name: server.name,
      color: server.color,
      parentLocalId:
        server.parentId === null
          ? null
          : (serverToLocal.get(server.parentId) ?? null),
    }
    const base = (binding.base[localId] ??= { ...serverState })
    for (const field of CATEGORY_FIELDS) {
      const serverValue = baseFieldValue(serverState, field)
      // A default category's name and place never change locally; adopt the server's.
      if (local.isDefault && field !== 'color') {
        setFieldValue(local, field, serverValue)
        setBaseFieldValue(base, field, serverValue)
        continue
      }
      syncField(binding, local, base, field, serverValue)
    }
  }
}

/** One field of {@link syncFields}. */
function syncField(
  binding: AccountBinding,
  local: LocalCategory,
  base: AccountBinding['base'][string],
  field: CategoryField,
  serverValue: string | null,
): void {
  const localValue = fieldValue(local, field)
  const baseValue = baseFieldValue(base, field)
  const marker = getMarker(binding, local.id, field)
  if (marker && SUPPRESSING_KINDS.has(marker.kind)) {
    // C18: declined while both sides still hold the values it was recorded with. A marker that
    // outlived a revert (local back on the server value) stays as a row; it goes stale only when
    // the dashboard's value moved on.
    if (serverValue !== marker.serverValue)
      clearMarker(binding, local.id, field)
    else if (localValue === marker.localValue) return
  }
  if (localValue === serverValue) {
    setBaseFieldValue(base, field, serverValue)
    return
  }
  if (localValue === baseValue) {
    // Only the server changed: take its value.
    setFieldValue(local, field, serverValue)
    setBaseFieldValue(base, field, serverValue)
    return
  }
  if (serverValue === baseValue) return // only this Mac changed: derived below
  // Both changed: the dashboard value is already visible there, so it wins; the Mac's is kept as a row.
  setMarker(binding, local.id, field, {
    kind: 'conflict',
    localValue,
    serverValue,
  })
  setFieldValue(local, field, serverValue)
  setBaseFieldValue(base, field, serverValue)
}

/**
 * EA5: after every merge the shared validator runs over the whole set. A desired local value
 * that now collides with an applied server value is not applied locally: the category shows the
 * server (base) value and the desired value becomes a "Choose another name" row.
 *
 * @example validateMergedSet(state, binding)
 */
function validateMergedSet(
  state: OfflineWorkspace,
  binding: AccountBinding,
): void {
  for (let pass = 0; pass < 8; pass++) {
    const set = liveCategories(state)
    const problems = validateCategorySet(set)
    if (!problems.length) return
    let changed = false
    for (const problem of problems) {
      const culprit = pickCulprit(set, binding, problem)
      if (!culprit) continue
      const base = binding.base[culprit.id]!
      const field: CategoryField =
        problem.reason === 'name-taken-local' && culprit.name !== base.name
          ? 'name'
          : 'parentLocalId'
      const desired = fieldValue(culprit, field)
      setMarker(binding, culprit.id, field, {
        kind:
          problem.reason === 'name-taken-local'
            ? 'name-taken'
            : 'invalid-parent',
        localValue: desired,
        serverValue: baseFieldValue(base, field),
      })
      setFieldValue(culprit, field, baseFieldValue(base, field))
      changed = true
    }
    if (!changed) return
  }
}

/** Picks the bound category with an unsent local change that causes the violation. */
function pickCulprit(
  set: LocalCategory[],
  binding: AccountBinding,
  problem: { id: string; reason: string },
): LocalCategory | undefined {
  const target = set.find((category) => category.id === problem.id)
  if (!target) return undefined
  const group =
    problem.reason === 'name-taken-local'
      ? set.filter(
          (category) =>
            category.parentId === target.parentId &&
            normalizeCategoryName(category.name) ===
              normalizeCategoryName(target.name),
        )
      : [target]
  return group.find((category) => {
    const base = binding.base[category.id]
    if (!base || binding.serverCategoryIds[category.id] === undefined)
      return false
    // A child promoted by this Mac's own pending delete is not a local edit to revert.
    const promoted =
      category.parentId === null &&
      base.parentLocalId !== null &&
      !set.some((entry) => entry.id === base.parentLocalId)
    const parentEdited = category.parentId !== base.parentLocalId && !promoted
    return problem.reason === 'name-taken-local'
      ? category.name !== base.name || parentEdited
      : parentEdited
  })
}

interface RenameCandidate {
  localId: string
  name: string
  expectedName: string
  parentKey: string
}

/**
 * Re-derives the not-yet-sent operations from local vs `base` and replaces the queued set (C19).
 *
 * Unchanged derivations keep their `operationId`; sent operations and still-declined parked ones
 * are kept as they are; everything else queued is replaced.
 *
 * @example deriveOperations(state, binding, serverById, ctx)
 */
function deriveOperations(
  state: OfflineWorkspace,
  binding: AccountBinding,
  serverById: Map<number, EditorCategory>,
  context: CategoryContext,
): void {
  const live = liveCategories(state)
  const bound = (id: string): boolean =>
    binding.serverCategoryIds[id] !== undefined
  const pendingDeleted = new Set(
    Object.entries(binding.serverCategoryIds)
      .filter(
        ([localId, serverId]) =>
          serverById.has(serverId) &&
          !state.categories.some((category) => category.id === localId),
      )
      .map(([localId]) => localId),
  )

  const creates: CategoryOperation[] = []
  const renames: RenameCandidate[] = []
  const recolors: CategoryOperation[] = []
  const reparents: CategoryOperation[] = []
  const deletes: CategoryOperation[] = []
  const operationId = (): string => context.nextId()

  // Locally-created categories: roots before children so a parent create precedes its dependents.
  const unbound = live.filter(
    (category) => !bound(category.id) && !category.isDefault,
  )
  for (const category of [
    ...unbound.filter((entry) => entry.parentId === null),
    ...unbound.filter((entry) => entry.parentId !== null),
  ]) {
    const marker = getMarker(binding, category.id, 'create')
    if (marker) {
      if (marker.localValue === createKey(category)) continue
      clearMarker(binding, category.id, 'create')
    }
    creates.push({
      operationId: operationId(),
      type: 'create',
      localId: category.id,
      name: category.name,
      color: category.color,
      parentLocalId: category.parentId,
      isDefault: false,
    })
  }

  for (const category of live) {
    const base = binding.base[category.id]
    if (
      !bound(category.id) ||
      !base ||
      !serverById.has(binding.serverCategoryIds[category.id]!)
    )
      continue
    for (const field of CATEGORY_FIELDS) {
      const localValue = fieldValue(category, field)
      const baseValue = baseFieldValue(base, field)
      if (localValue === baseValue) continue
      const marker = getMarker(binding, category.id, field)
      if (
        marker &&
        SUPPRESSING_KINDS.has(marker.kind) &&
        marker.localValue === localValue &&
        marker.serverValue === baseValue
      )
        continue
      // The server promotes a locally deleted parent's children itself; no reparent is needed.
      if (
        field === 'parentLocalId' &&
        localValue === null &&
        baseValue !== null &&
        pendingDeleted.has(baseValue)
      )
        continue
      if (field === 'name' && localValue !== null && baseValue !== null)
        renames.push({
          localId: category.id,
          name: localValue,
          expectedName: baseValue,
          parentKey: String(base.parentLocalId),
        })
      else if (field === 'color' && localValue !== null && baseValue !== null)
        recolors.push({
          operationId: operationId(),
          type: 'recolor',
          localId: category.id,
          color: category.color,
          expected: { color: base.color },
        })
      else if (field === 'parentLocalId')
        reparents.push({
          operationId: operationId(),
          type: 'reparent',
          localId: category.id,
          parentLocalId: localValue,
          expected: { parentLocalId: baseValue },
        })
    }
  }

  for (const localId of pendingDeleted) {
    const destination = resolveMove(state.categoryMoves, localId)
    if (!destination.ok || destination.id === localId) continue
    const marker = getMarker(binding, localId, 'delete')
    if (marker) {
      if (marker.localValue === destination.id) continue
      clearMarker(binding, localId, 'delete')
    }
    deletes.push({
      operationId: operationId(),
      type: 'delete',
      localId,
      destinationLocalId: destination.id,
    })
  }

  const derived = [
    ...creates,
    ...orderRenames(renames, operationId),
    ...recolors,
    ...reparents,
    ...deletes,
  ]
  replaceQueuedOperations(state, derived, operationId)
}

/**
 * Orders derived renames so a name is freed before another category takes it, and turns a name
 * cycle (for example a swap) into one `renameSet` (EA7).
 *
 * @param renames - Local renames, each with the server name it expects.
 * @returns Operations ready for the outbox.
 * @example orderRenames([{ localId: 'a', name: 'B', expectedName: 'A', parentKey: 'null' }, ...], nextId)
 */
function orderRenames(
  renames: RenameCandidate[],
  operationId: () => string,
): CategoryOperation[] {
  const baseKey = (rename: RenameCandidate): string =>
    `${rename.parentKey}\u0000${normalizeCategoryName(rename.expectedName)}`
  const targetKey = (rename: RenameCandidate): string =>
    `${rename.parentKey}\u0000${normalizeCategoryName(rename.name)}`
  // The rename that must run first because it frees the name this one wants.
  const dependency = (rename: RenameCandidate): RenameCandidate | undefined =>
    renames.find(
      (other) => other !== rename && baseKey(other) === targetKey(rename),
    )
  const emitted = new Set<string>()
  const output: CategoryOperation[] = []
  const single = (rename: RenameCandidate): void => {
    emitted.add(rename.localId)
    output.push({
      operationId: operationId(),
      type: 'rename',
      localId: rename.localId,
      name: rename.name,
      expected: { name: rename.expectedName },
    })
  }
  const visit = (rename: RenameCandidate, stack: RenameCandidate[]): void => {
    if (emitted.has(rename.localId)) return
    const frame = [...stack, rename]
    const waitsFor = dependency(rename)
    if (waitsFor && !emitted.has(waitsFor.localId)) {
      const at = frame.indexOf(waitsFor)
      if (at !== -1) {
        const cycle = frame.slice(at)
        if (cycle.length >= 2 && cycle.length <= 16) {
          for (const member of cycle) emitted.add(member.localId)
          output.push({
            operationId: operationId(),
            type: 'renameSet',
            items: cycle.map((member) => ({
              localId: member.localId,
              name: member.name,
              expected: { name: member.expectedName },
            })),
          })
        } else for (const member of cycle) single(member)
        return
      }
      visit(waitsFor, frame)
      if (emitted.has(rename.localId)) return
    }
    single(rename)
  }
  for (const rename of renames) visit(rename, [])
  return output
}

/**
 * Replaces the queued category operations with the derived set, preserving the ids of unchanged ones.
 *
 * @example replaceQueuedOperations(state, derived, nextId)
 */
function replaceQueuedOperations(
  state: OfflineWorkspace,
  derived: CategoryOperation[],
  operationId: () => string,
): void {
  const binding = state.binding!
  const existing = Object.entries(state.categoryOutbox)
  const queuedBySignature = new Map(
    existing
      .filter(
        ([, entry]) => entry.state === 'queued' || entry.state === 'blocked',
      )
      .map(
        ([id, entry]) =>
          [operationSignature(entry.operation), [id, entry]] as const,
      ),
  )
  const next: Record<string, CategoryOutboxEntry> = {}
  for (const [id, entry] of existing) {
    if (entry.state === 'sent') next[id] = entry
    else if (entry.state === 'parked') {
      // A parked operation lives while its declined marker still holds (EA8).
      const marker = getMarker(
        binding,
        operationMarkerId(entry.operation),
        operationField(entry.operation),
      )
      if (marker?.kind === 'parked') next[id] = entry
    }
  }
  for (const operation of derived) {
    const reused = queuedBySignature.get(operationSignature(operation))
    if (reused) next[reused[0]] = reused[1]
    else {
      const id = operation.operationId || operationId()
      next[id] = {
        operation: { ...operation, operationId: id },
        state: 'queued',
        receiptQueries: 0,
        frozenRevisions: [],
      }
    }
  }
  state.categoryOutbox = next
}
