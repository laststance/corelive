/**
 * Category outbox sending, freezing and receipt dispositions (#216 D4, C8, EA3-EA5, EA8, EA16, E3).
 *
 * The worker calls these inside disk transactions on a cloned workspace. The merge
 * ({@link mergeCategories}) is the only producer of operations; this module only moves an
 * existing operation through queued -> sent -> retired/declined/parked.
 *
 * @module categoryReceipts
 */
import type {
  CategoryField,
  CategoryOperation,
  CategoryWireOperation,
  SyncOutcome,
} from '@corelive/desktop-contract/category-sync'
import type {
  AccountBinding,
  CategoryOutboxEntry,
  OfflineCompletion,
  OfflineWorkspace,
} from '@corelive/desktop-contract/offline-workspace-v2'

import {
  baseFieldValue,
  createKey,
  dropBinding,
  dropCategoryOperations,
  retireIntoCategory,
  fieldValue,
  operationField,
  operationLocalIds,
  operationMarkerId,
  pathOf,
  pushHistory,
  serverToLocalMap,
  setBaseFieldValue,
  setFieldValue,
  setMarker,
  type CategoryContext,
} from './categoryState'
import { selectUploads } from './completionUpload'

type CategoryReceipt = Extract<SyncOutcome, { kind: 'category' }>

/** Unanswered receipt lookups after which an operation shows as "Waiting for the dashboard" (EA4). */
export const UNCERTAIN_QUERY_LIMIT = 3

/**
 * Maps an operation's local ids to server ids through the binding (C11/C24).
 *
 * @param binding - The attached account's binding.
 * @param operation - Local operation.
 * @returns The wire payload, or null when an id it needs has no server id yet (dependency wait).
 * @example wireOperation(binding, op) // { operationId, type: 'rename', serverId: 3, ... }
 */
function wireOperation(
  binding: AccountBinding,
  operation: CategoryOperation,
): CategoryWireOperation | null {
  const server = (id: string | null): number | null | undefined =>
    id === null ? null : binding.serverCategoryIds[id]
  const own = server(operationMarkerId(operation))
  switch (operation.type) {
    case 'create': {
      const parentId = server(operation.parentLocalId)
      if (parentId === undefined) return null
      return {
        operationId: operation.operationId,
        type: 'create',
        name: operation.name,
        color: operation.color,
        parentId,
      }
    }
    case 'rename':
      return typeof own === 'number'
        ? {
            operationId: operation.operationId,
            type: 'rename',
            serverId: own,
            name: operation.name,
            expected: operation.expected,
          }
        : null
    case 'recolor':
      return typeof own === 'number'
        ? {
            operationId: operation.operationId,
            type: 'recolor',
            serverId: own,
            color: operation.color,
            expected: operation.expected,
          }
        : null
    case 'reparent': {
      const parentId = server(operation.parentLocalId)
      const expectedParentId = server(operation.expected.parentLocalId)
      if (
        typeof own !== 'number' ||
        parentId === undefined ||
        expectedParentId === undefined
      )
        return null
      return {
        operationId: operation.operationId,
        type: 'reparent',
        serverId: own,
        parentId,
        expected: { parentId: expectedParentId },
      }
    }
    case 'delete': {
      const destinationId = server(operation.destinationLocalId)
      if (typeof own !== 'number' || typeof destinationId !== 'number')
        return null
      return {
        operationId: operation.operationId,
        type: 'delete',
        serverId: own,
        destinationId,
      }
    }
    case 'renameSet': {
      const items = operation.items.map((item) => ({
        serverId: binding.serverCategoryIds[item.localId],
        name: item.name,
        expected: item.expected,
      }))
      if (items.some((item) => item.serverId === undefined)) return null
      return {
        operationId: operation.operationId,
        type: 'renameSet',
        items: items.map((item) => ({ ...item, serverId: item.serverId! })),
      }
    }
  }
}

