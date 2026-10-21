import type { CompletionSyncTransport } from '@corelive/desktop-contract/offline-sync'
import type { CompletionSyncReceipt } from '@corelive/desktop-contract/offline-workspace'
import { toLocalDayKey } from '@corelive/live-editor/day'

import { isSyncAuthenticationError } from './createSyncTransport'
import type { TokenBroker } from './TokenBroker'
import type { WorkspaceView } from './workspace-worker-protocol'
import type { WorkspaceWorkerClient } from './WorkspaceWorkerClient'

type CompletionSyncStatus = 'idle' | 'syncing' | 'offline' | 'sign-in-required'
export interface SyncAccountContext {
  ownerId: string
  generation: number
  worker: Pick<WorkspaceWorkerClient, 'call'>
}
type LoopOptions = {
  context: () => SyncAccountContext | null
  broker: Pick<TokenBroker, 'acquire'>
  transport: (token: string) => CompletionSyncTransport
  onView: (view: WorkspaceView, generation: number) => void
  onStatus: (status: CompletionSyncStatus, generation: number) => void
  onCategories?: (
    deletions: { sourceId: number; destinationId: number }[],
    generation: number,
  ) => void
  random?: () => number
  legacyNotes?: () => Record<string, string>
}

/**
 * Sends durable completion operations in bounded, account-bound background passes.
 * UI commands/reconnection/session changes call {@link wake}; local editing never
 * waits for this loop. Every awaited boundary rechecks the account generation.
 * @example const loop = new CompletionSyncLoop(options); loop.wake()
 */
export class CompletionSyncLoop {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private again = false
  private stopped = false
  private failures = 0
  private abort: AbortController | null = null

  constructor(private readonly options: LoopOptions) {}

