import type {
  OfflineTodayCount,
  OfflineWorkspace,
} from '@corelive/desktop-contract/offline-workspace'
import { toLocalDayKey } from '@corelive/live-editor/day'

/** Projects one day from durable identities, overlaying each pending identity exactly once.
 * Worker views use this after commits. Receipt lookup/queued-operation counts alone cannot
 * establish a fresh server total; absent uncertain identities fall back to this device.
 * @example const today = workspaceToday(state, Date.now(), 'Asia/Tokyo')
 */
export function workspaceToday(
  state: OfflineWorkspace,
  now: number,
  timezone: string,
): OfflineTodayCount {
  const day = toLocalDayKey(new Date(now), timezone)
  const contribution = (
    record: { cancelled: boolean; completedAt: number } | null,
  ): number =>
    record &&
    !record.cancelled &&
    toLocalDayKey(new Date(record.completedAt), timezone) === day
      ? 1
      : 0
  const records = Object.values(state.completions)
  const deviceTotal = [
    ...records,
    ...Object.values(state.retiredCompletions),
  ].reduce((sum, record) => sum + contribution(record), 0)
  const checkpoint =
    state.checkpoint?.day === day && state.checkpoint.timezone === timezone
      ? state.checkpoint
      : null
  let complete = checkpoint !== null
  let delta = 0
  const hasOperations = new Set<string>()
  const uncertain = new Set<string>()
  for (const entry of Object.values(state.outbox)) {
    hasOperations.add(entry.operation.completionId)
    if (entry.state !== 'queued') uncertain.add(entry.operation.completionId)
  }
  for (const record of records) {
    if (checkpoint && Object.hasOwn(checkpoint.identities, record.id)) {
      delta +=
        contribution(record) -
        contribution(checkpoint.identities[record.id] ?? null)
      continue
    }
    const neverSent =
      !record.remote &&
      hasOperations.has(record.id) &&
      !uncertain.has(record.id)
    if (!neverSent) complete = false
    delta += contribution(record)
  }
  return {
    day,
    timezone,
    deviceTotal,
    total:
      complete && checkpoint
        ? Math.max(0, checkpoint.total + delta)
        : deviceTotal,
    scope: complete ? 'account' : 'device',
    stale:
      !checkpoint ||
      !complete ||
      now - checkpoint.fetchedAt > 60000 ||
      now < checkpoint.fetchedAt,
    confirmedAt: checkpoint?.fetchedAt ?? null,
    lastAccountTotal: checkpoint?.total ?? null,
  }
}

/** Prioritizes active Undo and pending identities while allowing old receipts to compact in batches.
 * @example const tracked = checkpointIdentities(state, Date.now())
 */
export function checkpointIdentities(state: OfflineWorkspace, now: number) {
  const mutable = new Set(
    Object.values(state.outbox).map((entry) => entry.operation.completionId),
  )
  for (const completion of Object.values(state.completions))
    if (!completion.restored && completion.undoUntil >= now)
      mutable.add(completion.id)
  const all = [...new Set([...mutable, ...Object.keys(state.completions)])]
  return {
    revision: state.revision,
    completionIds: all.slice(0, 2000),
    complete: mutable.size <= 2000,
    total: all.length,
  }
}