/**
 * Lists category work the loop may act on: uncertain entries to recover and queued ones whose
 * ids all have server ids and that do not depend on an uncertain operation (D4 dependency rule).
 *
 * @param state - Workspace snapshot.
 * @param limit - Maximum sendable entries.
 * @returns Uncertain entries and sendable queued entries.
 * @example const { uncertain, sendable } = categoryWork(state, 16)
 */
export function categoryWork(
  state: OfflineWorkspace,
  limit: number,
): { uncertain: CategoryOutboxEntry[]; sendable: CategoryOutboxEntry[] } {
  const entries = Object.values(state.categoryOutbox)
  const uncertain = entries.filter((entry) => entry.state === 'sent')
  const blockedIds = new Set(
    uncertain.flatMap((entry) => operationLocalIds(entry.operation)),
  )
  const binding = state.binding
  const sendable = binding
    ? entries
        .filter(
          (entry) =>
            entry.state === 'queued' &&
            wireOperation(binding, entry.operation) !== null &&
            // Only dependents of an uncertain operation wait for it (EA4).
            !operationLocalIds(entry.operation).some((id) =>
              blockedIds.has(id),
            ),
        )
        .slice(0, limit)
    : []
  return { uncertain, sendable }
}

/**
 * Freezes the mapped wire payload and marks the operations in flight in one transaction (EA3).
 * Called with candidates from {@link categoryWork}; every retry sends these stored bytes.
 *
 * @param state - Cloned workspace, mutated.
 * @param operationIds - Candidate operation ids.
 * @returns The ids now in flight.
 * @example const sent = freezeCategoryBatch(state, ids)
 */
export function freezeCategoryBatch(
  state: OfflineWorkspace,
  operationIds: string[],
): string[] {
  const binding = state.binding
  if (!binding) return []
  const frozen: string[] = []
  const blockedIds = new Set(
    Object.values(state.categoryOutbox)
      .filter((entry) => entry.state === 'sent')
      .flatMap((entry) => operationLocalIds(entry.operation)),
  )
  for (const id of operationIds) {
    const entry = state.categoryOutbox[id]
    if (entry?.state !== 'queued') continue
    const wire = wireOperation(binding, entry.operation)
    if (!wire) continue
    // A dependent never shares a batch with what it waits on (D4).
    const ids = operationLocalIds(entry.operation)
    if (ids.some((localId) => blockedIds.has(localId))) continue
    entry.wire = wire
    entry.state = 'sent'
    entry.frozenRevisions = frozenRevisions(state, entry.operation)
    frozen.push(id)
    // Same-category operations in one batch are fine; creates are the only producers of ids.
    if (entry.operation.type === 'create')
      for (const localId of ids) blockedIds.add(localId)
  }
  return frozen
}

/** Local revision of each touched field at freeze time (EA5). */
function frozenRevisions(
  state: OfflineWorkspace,
  operation: CategoryOperation,
): CategoryOutboxEntry['frozenRevisions'] {
  const revisionOf = (
    localId: string,
    field: CategoryField,
  ): CategoryOutboxEntry['frozenRevisions'][number] => ({
    localId,
    field,
    revision:
      state.categories.find((category) => category.id === localId)
        ?.fieldRevisions[field] ?? 0,
  })
  switch (operation.type) {
    case 'rename':
      return [revisionOf(operation.localId, 'name')]
    case 'recolor':
      return [revisionOf(operation.localId, 'color')]
    case 'reparent':
      return [revisionOf(operation.localId, 'parentLocalId')]
    case 'renameSet':
      return operation.items.map((item) => revisionOf(item.localId, 'name'))
    case 'delete':
      return [{ localId: operation.localId, field: 'delete', revision: 0 }]
    case 'create':
      return []
  }
}

/**
 * Records that a receipt lookup found nothing for uncertain operations (EA4).
 *
 * @example noteReceiptQuery(state, ['op-1'])
 */