  /** Schedules one pass, coalescing simultaneous online/pending-work notifications.
   * @example loop.wake()
   */
  wake(): void {
    this.stopped = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.running) {
      this.again = true
      return
    }
    void this.run()
  }

  /** Cancels network work and timers on logout/account transition or application shutdown.
   * @example loop.stop()
   */
  stop(): void {
    this.stopped = true
    this.again = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.abort?.abort()
  }

  /** Keeps old credentials/results from updating a newly selected account's UI or worker.
   * @example if (!this.current(context)) return
   */
  private current(context: SyncAccountContext): boolean {
    const latest = this.options.context()
    return (
      !this.stopped &&
      latest?.ownerId === context.ownerId &&
      latest.generation === context.generation &&
      latest.worker === context.worker
    )
  }

  /** Runs preparation refresh, uncertain-receipt recovery, dispatch and a coherent count checkpoint.
   * @example await this.run()
   */
  private async run(): Promise<void> {
    const context = this.options.context()
    if (!context || this.running || this.stopped) return
    this.running = true
    this.abort = new AbortController()
    const signal = this.abort.signal
    let delay = 50000
    try {
      const transport = await this.authorizedTransport(context)
      if (!transport) return
      if (!(await this.refreshCategories(context, transport, signal))) return
      // Bound each pass so an offline backlog cannot monopolize the account actor.
      for (let batch = 0; batch < 4 && this.current(context); batch++) {
        if (!(await this.sendBatch(context, transport, signal))) break
      }
      if (!this.current(context)) return
      if (await this.refreshCheckpoint(context, transport, signal)) delay = 20
      const remaining = await context.worker.call('pending', { limit: 1 })
      if (!this.current(context)) return
      this.options.onStatus('idle', context.generation)
      this.failures = 0
      if (remaining.length) delay = 20
    } catch (error) {
      this.failedPass(context, error)
    } finally {
      this.finishPass(delay)
    }
  }

  /** Acquires a short-lived capability without making local editor availability depend on it.
   * @example const transport = await this.authorizedTransport(context)
   */
  private async authorizedTransport(
    context: SyncAccountContext,
  ): Promise<CompletionSyncTransport | null> {
    const token = await this.options.broker.acquire(
      context.ownerId,
      context.generation,
    )
    if (!this.current(context)) return null
    if (token.status !== 'ready') {
      this.options.onStatus(
        token.status === 'signed-out' ? 'sign-in-required' : 'offline',
        context.generation,
      )
      if (token.status === 'unavailable') this.failures++
      return null
    }
    this.options.onStatus('syncing', context.generation)
    return this.options.transport(token.credential.token)
  }

  /** Refreshes only the verified account's categories before dispatching its queued work.
   * @example await this.refreshCategories(context, transport, signal)
   */
  private async refreshCategories(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
  ): Promise<boolean> {
    const bootstrap = await transport.bootstrap(signal)
    if (!this.current(context)) return false
    if (bootstrap.accountId !== context.ownerId)
      throw Object.assign(new Error('Account changed'), { status: 401 })
    const refreshed = await context.worker.call('categories', {
      categories: bootstrap.categories,
      deletions: bootstrap.deletions,
      legacyNotes: this.options.legacyNotes?.(),
    })
    if (!this.current(context)) return false
    this.options.onView(refreshed, context.generation)
    this.options.onCategories?.(bootstrap.deletions, context.generation)
    return true
  }

  /** Looks up uncertain receipts before a replay; absence permits replay of the same immutable payload.
   * @example await this.recoverReceipts(context, transport, ids, signal)
   */
  private async recoverReceipts(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    ids: string[],
    signal: AbortSignal,
  ): Promise<void> {
    const found = await transport.receipts({ operationIds: ids }, signal)
    if (!this.current(context)) return
    this.assertReceipts(found.receipts, ids, false)
    if (!found.receipts.length) return
    await this.commitReceipts(context, found.receipts)
  }

  /** Commits acknowledgements before publishing progress, with another owner-generation check after disk flush.
   * @example await this.commitReceipts(context, receipts)
   */
  private async commitReceipts(
    context: SyncAccountContext,
    receipts: CompletionSyncReceipt[],
  ): Promise<void> {
    const view = await context.worker.call('receipts', {
      ownerId: context.ownerId,
      receipts,
    })
    if (this.current(context)) this.options.onView(view, context.generation)
  }

  /** Dispatches at most sixteen durable operations, recovering uncertain outcomes first.
   * @example const more = await this.sendBatch(context, transport, signal)
   */
  private async sendBatch(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
  ): Promise<boolean> {
    let pending = await context.worker.call('pending', { limit: 16 })
    if (!this.current(context) || !pending.length) return false
    const uncertain = pending
      .filter((entry) => entry.state === 'sent')
      .map((entry) => entry.operation.operationId)
    if (uncertain.length) {
      await this.recoverReceipts(context, transport, uncertain, signal)
      if (!this.current(context)) return false
      pending = await context.worker.call('pending', { limit: 16 })
      if (!this.current(context) || !pending.length) return false
    }
    const confirmed = await context.worker.call('markSentBatch', {
      operationIds: pending.map((entry) => entry.operation.operationId),
    })
    if (!this.current(context)) return false
    const operations = confirmed.map((entry) => entry.operation)
    if (!operations.length) return true
    const response = await transport.apply({ operations }, signal)
    if (!this.current(context)) return false
    this.assertReceipts(
      response.receipts,
      operations.map((operation) => operation.operationId),
      true,
    )
    await this.commitReceipts(context, response.receipts)
    return this.current(context)
  }

  /** Refreshes coherent daily counts and reports whether compaction freed another page of history.
   * @example const compacted = await this.refreshCheckpoint(context, transport, signal)
   */
  private async refreshCheckpoint(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
  ): Promise<boolean> {
    const tracked = await context.worker.call('tracked', null)
    if (!this.current(context) || !tracked.complete) return false
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const day = toLocalDayKey(new Date(), timezone)
    const checkpoint = await transport.checkpoint(
      { day, timezone, completionIds: tracked.completionIds },
      signal,
    )
    if (!this.current(context)) return false
    this.assertCheckpoint(checkpoint, day, timezone, tracked.completionIds)
    if (toLocalDayKey(new Date(), timezone) !== day) return false
    const view = await context.worker.call('checkpoint', {
      expectedRevision: tracked.revision,
      checkpoint,
    })
    if (!this.current(context)) return false
    this.options.onView(view, context.generation)
    const after = await context.worker.call('tracked', null)
    return tracked.total > 2000 && after.total < tracked.total
  }

  /** Rejects missing identities or another day's count rather than inventing a fresh account total.
   * @example this.assertCheckpoint(checkpoint, day, timezone, identities)
   */
  private assertCheckpoint(
    checkpoint: Awaited<ReturnType<CompletionSyncTransport['checkpoint']>>,
    day: string,
    timezone: string,
    ids: string[],
  ): void {
    if (
      checkpoint.day !== day ||
      checkpoint.timezone !== timezone ||
      Object.keys(checkpoint.identities).length !== ids.length ||
      ids.some((id) => !Object.hasOwn(checkpoint.identities, id))
    )
      throw new Error('Incomplete count checkpoint')
  }

  /** Classifies transport failure only while its account is still active.
   * @example this.failedPass(context, error)
   */
  private failedPass(context: SyncAccountContext, error: unknown): void {
    if (!this.current(context)) return
    this.options.onStatus(
      isSyncAuthenticationError(error) ? 'sign-in-required' : 'offline',
      context.generation,
    )
    this.failures++
  }

  /** Schedules a coalesced next pass with bounded backoff, respecting shutdown.
   * @example this.finishPass(delay)
   */
  private finishPass(delay: number): void {
    this.running = false
    this.abort = null
    if (this.stopped) return
    if (this.again) {
      this.again = false
      this.wake()
      return
    }
    if (!this.options.context()) return
    if (this.failures)
      delay = Math.min(50000, 1000 * 2 ** Math.min(this.failures, 6))
    this.timer = setTimeout(
      () => {
        this.timer = null
        void this.run()
      },
      delay +
        Math.floor(
          (this.options.random?.() ?? Math.random()) * Math.min(delay, 10000),
        ),
    )
    this.timer.unref?.()
  }

  /** Refuses missing/foreign/duplicate apply acknowledgements without silently retiring work.
   * @example this.assertReceipts(response.receipts, operationIds, true)
   */
  private assertReceipts(
    receipts: CompletionSyncReceipt[],
    requested: string[],
    complete: boolean,
  ): void {
    const ids = new Set(receipts.map((receipt) => receipt.operationId))
    if (
      ids.size !== receipts.length ||
      receipts.some((receipt) => !requested.includes(receipt.operationId)) ||
      (complete && ids.size !== requested.length)
    )
      throw new Error('Invalid synchronization acknowledgement')
  }
}
