import type { CompletionRange } from '@corelive/desktop-contract/completion-history'
import type {
  OfflineWorkspace,
  WorkspaceArchive,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { pathOf } from '../offline/categoryState'
import { effectiveCategory } from '../offline/effectiveCategory'

export interface DeviceHistoryRow {
  id: string
  title: string | null
  completedAt: number
  categoryId: string | null
  /** False for a legacy marker whose source account was never recorded. */
  boundIdentity: boolean
  pending: boolean
}

export interface DeviceHistory {
  rows: DeviceHistoryRow[]
  /** A pending local correction or Undo can supersede an older visible account row in this range. */
  suppressedIds: string[]
  boundAccountId: string | null
  categories: {
    id: string
    parentId: string | null
    path: string
    serverId: number | null
  }[]
}

/**
 * Projects eligible device history in the storage worker. The active workspace wins over
 * archive overlap after an interrupted move. Each occurrence retains its own identity.
 * @example const data = deviceCompletionHistory(workspace, archive, { from, before })
 */
export function deviceCompletionHistory(
  state: OfflineWorkspace,
  archive: WorkspaceArchive | null,
  range: CompletionRange,
): DeviceHistory {
  const rows: DeviceHistoryRow[] = []
  const suppressedIds: string[] = []
  const seen = new Set<string>()
  const belongs = (at: number) => at >= range.from && at < range.before
  const collect = (
    id: string,
    title: string | undefined,
    at: number,
    cancelled: boolean,
    localId: string | null,
    boundIdentity: boolean,
    pending: boolean,
  ): void => {
    if (seen.has(id)) return
    seen.add(id)
    if (cancelled || !belongs(at)) {
      if (pending && boundIdentity) suppressedIds.push(id)
      return
    }
    rows.push({
      id,
      title: title ?? null,
      completedAt: at,
      categoryId: localId && effectiveCategory(state, localId),
      boundIdentity,
      pending,
    })
  }
  for (const source of [state, archive]) {
    if (!source) continue
    // A retirement supersedes an older full record that can still be present after a crash.
    for (const [id, row] of Object.entries(source.retiredCompletions))
      collect(
        id,
        row.title,
        row.completedAt,
        row.cancelled,
        row.originalCategoryId,
        true,
        row.revision > row.remoteRevision,
      )
    for (const row of Object.values(source.completions))
      collect(
        row.id,
        row.title,
        row.completedAt,
        row.cancelled,
        row.categoryId,
        true,
        row.revision > (row.remote?.revision ?? 0),
      )
  }
  // Older downgrade imports preserved a timestamp but could lose the source of a category.
  // Newly imported markers retain that provenance; a missing field is never inferred.
  for (const [id, row] of Object.entries(state.migration.dashboardOnly)) {
    const matched =
      row.sourceAccountId !== undefined &&
      row.sourceAccountId === state.binding?.accountId
    collect(
      id,
      undefined,
      row.completedAt,
      row.cancelled,
      row.categoryVerified ? row.originalCategoryId : null,
      matched,
      false,
    )
  }
  return {
    rows,
    suppressedIds,
    boundAccountId: state.binding?.accountId ?? null,
    categories: state.categories.map(({ id, parentId }) => ({
      id,
      parentId,
      path: pathOf(state, id),
      serverId: state.binding?.serverCategoryIds[id] ?? null,
    })),
  }
}
