/**
 * Sync details data model and the DA7/DX11 action reducers (#216 C31, DA7, EA8).
 *
 * The page itself ships in step 5; this module builds its rows from the declined markers and
 * uncertain operations, and turns an action into the resulting change. Every action only edits
 * local state (or clears a marker); the C19 merge then derives the operation, so `expected`
 * is always the current base (C24).
 *
 * @module syncDetails
 */
import type {
  SyncDetailAction,
  SyncDetailRow,
  SyncDetailRowType,
} from '@corelive/desktop-contract/category-sync'
import {
  normalizeCategoryName,
  validateCategoryAction,
} from '@corelive/desktop-contract/category-validator'
import type {
  OfflineWorkspace,
  SyncHistoryItem,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { UNCERTAIN_QUERY_LIMIT } from './categoryReceipts'
import {
  baseFieldValue,
  clearMarker,
  displayValue,
  pathOf,
  pushHistory,
  setFieldValue,
  dropBinding,
  type CategoryContext,
} from './categoryState'
import { WorkspaceCommandError } from './WorkspaceCommandError'

/** Kinds shown as "Needs a look"; the others are informational and live in History (DA7). */
const ROW_KINDS = new Set<string>([
  'conflict',
  'name-taken',
  'digest-mismatch',
  'delete-blocked',
  'parked',
])

/** Everything the Sync details page renders (rows, History, migration summary, v1 backups). */
export interface SyncDetailsView {
  rows: SyncDetailRow[]
  history: SyncHistoryItem[]
  migrationSummary: NonNullable<OfflineWorkspace['migration']['summary']> | null
  preservedBackups: { fileName: string; accountId: string | null }[]
  dashboardOnlyCount: number
}

/** Actions each row type offers (DA7). */
function actionsFor(
  type: SyncDetailRowType,
  field: string,
): SyncDetailAction[] {
  switch (type) {
    case 'conflict':
      return ['use-mac-value', 'keep-dashboard-value']
    case 'name-taken':
      return field === 'name'
        ? ['choose-another-name', 'keep-dashboard-value']
        : ['keep-dashboard-value', 'try-again']
    case 'delete-blocked':
      return ['choose-another-name', 'keep-dashboard-value']
    case 'digest-mismatch':
    case 'parked':
      return ['try-again']
    default:
      return []
  }
}

/**
 * Builds the Sync details page data from the workspace.
 *
 * @param state - Workspace snapshot.
 * @returns "Needs a look" rows, latest History, the C34 summary and preserved v1 backups.
 * @example const details = buildSyncDetails(state)
 */
export function buildSyncDetails(state: OfflineWorkspace): SyncDetailsView {
  const rows: SyncDetailRow[] = []
  const binding = state.binding
  if (binding) {
    for (const [localId, fields] of Object.entries(binding.declined))
      for (const [field, marker] of Object.entries(fields)) {
        if (!ROW_KINDS.has(marker.kind)) continue
        const type = marker.kind as SyncDetailRowType
        rows.push({
          id: `${localId}:${field}`,
          type,
          categoryPath: pathOf(state, localId),
          field,
          macValue:
            marker.kind === 'delete-blocked'
              ? null
              : displayValue(state, field, marker.localValue),
          dashboardValue:
            marker.kind === 'delete-blocked'
              ? null
              : displayValue(state, field, marker.serverValue),
          ...(marker.kind === 'delete-blocked' && marker.serverValue
            ? { childName: marker.serverValue }
            : {}),
          actions: actionsFor(type, field),
        })
      }
    // EA4: three unanswered receipt lookups surface as a waiting row; it blocks only dependents.
    for (const entry of Object.values(state.categoryOutbox))
      if (
        entry.state === 'sent' &&
        entry.receiptQueries >= UNCERTAIN_QUERY_LIMIT
      ) {
        const localId =
          entry.operation.type === 'renameSet'
            ? entry.operation.items[0]!.localId
            : entry.operation.localId
        rows.push({
          id: `${entry.operation.operationId}:waiting`,
          type: 'waiting-confirm',
          categoryPath: pathOf(state, localId),
          field: entry.operation.type,
          macValue: null,
          dashboardValue: null,
          actions: [],
        })
      }
  }
  const receipts = Object.values(state.migration.receipts)
  return {
    rows,
    history: state.syncHistory,
    migrationSummary: state.migration.summary,
    preservedBackups: receipts
      .filter((receipt) => receipt.outcome === 'backup-preserved')
      .map((receipt) => ({
        fileName: receipt.fileName,
        accountId: receipt.accountId,
      })),
    dashboardOnlyCount: Object.keys(state.migration.dashboardOnly).length,
  }
}

/** Number of "Needs a look" rows, for the Account link (DA3). */
export function needsALookCount(state: OfflineWorkspace): number {
  return buildSyncDetails(state).rows.length
}

/**
 * Applies a DA7/DX11 action to its row (the `syncDetailAction` command reducer).
 *
 * - `use-mac-value` (conflict): restores the Mac's value as a new local edit; the merge derives
 *   the operation with `expected` = the current dashboard value (C24).
 * - `keep-dashboard-value`: clears the marker and queues nothing (name-taken also resets the
 *   local name to the dashboard's).
 * - `choose-another-name`: renames locally through the shared validator (DA8) and retries.
 *   For a blocked delete it renames the blocking child so the delete can retry (EA8).
 * - `try-again`: digest-mismatch re-derives under a new operationId; parked re-sends once.
 *
 * @param state - Cloned workspace, mutated.
 * @param command - Row id, action and optional new name.
 * @param context - Clock and ids.
 * @throws {@link WorkspaceCommandError} `record-unavailable` for a row that no longer exists,
 *   or a local refusal reason for an invalid new name.
 * @example applySyncDetailAction(state, { rowId, action: 'try-again' }, ctx)
 */
export function applySyncDetailAction(
  state: OfflineWorkspace,
  command: { rowId: string; action: SyncDetailAction; name?: string },
  context: CategoryContext,
): void {
  const binding = state.binding
  const [localId, field] = command.rowId.split(':')
  const marker = binding?.declined[localId ?? '']?.[field ?? '']
  if (!binding || !localId || !field || !marker || !ROW_KINDS.has(marker.kind))
    throw new WorkspaceCommandError('record-unavailable')
  const category = state.categories.find((item) => item.id === localId)
  const resolved = (
    macValue: string | null,
    dashboardValue: string | null,
  ): void =>
    pushHistory(state, context, {
      kind: 'resolved',
      categoryPath: pathOf(state, localId),
      field,
      macValue,
      dashboardValue,
    })
  const syncField =
    field === 'name' || field === 'color' || field === 'parentLocalId'
      ? field
      : null

  switch (command.action) {
    case 'use-mac-value': {
      if (!category || !syncField)
        throw new WorkspaceCommandError('record-unavailable')
      setFieldValue(category, syncField, marker.localValue)
      category.fieldRevisions[syncField]++
      clearMarker(binding, localId, field)
      resolved(marker.localValue, marker.serverValue)
      return
    }
    case 'keep-dashboard-value': {
      if (marker.kind === 'delete-blocked') {
        keepOnDashboard(state, localId, context)
        resolved(null, null)
        return
      }
      if (category && syncField && binding.base[localId]) {
        setFieldValue(
          category,
          syncField,
          baseFieldValue(binding.base[localId], syncField),
        )
        category.fieldRevisions[syncField]++
      }
      clearMarker(binding, localId, field)
      resolved(marker.localValue, marker.serverValue)
      return
    }
    case 'choose-another-name': {
      const target =
        marker.kind === 'delete-blocked'
          ? blockingChild(state, localId, marker.serverValue)
          : category
      if (!target || command.name === undefined)
        throw new WorkspaceCommandError('record-unavailable')
      const verdict = validateCategoryAction(state.categories, {
        type: 'rename',
        id: target.id,
        name: command.name,
      })
      if (!verdict.ok) throw new WorkspaceCommandError(verdict.reason)
      target.name = verdict.name ?? command.name
      target.fieldRevisions.name++
      clearMarker(binding, target.id, 'name')
      clearMarker(binding, localId, field)
      resolved(marker.localValue, marker.serverValue)
      return
    }
    case 'try-again': {
      if (marker.kind === 'parked') {
        for (const entry of Object.values(state.categoryOutbox))
          if (
            entry.state === 'parked' &&
            (entry.operation.type === 'renameSet'
              ? entry.operation.items[0]!.localId
              : entry.operation.localId) === localId
          )
            entry.state = 'queued'
      }
      clearMarker(binding, localId, field)
      return
    }
  }
}

/** The bound child whose name blocked the delete (EA8). */
function blockingChild(
  state: OfflineWorkspace,
  deletedLocalId: string,
  childName: string | null,
) {
  const binding = state.binding
  if (!binding || childName === null) return undefined
  return state.categories.find(
    (category) =>
      binding.base[category.id]?.parentLocalId === deletedLocalId &&
      normalizeCategoryName(category.name) === normalizeCategoryName(childName),
  )
}

/**
 * EA8 "Keep it on the dashboard": re-adds the server category locally, empty, under a new local id.
 * The local delete's destination move stays for old records.
 *
 * @example keepOnDashboard(state, deletedLocalId, ctx)
 */
function keepOnDashboard(
  state: OfflineWorkspace,
  deletedLocalId: string,
  context: CategoryContext,
): void {
  const binding = state.binding!
  const base = binding.base[deletedLocalId]
  const serverId = binding.serverCategoryIds[deletedLocalId]
  if (!base || serverId === undefined)
    throw new WorkspaceCommandError('record-unavailable')
  const newId = context.nextId()
  const parentExists = base.parentLocalId
    ? state.categories.some((category) => category.id === base.parentLocalId)
    : true
  state.categories.push({
    id: newId,
    name: base.name,
    color: base.color,
    isDefault: false,
    parentId: parentExists ? base.parentLocalId : null,
    removed: false,
    historical: false,
    fieldRevisions: { name: 0, color: 0, parentLocalId: 0 },
  })
  state.drafts[newId] = {
    revision: 0,
    rows: [{ id: context.nextId(), text: '' }],
  }
  dropBinding(binding, deletedLocalId)
  binding.serverCategoryIds[newId] = serverId
  binding.base[newId] = {
    ...base,
    parentLocalId: parentExists ? base.parentLocalId : null,
  }
  // Children the dashboard still keeps under it return under the re-added category.
  for (const child of state.categories) {
    const childBase = binding.base[child.id]
    if (childBase?.parentLocalId === deletedLocalId) {
      childBase.parentLocalId = newId
      child.parentId = newId
    }
  }
}
