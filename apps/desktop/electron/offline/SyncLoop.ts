import type {
  CategoryWireOperation,
  SyncOutcome,
} from '@corelive/desktop-contract/category-sync'
import type { CompletionSyncTransport } from '@corelive/desktop-contract/offline-sync'
import type { CompletionSyncReceipt } from '@corelive/desktop-contract/offline-workspace'
import { toLocalDayKey } from '@corelive/live-editor/day'

import { isSyncAuthenticationError } from './createSyncTransport'
import type { TokenBroker } from './TokenBroker'
import type { WorkspaceView } from './workspace-worker-protocol'
import type { WorkspaceWorkerClient } from './WorkspaceWorkerClient'

/** The dashboard accepts at most 100 operations per `completed.syncApply` request. */
const COMPLETION_BATCH_SIZE = 100

/** Batches sent per pass; a backlog continues in a follow-up pass after a 20 ms pause. */
const COMPLETION_BATCHES_PER_PASS = 8

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
  /** The verified email stored in the binding at attach time (EA2). */
  displayEmail?: () => string | null
  /** Redacted log sink: codes, ids and counts only (DX7). */
  log?: (line: string) => void
  random?: () => number
  /** Bound on how long {@link SyncLoop.stop} waits for an in-flight request (C9). */
  settleTimeoutMs?: number
}

/** Mutable result of one pass: the delay before the next pass is scheduled. */
interface PassOutcome {
  delay: number
}

/**
 * Sends durable category and completion operations in bounded, account-bound background passes.
 * One ordered outbox for both kinds, one backoff and one in-flight marker: category batches
 * (`category.syncApply`) always go before completion batches (D4).
 * UI commands/reconnection/session changes call {@link wake}; local editing never
 * waits for this loop. Every awaited boundary rechecks the account generation.
 * @example const loop = new SyncLoop(options); loop.wake()
 */
export class SyncLoop {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private again = false
  private stopped = false
  private failures = 0
  private abort: AbortController | null = null
  private runPromise: Promise<void> | null = null
  /** Whether this pass sent category operations, so a quick follow-up pass re-derives. */
  private sentCategories = false

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

