import type { OfflineRecoveryPreview } from '@corelive/desktop-contract/offline-editor-api'
import type {
  CountCheckpoint,
  EditorCategory,
} from '@corelive/desktop-contract/offline-workspace'
import type {
  AccountBinding,
  OfflineCompletion,
  OfflineDraftRecord,
  OfflineWorkspace,
  OfflineWorkspaceView as WorkspaceView,
  OutboxEntry,
  WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { workspaceToday } from './workspaceCounts'

export type { OfflineWorkspaceView as WorkspaceView } from '@corelive/desktop-contract/offline-workspace-v2'

/** The binding facts the controller needs for status and attach decisions. */
export type BindingInfo = Pick<
  AccountBinding,
  'accountId' | 'displayEmail' | 'lastSyncedAt'
>

export interface WorkspaceWorkerCalls {
  open: { input: null; output: WorkspaceView }
  command: {
    input: WorkspaceCommand
    output: WorkspaceView & { writtenDraft: OfflineDraftRecord }
  }
  draft: { input: { categoryId: string }; output: OfflineDraftRecord }
  /** Sendable work for the bound account: uncertain entries plus queued ones with a server category id. */
  pending: { input: { limit: number }; output: OutboxEntry[] }
  markSentBatch: {
    input: { accountId: string; operationIds: string[] }
    output: OutboxEntry[]
  }
  receipts: {
    input: { accountId: string; receipts: unknown[] }
    output: WorkspaceView
  }
  reconcile: {
    input: {
      accountId: string
      displayEmail: string | null
      categories: EditorCategory[]
      deletions: { sourceId: number; destinationId: number }[]
    }
    output: WorkspaceView
  }
  markSynced: {
    input: { accountId: string; at: number }
    output: WorkspaceView
  }
  binding: { input: null; output: BindingInfo | null }
  localCategory: { input: { serverId: number }; output: string | null }
  recoveryCopies: {
    input: { offset: number; limit: number }
    output: { total: number; copies: OfflineWorkspace['recoveryCopies'] }
  }
  clearDue: { input: null; output: WorkspaceView }
  details: {
    input: { offset: number; limit: number }
    output: {
      total: number
      records: { entry: OutboxEntry; completion: OfflineCompletion }[]
    }
  }
  checkpoint: {
    input: {
      accountId: string
      expectedRevision: number
      checkpoint: CountCheckpoint
    }
    output: WorkspaceView
  }
  tracked: {
    input: null
    output: {
      revision: number
      completionIds: string[]
      complete: boolean
      total: number
    }
  }
  undoHistory: {
    input: { offset: number; limit: number }
    output: { total: number; completions: OfflineCompletion[] }
  }
  export: { input: null; output: string }
  previewRecovery: { input: null; output: OfflineRecoveryPreview }
  recover: { input: null; output: WorkspaceView }
}

export type WorkspaceWorkerRequest = {
  [K in keyof WorkspaceWorkerCalls]: {
    requestId: string
    type: K
    input: WorkspaceWorkerCalls[K]['input']
  }
}[keyof WorkspaceWorkerCalls]

/** Snapshot projection runs in the storage worker so even large queues never block main's shortcuts.
 * @example workspaceView(state)
 */
export function workspaceView(state: OfflineWorkspace): WorkspaceView {
  const draft = state.drafts[state.selectedCategoryId]
  if (!draft) throw new Error('Invalid selected workspace category')
  const entries = Object.values(state.outbox)
  const eligible = eligibleUndo(state)
  return {
    ownerId: state.ownerId,
    revision: state.revision,
    selectedCategoryId: state.selectedCategoryId,
    categories: state.categories,
    preferences: state.preferences,
    draft,
    pendingCount: new Set(entries.map((entry) => entry.operation.completionId))
      .size,
    blockedCount: new Set(
      entries
        .filter((entry) => entry.state === 'blocked')
        .map((entry) => entry.operation.completionId),
    ).size,
    recentUndo: eligible.slice(0, 20),
    eligibleUndoCount: eligible.length,
    nextUndoAt: eligible.reduce<number | null>(
      (next, completion) =>
        next === null
          ? completion.undoUntil
          : Math.min(next, completion.undoUntil),
      null,
    ),
    checkpoint: state.checkpoint,
    // Server-recorded destination of each removed category (suggestion for the confirmed move).
    categoryMoves: state.binding?.deletionReceipts ?? {},
    binding: state.binding
      ? {
          accountId: state.binding.accountId,
          displayEmail: state.binding.displayEmail,
          lastSyncedAt: state.binding.lastSyncedAt,
        }
      : null,
    recoveryCopyCount: state.recoveryCopies.filter(
      (copy) => copy.restoredTo === undefined,
    ).length,
    today: workspaceToday(
      state,
      Date.now(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    nextClearAt: Object.values(state.completions).reduce<number | null>(
      (next, completion) => {
        if (
          completion.cancelled ||
          completion.cleared ||
          completion.clearAfter === null
        )
          return next
        return next === null
          ? completion.clearAfter
          : Math.min(next, completion.clearAfter)
      },
      null,
    ),
  }
}

/** Retains access to every eligible Undo while the initial projection includes only recent rows.
 * @example const page = eligibleUndo(state).slice(offset, offset + limit)
 */
export function eligibleUndo(state: OfflineWorkspace): OfflineCompletion[] {
  return Object.values(state.completions)
    .filter(
      (completion) =>
        !completion.restored && completion.undoUntil >= Date.now(),
    )
    .sort((left, right) => right.undoUntil - left.undoUntil)
}
