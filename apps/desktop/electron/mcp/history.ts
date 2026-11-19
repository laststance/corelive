import { randomUUID } from 'node:crypto'

import {
  McpHistoryInputSchema,
  type CompletionRange,
  type McpHistoryInput,
} from '@corelive/desktop-contract/completion-history'
import { toLocalDayKey } from '@corelive/live-editor/day'

import type { OfflineEditorController } from '../offline/OfflineEditorController'

import type { McpAccountBinding } from './historyAuthority'
import { projectHistory } from './historyProjection'
import { readAccountFrames } from './historyStream'

type Owner = Pick<
  OfflineEditorController,
  'mcpAccountBinding' | 'mcpDeviceHistory' | 'withMcpAccount'
>
type HistoryScope = 'device' | 'device-and-account'
type ScopeReason = 'verified' | 'not-connected' | 'account-unavailable'
interface FrozenRead {
  sessionId: string
  query: McpHistoryInput
  offset: number
  pageSize: number
  startDate: string
  endDate: string
  timezone: string
  scope: HistoryScope
  scopeReason: ScopeReason
  projection: ReturnType<typeof projectHistory>
  binding: McpAccountBinding | null
}

/** Converts an inclusive Mac calendar range to instants at real local midnights, including DST.
 * @example const period = historyPeriod({ startDate: '2026-03-08', endDate: '2026-03-08' })
 */
function historyPeriod(query: McpHistoryInput) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = toLocalDayKey(new Date(), timezone)
  const startDate = query.startDate ?? query.endDate ?? today
  const endDate = query.endDate ?? today
  if (startDate > endDate || startDate.startsWith('0000'))
    throw new McpHistoryError('invalid-input')
  const end = new Date(`${endDate}T00:00:00`)
  end.setDate(end.getDate() + 1)
  const range = {
    from: new Date(`${startDate}T00:00:00`).getTime(),
    before: end.getTime(),
  }
  return { startDate, endDate, timezone, range }
}

/** A partial stream cannot establish the account count. Accept a complete, currently owned set only.
 * @example const rows = await currentAccountRows(controller, binding, period.range, request.signal)
 */
async function currentAccountRows(
  controller: Owner,
  binding: McpAccountBinding | null,
  range: CompletionRange,
  cancellation: AbortSignal,
) {
  if (!binding || binding.signal.aborted) return null
  const rows = await controller
    .withMcpAccount(async (client, signal) => {
      const frames = await client.completed.historyRange(range, { signal })
      return readAccountFrames(frames, binding.accountId, range)
    }, cancellation)
    .catch(() => null)
  if (
    rows === null ||
    binding.signal.aborted ||
    controller.mcpAccountBinding()?.epoch !== binding.epoch
  )
    return null
  return { rows, binding }
}

/** A failure with no write effect. The helper can report the stable code without including writing. */
export class McpHistoryError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'category-unavailable'
      | 'history-cursor-unavailable'
      | 'device-history-unavailable'
      | 'account-changed'
      | 'session-closed',
  ) {
    super(code)
    this.name = 'McpHistoryError'
  }
}

/**
 * Owns transient frozen reads in the ordinary CoreLive process. Each opaque continuation belongs
 * to one verified connection, and revoked accounts or closed connections release their reads.
 * @example const history = createCompletionHistory({ controller }); await history.list(sessionId, {})
 */
export function createCompletionHistory({ controller }: { controller: Owner }) {
  const retained = new Map<string, { read: FrozenRead; release: () => void }>()
  const pending = new Map<string, Set<AbortController>>()

  function page(read: FrozenRead) {
    if (
      read.binding &&
      (read.binding.signal.aborted ||
        controller.mcpAccountBinding()?.epoch !== read.binding.epoch)
    )
      throw new McpHistoryError('account-changed')
    const { entries, unverifiedFilterCount } = read.projection
    const slice = entries.slice(read.offset, read.offset + read.pageSize)
    read.offset += slice.length
    let nextCursor = null
    if (read.offset < entries.length) {
      const cursor = randomUUID()
      const release = (): void => {
        retained.delete(cursor)
        read.binding?.signal.removeEventListener('abort', release)
      }
      retained.set(cursor, { read, release })
      read.binding?.signal.addEventListener('abort', release, { once: true })
      nextCursor = cursor
    }
    return {
      scope: read.scope,
      scopeReason: read.scopeReason,
      startDate: read.startDate,
      endDate: read.endDate,
      timezone: read.timezone,
      total: entries.length,
      unverifiedFilterCount,
      entries: slice,
      nextCursor,
    }
  }

  function continuePage(
    sessionId: string,
    cursor: string,
    query: McpHistoryInput,
    pageSize: number | undefined,
  ) {
    const cached = retained.get(cursor)
    if (!cached || cached.read.sessionId !== sessionId)
      throw new McpHistoryError('history-cursor-unavailable')
    // A cursor is a continuation of the same query; a different filter starts a new read.
    for (const key of Object.keys(query) as Array<keyof typeof query>) {
      if (query[key] !== cached.read.query[key])
        throw new McpHistoryError('invalid-input')
    }
    cached.release()
    if (pageSize !== undefined) cached.read.pageSize = pageSize
    return page(cached.read)
  }

  async function list(sessionId: string, input: McpHistoryInput) {
    const parsed = McpHistoryInputSchema.safeParse(input)
    if (!parsed.success) throw new McpHistoryError('invalid-input')
    const { cursor, pageSize, ...query } = parsed.data
    if (cursor) return continuePage(sessionId, cursor, query, pageSize)
    const { startDate, endDate, timezone, range } = historyPeriod(query)
    const request = new AbortController()
    const active = pending.get(sessionId) ?? new Set<AbortController>()
    active.add(request)
    pending.set(sessionId, active)
    try {
      const binding = controller.mcpAccountBinding()
      const device = await controller.mcpDeviceHistory(range).catch(() => {
        throw new McpHistoryError('device-history-unavailable')
      })
      if (
        query.categoryId &&
        !device.categories.some((cat) => cat.id === query.categoryId)
      )
        throw new McpHistoryError('category-unavailable')
      if (request.signal.aborted) throw new McpHistoryError('session-closed')
      const read = await currentAccountRows(
        controller,
        binding,
        range,
        request.signal,
      )
      if (request.signal.aborted) throw new McpHistoryError('session-closed')
      const account = read?.binding.signal.aborted ? null : read
      return page({
        sessionId,
        query,
        offset: 0,
        pageSize: pageSize ?? 50,
        startDate,
        endDate,
        timezone,
        scope: account ? 'device-and-account' : 'device',
        scopeReason: account
          ? 'verified'
          : binding
            ? 'account-unavailable'
            : 'not-connected',
        projection: projectHistory(
          device,
          account?.rows ?? [],
          account?.binding.accountId ?? null,
          query,
        ),
        binding: account?.binding ?? null,
      })
    } finally {
      active.delete(request)
      if (!active.size && pending.get(sessionId) === active)
        pending.delete(sessionId)
    }
  }

  function closeSession(sessionId: string): void {
    for (const input of pending.get(sessionId) ?? []) input.abort()
    pending.delete(sessionId)
    for (const entry of retained.values()) {
      if (entry.read.sessionId === sessionId) entry.release()
    }
  }

  return { list, closeSession }
}