export function noteReceiptQuery(
  state: OfflineWorkspace,
  operationIds: string[],
): void {
  for (const id of operationIds) {
    const entry = state.categoryOutbox[id]
    if (entry?.state === 'sent') entry.receiptQueries++
  }
}

/**
 * Parks operations a non-401 4xx rejected on their own (E3, `CATEGORY_SYNC_REJECTED`).
 * They stay in the outbox with a `parked` marker so the merge never regenerates them (EA8).
 *
 * @example parkOperations(state, ['op-1'])
 */
export function parkOperations(
  state: OfflineWorkspace,
  operationIds: string[],
): void {
  const binding = state.binding
  if (!binding) return
  for (const id of operationIds) {
    const entry = state.categoryOutbox[id]
    if (!entry || entry.state !== 'sent') continue
    entry.state = 'parked'
    const localId = operationMarkerId(entry.operation)
    const field = operationField(entry.operation)
    setMarker(binding, localId, field, {
      kind: 'parked',
      localValue: markerLocalValue(state, entry.operation),
      serverValue: markerServerValue(binding, entry.operation),
    })
  }
}

/** The local value a marker records for an operation (what the merge compares later). */
function markerLocalValue(
  state: OfflineWorkspace,
  operation: CategoryOperation,
): string | null {
  switch (operation.type) {
    case 'create': {
      const category = state.categories.find(
        (entry) => entry.id === operation.localId,
      )
      return category ? createKey(category) : null
    }
    case 'rename':
      return operation.name
    case 'recolor':
      return operation.color
    case 'reparent':
      return operation.parentLocalId
    case 'delete':
      return operation.destinationLocalId
    case 'renameSet':
      return operation.items[0]!.name
  }
}

/** The server (base) value a marker records for an operation. */
function markerServerValue(
  binding: AccountBinding,
  operation: CategoryOperation,
): string | null {
  switch (operation.type) {
    case 'create':
    case 'delete':
      return null
    case 'rename':
    case 'renameSet':
      return binding.base[operationMarkerId(operation)]?.name ?? null
    case 'recolor':
      return binding.base[operation.localId]?.color ?? null
    case 'reparent':
      return binding.base[operation.localId]?.parentLocalId ?? null
  }
}

/**
 * Applies category receipts by `operationId` only (EA16); a receipt for an operation the outbox
 * no longer holds is ignored. Writes `lastSyncedAt` in the same transaction once nothing
 * sendable is left (C22).
 *
 * Dispositions (C8, EA5, EA8): every outcome retires its operation; a refusal records a declined
 * marker, reverts the local field only when its revision is unchanged since freeze, and adds a
 * Sync details row or History item.
 *
 * @param state - Cloned workspace, mutated.
 * @param receipts - Category receipts from `syncApply` or `syncReceipts`.
 * @param context - Clock and ids.
 * @example applyCategoryReceipts(state, response.receipts.filter(isCategory), ctx)
 */
export function applyCategoryReceipts(
  state: OfflineWorkspace,
  receipts: CategoryReceipt[],
  context: CategoryContext,
): void {
  const binding = state.binding
  if (!binding) return
  for (const receipt of receipts) {
    const entry = state.categoryOutbox[receipt.operationId]
    if (!entry) continue
    applyReceipt(state, binding, entry, receipt, context)
    delete state.categoryOutbox[receipt.operationId]
  }
  if (!hasSendableWork(state, context.archivedUnsent))
    binding.lastSyncedAt = context.now
}

/**
 * Whether any completion or category operation could still be sent (C22).
 *
 * Completion work is derived: an uncertain entry, or a hot or archived completion that needs
 * an upload and whose category already has a dashboard id.
 * @param state - The workspace.
 * @param archivedUnsent - Archived never-uploaded keeps, when loaded.
 * @example if (!hasSendableWork(state)) binding.lastSyncedAt = now
 */
