/**
 * Completion upload work derived from completion state (#216 C19 mirrored for completions).
 *
 * A keep, edit or Undo changes only the completion. Whether it still has to reach the dashboard
 * is a pure function of the completion and the few outbox entries that are in flight, so a Mac
 * that was never attached holds no outbox at all and its keep-path snapshot stays flat (D1).
 * The wire payload is frozen into the outbox only when an operation is first marked in flight
 * (EA3); from then on its bytes never change.
 *
 * @module completionUpload
 */
import type {
  OfflineCompletion,
  OfflineWorkspace,
  OutboxEntry,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { effectiveCategory } from './effectiveCategory'

type LocalOperation = OutboxEntry['operation']

/** What an upload does on the dashboard; the same kinds the former eager enqueue computed. */
export type UploadKind = LocalOperation['kind']

/**
 * Groups the outbox by completion so a scan over many completions stays linear.
 *
 * @param state - The workspace whose outbox is small (in flight, uncertain or blocked entries).
 * @returns Entries per completion id; completions without entries are absent.
 * @example const entries = outboxByCompletion(state).get(completion.id) ?? []
 */
export function outboxByCompletion(
  state: Pick<OfflineWorkspace, 'outbox'>,
): Map<string, OutboxEntry[]> {
  const grouped = new Map<string, OutboxEntry[]>()
  for (const entry of Object.values(state.outbox)) {
    const list = grouped.get(entry.operation.completionId)
    if (list) list.push(entry)
    else grouped.set(entry.operation.completionId, [entry])
  }
  return grouped
}

/**
 * Decides whether a completion needs an upload and which kind.
 *
 * A completion needs sync when no entry already covers its revision, no uncertain operation is
 * still waiting for its receipt (unless it was cancelled meanwhile), the dashboard's copy is
 * older, and it was not cancelled before it ever reached the dashboard. Called by the keep
 * reducers (to supersede stale entries), the view counts and the sync batch selection.
 *
 * @param completion - A hot or archived completion.
 * @param entries - The outbox entries of this completion.
 * @returns The upload kind, or null when nothing has to be sent.
 * @example uploadKind(keep, []) // 'create'
 */
export function uploadKind(
  completion: OfflineCompletion,
  entries: readonly OutboxEntry[],
): UploadKind | null {
  if (entries.some((entry) => entry.operation.revision === completion.revision))
    return null
  const hasUncertain = entries.some((entry) => entry.state === 'sent')
  if (hasUncertain && !completion.cancelled) return null
  if ((completion.remote?.revision ?? 0) >= completion.revision) return null
  // Cancellation is terminal on the dashboard: once it holds a tombstone, another cancel changes nothing.
  if (completion.cancelled && completion.remote?.cancelled) return null
  // Cancelled before anything was offered to the dashboard: nothing to cancel there.
  if (completion.cancelled && !completion.remote && !hasUncertain) return null
  if (completion.cancelled) return 'cancel'
  if (!completion.remote) return 'create'
  return completion.remote.categoryId !== completion.categoryId
    ? 'relocate'
    : 'correctTime'
}

/**
 * Builds the local operation for a completion at its current revision.
 *
 * @param deviceId - The workspace's device id.
 * @param completion - The completion to upload.
 * @param kind - From {@link uploadKind}.
 * @param operationId - A fresh operation identity.
 * @returns The operation with the local category id; the server id is mapped when freezing.
 * @example const operation = buildOperation(state.deviceId, keep, 'create', randomUUID())
 */
export function buildOperation(
  deviceId: string,
  completion: OfflineCompletion,
  kind: UploadKind,
  operationId: string,
): LocalOperation {
  return {
    operationId,
    completionId: completion.id,
    deviceId,
    revision: completion.revision,
    expectedRemoteRevision: completion.remote?.revision ?? 0,
    kind,
    categoryId: completion.categoryId,
    title: completion.title,
    completedAt: completion.completedAt,
    originalCompletedAt: completion.originalCompletedAt,
    timezone: completion.timezone,
  }
}

/** A completion ready to be frozen into an in-flight operation. */
export interface UploadCandidate {
  completion: OfflineCompletion
  kind: UploadKind
  /** True when the record lives in the archive and must move into the workspace. */
  archived: boolean
}

/**
 * Lists up to `limit` completions that can be sent now, cancellations first.
 *
 * Hot completions come before archived ones. A completion whose category has no dashboard id yet
 * stays out (D4 last bullet). An archived record resolves its category through `categoryMoves`
 * because category deletions only rewrite hot records.
 *
 * @param state - The committed workspace.
 * @param archivedUnsent - Archived records that were never uploaded (see WorkspaceService).
 * @param limit - Maximum number of candidates.
 * @returns Candidates in send order; archived ones carry the effective category already applied.
 * @example const [first] = selectUploads(state, archivedUnsent, 16)
 */
export function selectUploads(
  state: OfflineWorkspace,
  archivedUnsent: ReadonlyMap<string, OfflineCompletion>,
  limit: number,
): UploadCandidate[] {
  const serverIds = state.binding?.serverCategoryIds
  if (!serverIds || limit <= 0) return []
  const grouped = outboxByCompletion(state)
  const cancels: UploadCandidate[] = []
  const others: UploadCandidate[] = []
  const consider = (completion: OfflineCompletion, archived: boolean): void => {
    const kind = uploadKind(completion, grouped.get(completion.id) ?? [])
    if (!kind) return
    let resolved = completion
    if (archived) {
      const categoryId = effectiveCategory(state, completion.categoryId)
      resolved =
        categoryId === completion.categoryId
          ? completion
          : { ...completion, categoryId }
    }
    if (serverIds[resolved.categoryId] === undefined) return
    const candidate = { completion: resolved, kind, archived }
    if (kind === 'cancel') cancels.push(candidate)
    else if (others.length < limit) others.push(candidate)
  }
  for (const completion of Object.values(state.completions))
    consider(completion, false)
  for (const [id, completion] of archivedUnsent) {
    // The archive can hold tens of thousands of keeps; a full batch needs no further scan.
    if (others.length >= limit) break
    if (!state.completions[id] && !state.retiredCompletions[id])
      consider(completion, true)
  }
  return [...cancels, ...others].slice(0, limit)
}

/**
 * Counts hot completions that wait for the dashboard: derivable uploads plus any with an entry.
 *
 * @param state - The workspace.
 * @returns Distinct completion ids; archived history is added by the caller.
 * @example const waiting = waitingCompletionCount(state)
 */
export function waitingCompletionCount(
  state: Pick<OfflineWorkspace, 'completions' | 'outbox'>,
): number {
  const grouped = outboxByCompletion(state)
  const waiting = new Set(grouped.keys())
  for (const completion of Object.values(state.completions))
    if (uploadKind(completion, grouped.get(completion.id) ?? []))
      waiting.add(completion.id)
  return waiting.size
}