  /**
   * Cancels network work and timers on sign-out, account transition or application shutdown.
   * It aborts the in-flight request and waits for its settlement for at most
   * `settleTimeoutMs` (5 s, C9); after the bound the request is treated as uncertain and its
   * operations stay in the outbox for the bound account (P3).
   * @returns Resolves once the pass settled or the bound elapsed.
   * @example await loop.stop()
   */
  async stop(): Promise<void> {
    this.stopped = true
    this.again = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.abort?.abort()
    const running = this.runPromise
    if (!running) return
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      running.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, this.options.settleTimeoutMs ?? 5000)
      }),
    ])
    clearTimeout(timer)
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
    let finished!: () => void
    this.runPromise = new Promise<void>((resolve) => {
      finished = resolve
    })
    this.abort = new AbortController()
    const signal = this.abort.signal
    // Mutated by the pass so a delay chosen before a late failure still applies.
    const outcome: PassOutcome = { delay: 50000 }
    try {
      await this.syncPass(context, signal, outcome)
    } catch (error) {
      this.failedPass(context, error)
    } finally {
      this.runPromise = null
      finished()
      this.finishPass(outcome.delay)
    }
  }

  /**
   * One authorized pass: category recovery/refresh, bounded batches, then the settle checkpoint.
   * Returns early (leaving the idle delay) whenever the account context is replaced.
   * @param outcome - Receives the delay before the next pass.
   * @example await this.syncPass(context, signal, outcome)
   */
  private async syncPass(
    context: SyncAccountContext,
    signal: AbortSignal,
    outcome: PassOutcome,
  ): Promise<void> {
    const transport = await this.authorizedTransport(context)
    if (!transport) return
    if (!(await this.recoverOrRefreshCategories(context, transport, signal)))
      return
    await this.drainBatches(context, transport, signal)
    if (!this.current(context)) return
    const sendable = await this.countSendable(context)
    if (sendable === null) return
    await this.settlePass(context, transport, signal, sendable, outcome)
  }

  /**
   * EA4: uncertain category operations are recovered from receipts before any category refresh (C19).
   * @returns False when the pass must stop (context replaced or refresh abandoned).
   * @example if (!(await this.recoverOrRefreshCategories(context, transport, signal))) return
   */
  private async recoverOrRefreshCategories(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
  ): Promise<boolean> {
    const uncertain = await this.recoverCategoryReceipts(
      context,
      transport,
      signal,
    )
    if (!this.current(context)) return false
    return (
      uncertain || (await this.refreshCategories(context, transport, signal))
    )
  }

  /**
   * Sends category batches first (dependents become sendable as receipts add server ids), then
   * a bounded number of completion batches so an offline backlog cannot monopolize the actor.
   * @example await this.drainBatches(context, transport, signal)
   */
  private async drainBatches(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
  ): Promise<void> {
    this.sentCategories = false
    for (let batch = 0; batch < 8 && this.current(context); batch++) {
      if (!(await this.sendCategoryBatch(context, transport, signal))) break
    }
    for (
      let batch = 0;
      batch < COMPLETION_BATCHES_PER_PASS && this.current(context);
      batch++
    ) {
      if (!(await this.sendBatch(context, transport, signal))) break
    }
  }

  /**
   * Counts the work still sendable or uncertain across completions and categories.
   * @returns The count, or null when the account context changed while counting.
   * @example const sendable = await this.countSendable(context)
   */
  private async countSendable(
    context: SyncAccountContext,
  ): Promise<number | null> {
    const remaining = await context.worker.call('pending', { limit: 1 })
    const categoryWork = await context.worker.call('categoryPending', {
      limit: 1,
    })
    if (!this.current(context)) return null
    return (
      remaining.uncertain.length +
      remaining.sendable +
      categoryWork.sendable.length +
      categoryWork.uncertain.length
    )
  }

  /**
   * Finishes a pass: count checkpoint, "synced" mark when nothing is sendable, status and delay.
   * @param sendable - Result of {@link SyncLoop.countSendable}.
   * @param outcome - Receives a short follow-up delay when more work may remain.
   * @example await this.settlePass(context, transport, signal, 0, outcome)
   */
  private async settlePass(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
    sendable: number,
    outcome: PassOutcome,
  ): Promise<void> {
    // A large first upload drains in short, bounded passes; the count checkpoint waits for the end.
    if (!sendable && (await this.refreshCheckpoint(context, transport, signal)))
      outcome.delay = 20
    // C22: a pass with nothing sendable left counts as synced; dependency-waiting work does not block it.
    if (!sendable) {
      const view = await context.worker.call('markSynced', {
        accountId: context.ownerId,
        at: Date.now(),
      })
      if (!this.current(context)) return
      this.options.onView(view, context.generation)
    }
    this.options.onStatus('idle', context.generation)
    this.failures = 0
    // A receipt can change the merge base (adopt, revert); re-derive on a quick follow-up pass.
    if (sendable || this.sentCategories) outcome.delay = 20
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
    const refreshed = await context.worker.call('reconcile', {
      accountId: context.ownerId,
      displayEmail: this.options.displayEmail?.() ?? null,
      categories: bootstrap.categories,
      deletions: bootstrap.deletions,
    })
    if (!this.current(context)) return false
    this.options.onView(refreshed, context.generation)
    return true
  }

  /**
   * Looks up uncertain category receipts before any refresh or replay (EA4).
   * A lookup that finds nothing is counted; three of them surface "Waiting for the dashboard".
   * @returns True while some category operation is still uncertain after the lookup.
   * @example const uncertain = await this.recoverCategoryReceipts(context, transport, signal)
   */
  private async recoverCategoryReceipts(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
  ): Promise<boolean> {
    const { uncertain } = await context.worker.call('categoryPending', {
      limit: 16,
    })
    if (!uncertain.length) return false
    const ids = uncertain.map((entry) => entry.operation.operationId)
    const found = await transport.categoryReceipts(
      { operationIds: ids },
      signal,
    )
    if (!this.current(context)) return true
    this.assertCategoryReceipts(found.receipts, ids)
    if (found.receipts.length)
      await this.commitCategoryReceipts(context, found.receipts)
    const answered = new Set(
      found.receipts.map((receipt) => receipt.operationId),
    )
    const missing = ids.filter((id) => !answered.has(id))
    if (missing.length && this.current(context)) {
      const view = await context.worker.call('noteCategoryQuery', {
        accountId: context.ownerId,
        operationIds: missing,
      })
      if (this.current(context)) this.options.onView(view, context.generation)
    }
    return missing.length > 0
  }

  /** Commits category receipts durably before publishing progress (EA16: by `operationId` only).
   * @example await this.commitCategoryReceipts(context, receipts)
   */
  private async commitCategoryReceipts(
    context: SyncAccountContext,
    receipts: SyncOutcome[],
  ): Promise<void> {
    const view = await context.worker.call('categoryReceipts', {
      accountId: context.ownerId,
      receipts,
    })
    if (this.current(context)) this.options.onView(view, context.generation)
  }

  /**
   * Sends one category batch: frozen payloads of still-uncertain operations are replayed
   * byte-identically (EA3) together with newly frozen sendable ones; a dependent never shares a
   * batch with what it waits on. A non-401 4xx resends a multi-op batch once as single ops and
   * parks only those rejected alone (E3).
   * @returns Whether another category batch may make progress.
   * @example const more = await this.sendCategoryBatch(context, transport, signal)
   */
  private async sendCategoryBatch(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
  ): Promise<boolean> {
    const work = await context.worker.call('categoryPending', { limit: 16 })
    if (!this.current(context)) return false
    const replay = work.uncertain.flatMap((entry) =>
      entry.wire ? [entry.wire] : [],
    )
    const room = Math.max(0, 16 - replay.length)
    const frozen = room
      ? await context.worker.call('markCategorySent', {
          accountId: context.ownerId,
          operationIds: work.sendable
            .slice(0, room)
            .map((entry) => entry.operation.operationId),
        })
      : []
    if (!this.current(context)) return false
    const operations: CategoryWireOperation[] = [
      ...replay,
      ...frozen.flatMap((entry) => (entry.wire ? [entry.wire] : [])),
    ]
    if (!operations.length) return false
    this.sentCategories = true
    const ids = operations.map((operation) => operation.operationId)
    let receipts: SyncOutcome[]
    try {
      receipts = (await transport.categoryApply({ operations }, signal))
        .receipts
    } catch (error) {
      if (!isClientRejection(error)) throw error
      receipts = await this.isolateRejected(
        context,
        transport,
        operations,
        signal,
      )
    }
    this.assertCategoryReceipts(receipts, ids)
    // C9/EA16: a receipt that arrives after detach still retires its own operations.
    await this.commitCategoryReceipts(context, receipts)
    // A short answer means uncertainty; the next pass recovers it instead of hammering.
    return this.current(context) && receipts.length === operations.length
  }

  /**
   * E3: resends a rejected multi-operation batch as single operations, once. Only operations the
   * server rejects alone are parked (`CATEGORY_SYNC_REJECTED`); the others keep sending.
   * @returns Receipts of the operations that were answered.
   * @example const receipts = await this.isolateRejected(context, transport, operations, signal)
   */
  private async isolateRejected(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    operations: CategoryWireOperation[],
    signal: AbortSignal,
  ): Promise<SyncOutcome[]> {
    const receipts: SyncOutcome[] = []
    const parked: string[] = []
    for (const operation of operations) {
      if (operations.length === 1) {
        parked.push(operation.operationId)
        continue
      }
      try {
        const single = await transport.categoryApply(
          { operations: [operation] },
          signal,
        )
        receipts.push(...single.receipts)
      } catch (error) {
        if (!isClientRejection(error)) throw error
        parked.push(operation.operationId)
      }
    }
    if (parked.length) {
      this.options.log?.(
        `CATEGORY_SYNC_REJECTED procedure=category.syncApply count=${parked.length} operations=${parked.join(',')}`,
      )
      const view = await context.worker.call('parkCategory', {
        accountId: context.ownerId,
        operationIds: parked,
      })
      if (this.current(context)) this.options.onView(view, context.generation)
    }
    return receipts
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
      accountId: context.ownerId,
      receipts,
    })
    if (this.current(context)) this.options.onView(view, context.generation)
  }

  /**
   * Dispatches at most {@link COMPLETION_BATCH_SIZE} durable operations: uncertain ones are looked up first, then the
   * worker derives and freezes the next sendable keeps (D1, EA3) and replays any uncertain ones
   * byte for byte.
   * @example const more = await this.sendBatch(context, transport, signal)
   */
  private async sendBatch(
    context: SyncAccountContext,
    transport: CompletionSyncTransport,
    signal: AbortSignal,
  ): Promise<boolean> {
    let pending = await context.worker.call('pending', {
      limit: COMPLETION_BATCH_SIZE,
    })
    if (
      !this.current(context) ||
      !(pending.uncertain.length + pending.sendable)
    )
      return false
    if (pending.uncertain.length) {
      await this.recoverReceipts(
        context,
        transport,
        pending.uncertain.map((entry) => entry.operation.operationId),
        signal,
      )
      if (!this.current(context)) return false
      pending = await context.worker.call('pending', {
        limit: COMPLETION_BATCH_SIZE,
      })
      if (
        !this.current(context) ||
        !(pending.uncertain.length + pending.sendable)
      )
        return false
    }
    const confirmed = await context.worker.call('markSentBatch', {
      accountId: context.ownerId,
      limit: COMPLETION_BATCH_SIZE,
    })
    if (!this.current(context)) return false
    // The frozen server-id payload is what goes on the wire, byte for byte, on every retry (EA3).
    const operations = confirmed.flatMap((entry) =>
      entry.wire ? [entry.wire] : [],
    )
    if (!operations.length) return true
    const response = await transport.apply({ operations }, signal)
    // C9/EA16: a receipt that arrives after detach still retires its own operations by operationId.
    if (!this.current(context)) {
      this.assertReceipts(
        response.receipts,
        operations.map((operation) => operation.operationId),
        true,
      )
      await this.commitReceipts(context, response.receipts)
      return false
    }
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
      accountId: context.ownerId,
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
   * @example this.finishPass(outcome.delay)
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

  /** Refuses foreign or duplicate category acknowledgements; a missing one means "uncertain" (EA3).
   * @example this.assertCategoryReceipts(receipts, requestedIds)
   */
  private assertCategoryReceipts(
    receipts: SyncOutcome[],
    requested: string[],
  ): void {
    const ids = new Set(receipts.map((receipt) => receipt.operationId))
    if (
      ids.size !== receipts.length ||
      receipts.some(
        (receipt) =>
          receipt.kind !== 'category' ||
          !requested.includes(receipt.operationId),
      )
    )
      throw new Error('Invalid category synchronization acknowledgement')
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

/**
 * Recognizes a non-401 client rejection (4xx) that retrying cannot fix (E3, DX7).
 *
 * @param error - Anything a transport call threw.
 * @returns True for HTTP 400-499 except 401.
 * @example isClientRejection({ status: 400 }) // true
 */
function isClientRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status =
    'status' in error && typeof error.status === 'number' ? error.status : null
  return status !== null && status >= 400 && status < 500 && status !== 401
}