export function hasSendableWork(
  state: OfflineWorkspace,
  archivedUnsent: ReadonlyMap<string, OfflineCompletion> = new Map(),
): boolean {
  const binding = state.binding
  if (!binding) return false
  if (categoryWork(state, 1).sendable.length) return true
  if (Object.values(state.categoryOutbox).some((e) => e.state === 'sent'))
    return true
  return (
    Object.values(state.outbox).some((entry) => entry.state === 'sent') ||
    selectUploads(state, archivedUnsent, 1).length > 0
  )
}

/** The fields' local revision when the operation was frozen, or undefined when not recorded. */
function frozenRevision(
  entry: CategoryOutboxEntry,
  localId: string,
  field: string,
): number | undefined {
  return entry.frozenRevisions.find(
    (item) => item.localId === localId && item.field === field,
  )?.revision
}

/** True when the field is unchanged locally since freeze, so a receipt may overwrite it (EA5). */
function mayRevert(
  state: OfflineWorkspace,
  entry: CategoryOutboxEntry,
  localId: string,
  field: CategoryField,
): boolean {
  const category = state.categories.find((item) => item.id === localId)
  if (!category) return false
  const frozen = frozenRevision(entry, localId, field)
  return frozen === undefined || category.fieldRevisions[field] === frozen
}

/** One receipt's disposition. */
function applyReceipt(
  state: OfflineWorkspace,
  binding: AccountBinding,
  entry: CategoryOutboxEntry,
  receipt: CategoryReceipt,
  context: CategoryContext,
): void {
  const operation = entry.operation
  const localId = operationMarkerId(operation)
  const field = operationField(operation)
  const fieldKey: CategoryField | null =
    field === 'name' || field === 'color' || field === 'parentLocalId'
      ? field
      : null
  switch (receipt.result) {
    case 'applied':
      applyApplied(state, binding, operation, receipt.serverId)
      return
    case 'adopted': {
      if (operation.type !== 'create') return
      const reverse = serverToLocalMap(binding)
      const holder = reverse.get(receipt.serverId)
      if (holder && holder !== operation.localId) {
        // The dashboard category is already bound to another local one: this create was a duplicate.
        dropCategoryOperations(state, operation.localId)
        retireIntoCategory(state, operation.localId, holder, context.nextId)
        return
      }
      binding.serverCategoryIds[operation.localId] = receipt.serverId
      binding.base[operation.localId] = {
        name: receipt.current.name,
        color: receipt.current.color,
        parentLocalId:
          receipt.current.parentId === null
            ? null
            : (reverse.get(receipt.current.parentId) ?? null),
      }
      return
    }
    case 'conflict': {
      if (operation.type === 'renameSet') {
        // Which item lost is unknown; the next merge re-reads each from the refreshed list.
        return
      }
      if (!fieldKey) return
      const current = receipt.current
      const reverse = serverToLocalMap(binding)
      const serverValue =
        'name' in current
          ? current.name
          : 'color' in current
            ? current.color
            : current.parentId === null
              ? null
              : (reverse.get(current.parentId) ?? null)
      const category = state.categories.find((item) => item.id === localId)
      const base = binding.base[localId]
      if (base) setBaseFieldValue(base, fieldKey, serverValue)
      if (category && mayRevert(state, entry, localId, fieldKey)) {
        setMarker(binding, localId, fieldKey, {
          kind: 'conflict',
          localValue: markerLocalValue(state, operation),
          serverValue,
        })
        setFieldValue(category, fieldKey, serverValue)
      }
      return
    }
    case 'name-taken': {
      // The local value is kept; the server keeps the old one (C8, EA5).
      const items =
        operation.type === 'renameSet'
          ? operation.items.map((item) => item.localId)
          : [localId]
      for (const id of items) {
        const keyField: string =
          operation.type === 'reparent' ? 'parentLocalId' : 'name'
        const category = state.categories.find((item) => item.id === id)
        if (!category) continue
        setMarker(binding, id, keyField, {
          kind: 'name-taken',
          localValue: fieldValue(
            category,
            keyField === 'name' ? 'name' : 'parentLocalId',
          ),
          serverValue: binding.base[id]
            ? baseFieldValue(
                binding.base[id],
                keyField === 'name' ? 'name' : 'parentLocalId',
              )
            : null,
        })
      }
      return
    }
    case 'invalid-parent':
    case 'forbidden': {
      revertRefused(
        state,
        binding,
        entry,
        localId,
        fieldKey,
        receipt.result,
        context,
      )
      return
    }
    case 'digest-mismatch': {
      setMarker(binding, localId, field, {
        kind: 'digest-mismatch',
        localValue: markerLocalValue(state, operation),
        serverValue: markerServerValue(binding, operation),
      })
      return
    }
    case 'delete-blocked': {
      setMarker(binding, localId, 'delete', {
        kind: 'delete-blocked',
        localValue: markerLocalValue(state, operation),
        serverValue: receipt.childName,
      })
      return
    }
  }
}

/** `applied`: update ids and the merge base to what was sent. */
function applyApplied(
  state: OfflineWorkspace,
  binding: AccountBinding,
  operation: CategoryOperation,
  serverId: number,
): void {
  switch (operation.type) {
    case 'create': {
      binding.serverCategoryIds[operation.localId] = serverId
      binding.base[operation.localId] = {
        name: operation.name,
        color: operation.color,
        parentLocalId: operation.parentLocalId,
      }
      return
    }
    case 'rename': {
      const base = binding.base[operation.localId]
      if (base) base.name = operation.name
      return
    }
    case 'recolor': {
      const base = binding.base[operation.localId]
      if (base) base.color = operation.color
      return
    }
    case 'reparent': {
      const base = binding.base[operation.localId]
      if (base) base.parentLocalId = operation.parentLocalId
      return
    }
    case 'renameSet': {
      for (const item of operation.items) {
        const base = binding.base[item.localId]
        if (base) base.name = item.name
      }
      return
    }
    case 'delete': {
      // The server promoted the children to roots with the delete.
      for (const base of Object.values(binding.base))
        if (base.parentLocalId === operation.localId) base.parentLocalId = null
      dropBinding(binding, operation.localId)
      return
    }
  }
}

/** `invalid-parent` / `forbidden`: revert to the dashboard's value if unchanged since freeze (EA5). */
function revertRefused(
  state: OfflineWorkspace,
  binding: AccountBinding,
  entry: CategoryOutboxEntry,
  localId: string,
  fieldKey: CategoryField | null,
  kind: 'invalid-parent' | 'forbidden',
  context: CategoryContext,
): void {
  const operation = entry.operation
  const category = state.categories.find((item) => item.id === localId)
  const base = binding.base[localId]
  if (fieldKey && category && base) {
    const macValue = fieldValue(category, fieldKey)
    const serverValue = baseFieldValue(base, fieldKey)
    if (mayRevert(state, entry, localId, fieldKey)) {
      setMarker(binding, localId, fieldKey, {
        kind,
        localValue: macValue,
        serverValue,
      })
      setFieldValue(category, fieldKey, serverValue)
      pushHistory(state, context, {
        kind: 'reverted',
        categoryPath: pathOf(state, localId),
        field: fieldKey,
        macValue,
        dashboardValue: serverValue,
        reason: kind,
      })
    }
    return
  }
  // create/delete refusals stay declined so the merge does not retry them (C18).
  setMarker(binding, localId, operationField(operation), {
    kind,
    localValue: markerLocalValue(state, operation),
    serverValue: markerServerValue(binding, operation),
  })
  pushHistory(state, context, {
    kind: 'reverted',
    categoryPath: pathOf(state, localId),
    field: operationField(operation),
    macValue: null,
    dashboardValue: null,
    reason: kind,
  })
}
