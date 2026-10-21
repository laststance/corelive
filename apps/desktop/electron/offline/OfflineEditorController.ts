import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { OfflineRecoveryPreview } from '@corelive/desktop-contract/offline-editor-api'
import type { CompletionSyncTransport } from '@corelive/desktop-contract/offline-sync'
import {
  OfflinePreferencesSchema,
  WorkspaceCommandSchema,
  type OfflineCommandResult,
  type OfflineEditorSnapshot,
  type OfflinePreferences,
  type WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace'

import {
  CompletionSyncLoop,
  type SyncAccountContext,
} from './CompletionSyncLoop'
import { isSyncAuthenticationError } from './createSyncTransport'
import {
  OfflineAccountRegistry,
  type OfflineAccountRegistryState,
} from './OfflineAccountRegistry'
import type { TokenBroker } from './TokenBroker'
import type { WorkspaceView } from './workspace-worker-protocol'
import {
  WorkspaceWorkerClient,
  WorkspaceWorkerError,
} from './WorkspaceWorkerClient'

type Actor = Pick<WorkspaceWorkerClient, 'call' | 'close'>
type AccountContext = Omit<SyncAccountContext, 'worker'> & { worker: Actor }
type SettingsWaiter = {
  ownerId: string
  generation: number
  resolve: (preferences: OfflinePreferences) => void
  reject: () => void
  timer: ReturnType<typeof setTimeout>
}
type ControllerOptions = {
  directory: string
  workerScript: string | URL
  broker: Pick<TokenBroker, 'acquire' | 'reset'>
  transport: (token: string) => CompletionSyncTransport
  legacyNotes: () => Record<string, string>
  requestFlush: (generation: number) => Promise<boolean>
  openSettingsForPreparation: () => void
  onSnapshot: (snapshot: OfflineEditorSnapshot) => void
  onSettingsContext: (
    accountId: string,
    generation: number,
    preferences: OfflinePreferences | null,
  ) => void
  registry?: OfflineAccountRegistry
  actor?: (ownerId: string) => Actor
}

/**
 * Owns local startup authority, account isolation and background synchronization.
 * Main creates one controller before opening the bundled panel. UI IPC must validate
 * its window/frame before calling these generation-bound methods. Remembered account
 * IDs never authenticate an API request; only the broker plus verified bootstrap do.
 * @example const controller = new OfflineEditorController(options); await controller.initialize()
 */
export class OfflineEditorController {
  private readonly registry: OfflineAccountRegistry
  private readonly actors = new Map<string, Actor>()
  private readonly failedDrafts = new Map<
    string,
    Extract<WorkspaceCommand, { type: 'save' }>
  >()
  private readonly loop: CompletionSyncLoop
  private registryState: OfflineAccountRegistryState | null = null
  private context: AccountContext | null = null
  private draining: AccountContext | null = null
  private recovery: AccountContext | null = null
  private verifiedOwner: string | null = null
  private preparingOwner: string | null | undefined
  private generation = 0
  private logoutBarrier: Promise<void> | null = null
  private settingsWaiter: SettingsWaiter | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private clearTimer: ReturnType<typeof setTimeout> | null = null
  private preparationFailures = 0
  private snapshot: OfflineEditorSnapshot = { phase: 'opening', generation: 0 }

  constructor(private readonly options: ControllerOptions) {
    this.registry =
      options.registry ?? new OfflineAccountRegistry(options.directory)
    this.loop = new CompletionSyncLoop({
      context: () => this.context,
      broker: options.broker,
      transport: options.transport,
      legacyNotes: options.legacyNotes,
      onView: (view, generation) => this.publishView(view, generation),
      onStatus: (sync, generation) => {
        if (generation === this.generation && this.snapshot.phase === 'ready')
          this.publish({ ...this.snapshot, sync })
      },
      onCategories: (_deletions, generation) => {
        if (
          generation !== this.generation ||
          !this.context ||
          this.snapshot.phase !== 'ready'
        )
          return
        this.verifiedOwner = this.context.ownerId
        this.options.onSettingsContext(
          this.context.ownerId,
          generation,
          this.snapshot.workspace.preferences,
        )
      },
    })
  }

  /** Opens a prepared account entirely from disk, then starts optional network work.
   * @example await controller.initialize()
   */
  async initialize(): Promise<void> {
    try {
      this.registryState = await this.registry.read()
      const ownerId = this.registryState.activeAccountId
      if (!ownerId) {
        this.publish({
          phase: this.registryState.lastAccountId
            ? 'locked'
            : 'needs-preparation',
          generation: this.generation,
        })
        // Explicit logout remains locked; only the first upgraded preparation discovers an existing session.
        if (!this.registryState.lastAccountId) this.retryPreparation()
        return
      }
      const worker = this.actor(ownerId)
      const context = { ownerId, generation: this.generation, worker }
      this.recovery = context
      const view = await worker.call('open', null)
      this.context = context
      this.recovery = null
      this.publishView(view, this.generation)
      this.loop.wake()
    } catch {
      await this.publishRecovery()
    }
  }

  /** Returns a stable cached projection without waiting for network or reading full history.
   * @example const snapshot = controller.getSnapshot()
   */
  getSnapshot(): OfflineEditorSnapshot {
    return this.snapshot
  }

  /** Handles a trusted login/settings session notification; canonical ownership is verified separately.
   * @example controller.authenticated('user_123')
   */
  authenticated(ownerId: string, fromLogin = false): void {
    // A stale Settings session report after explicit logout cannot silently unlock the account.
    if (this.snapshot.phase === 'locked' && !fromLogin) return
    if (this.context?.ownerId === ownerId) {
      this.loop.wake()
      return
    }
    if (this.preparingOwner === ownerId) return
    void this.prepare(ownerId)
  }

  /** Session expiry pauses synchronization while preserving the active local workspace.
   * @example controller.sessionUnavailable()
   */
  sessionUnavailable(): void {
    this.options.broker.reset()
    if (this.snapshot.phase === 'ready')
      this.publish({ ...this.snapshot, sync: 'sign-in-required' })
  }

  /** Retries first preparation or synchronization; a prepared workspace never returns to onboarding.
   * @example controller.retryPreparation()
   */
  retryPreparation(): void {
    if (this.context) {
      void this.clearDue(this.context)
      this.loop.wake()
      return
    }
    if (this.preparingOwner !== undefined) return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    void this.prepare(null)
  }

  /**
   * Commits a generation-bound editor command. During an account transition only
   * a challenged final draft save may finish in the departing account partition.
   * @example await controller.command(generation, command)
   */
  async command(
    generation: number,
    input: unknown,
  ): Promise<OfflineCommandResult> {
    const parsed = WorkspaceCommandSchema.safeParse(input)
    if (!parsed.success) return { ok: false, reason: 'invalid-command' }
    const command = parsed.data
    const context =
      this.context?.generation === generation
        ? this.context
        : command.type === 'save' && this.draining?.generation === generation
          ? this.draining
          : null
    if (!context) return { ok: false, reason: 'account-changed' }
    try {
      const { writtenDraft, ...view } = await context.worker.call(
        'command',
        command,
      )
      if (command.type === 'save') this.failedDrafts.delete(context.ownerId)
      const current = this.context === context && generation === this.generation
      if (current) {
        this.publishView(view, generation)
        if (!['save', 'select', 'clear', 'preferences'].includes(command.type))
          this.loop.wake()
      }
      return {
        ok: true,
        generation,
        revision: view.revision,
        workspace: current ? view : null,
        ...(current ? { writtenDraft } : {}),
      }
    } catch (error) {
      const reason =
        error instanceof WorkspaceWorkerError ? error.reason : 'storage-failed'
      if (command.type === 'save' && reason !== 'revision-conflict')
        this.failedDrafts.set(context.ownerId, command)
      return { ok: false, reason }
    }
  }

  /** Returns the verified account's settings authority; no other account receives its preferences.
   * @example controller.settingsContext(accountId)
   */
  settingsContext(
    ownerId: string,
  ): { generation: number; preferences: OfflinePreferences | null } | null {
    if (this.verifiedOwner !== ownerId) return null
    return {
      generation: this.generation,
      preferences:
        this.snapshot.phase === 'ready' && this.context?.ownerId === ownerId
          ? this.snapshot.workspace.preferences
          : null,
    }
  }

  /** Accepts the fully hydrated Settings source only for its current preparation challenge.
   * @example controller.provideSettings(accountId, generation, preferences)
   */
  provideSettings(
    ownerId: string,
    generation: number,
    input: unknown,
  ): boolean {
    const pending = this.settingsWaiter
    if (
      !pending ||
      pending.ownerId !== ownerId ||
      pending.generation !== generation ||
      generation !== this.generation ||
      this.verifiedOwner !== ownerId
    )
      return false
    const parsed = OfflinePreferencesSchema.safeParse(input)
    if (!parsed.success) return false
    clearTimeout(pending.timer)
    this.settingsWaiter = null
    pending.resolve(parsed.data)
    return true
  }

  /** Applies an explicit field patch after Settings has hydrated from main's authoritative copy.
   * @example await controller.patchSettings(accountId, generation, command)
   */
  async patchSettings(
    ownerId: string,
    generation: number,
    command: Extract<WorkspaceCommand, { type: 'preferences' }>,
  ): Promise<OfflineCommandResult> {
    if (this.verifiedOwner !== ownerId || this.context?.ownerId !== ownerId)
      return { ok: false, reason: 'account-changed' }
    return this.command(generation, command)
  }

  /** Locks startup authority before remote sign-out; failed final saving cancels the explicit action.
   * @example if (await controller.signOut()) await clerk.signOut()
   */
  async signOut(): Promise<boolean> {
    if (this.logoutBarrier) return false
    const generation = this.generation
    if (!(await this.options.requestFlush(generation))) return false
    if (generation !== this.generation) return false
    if (this.logoutBarrier) return false
    // Preparation/recovery must wait until the durable lock's outcome invalidates their generation.
    let releaseBarrier!: () => void
    this.logoutBarrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve
    })
    try {
      this.registryState = await this.registry.lock()
      this.generation++
      this.context = null
      this.draining = null
      this.recovery = null
      this.verifiedOwner = null
      this.preparingOwner = undefined
      this.cancelPreparation()
      this.loop.stop()
      this.options.broker.reset()
      this.publish({ phase: 'locked', generation: this.generation })
      return true
    } catch {
      return false
    } finally {
      this.logoutBarrier = null
      releaseBarrier()
    }
  }

  /** Provides bounded recovery/sync inspection only to the currently selected account generation.
   * @example await controller.details(generation, 0, 50)
   */
  async details(generation: number, offset: number, limit: number) {
    return this.requireContext(generation).worker.call('details', {
      offset,
      limit,
    })
  }

  /** Reads a specific owned draft for revision-conflict repair without changing the visible category.
   * @example await controller.draft(generation, categoryId)
   */
  async draft(generation: number, categoryId: number) {
    return this.requireContext(generation).worker.call('draft', { categoryId })
  }

  /** Keeps every eligible restart Undo available beyond the small initial toast projection.
   * @example await controller.undoHistory(generation, 20, 50)
   */
  async undoHistory(generation: number, offset: number, limit: number) {
    return this.requireContext(generation).worker.call('undoHistory', {
      offset,
      limit,
    })
  }

  /** Lists preserved older-binary changes only inside the selected account's recovery panel.
   * @example await controller.recoveryCopies(generation, 0, 50)
   */
  async recoveryCopies(generation: number, offset: number, limit: number) {
    return this.requireContext(generation).worker.call('recoveryCopies', {
      offset,
      limit,
    })
  }

  /** Returns only the current account's export; main owns any save-dialog destination.
   * @example const data = await controller.export(generation)
   */
  async export(generation: number): Promise<string> {
    const context = this.context ?? this.recovery
    if (
      !context ||
      context.generation !== generation ||
      generation !== this.generation
    )
      throw new WorkspaceWorkerError('account-changed')
    return context.worker.call('export', null)
  }

  /** Previews a validated recovery generation without writing or resetting the workspace.
   * @example await controller.previewRecovery(generation)
   */
  async previewRecovery(generation: number): Promise<OfflineRecoveryPreview> {
    if (
      !this.recovery ||
      this.recovery.generation !== generation ||
      generation !== this.generation
    )
      throw new WorkspaceWorkerError('account-changed')
    return this.recovery.worker.call('previewRecovery', null)
  }

  /** Restores only after the renderer's explicit confirmation; preserves the invalid primary file.
   * @example await controller.recover(generation)
   */
  async recover(generation: number): Promise<boolean> {
    const context = this.recovery
    if (
      !context ||
      context.generation !== generation ||
      generation !== this.generation
    )
      return false
    try {
      const view = await context.worker.call('recover', null)
      // An absent barrier must not yield before activation can be enqueued.
      while (this.logoutBarrier) await this.logoutBarrier
      if (generation !== this.generation) return false
      if (this.registryState?.activeAccountId !== context.ownerId) {
        if (this.verifiedOwner !== context.ownerId) return false
        this.registryState = await this.registry.activateVerified(
          context.ownerId,
        )
      }
      if (generation !== this.generation) return false
      this.context = context
      this.recovery = null
      this.publishView(view, generation)
      this.loop.wake()
      return true
    } catch {
      return false
    }
  }

  /** Flushes before ordinary quit; a storage error keeps the editor open for Retry/Copy writing.
   * @example if (await controller.shutdown()) app.quit()
   */
  async shutdown(): Promise<boolean> {
    if (!(await this.options.requestFlush(this.generation))) return false
    this.generation++
    this.context = null
    this.cancelPreparation()
    this.loop.stop()
    this.options.broker.reset()
    await Promise.all(
      [...this.actors.values()].map(async (actor) => {
        await actor.call('open', null).catch(() => undefined)
        await actor.close()
      }),
    )
    this.actors.clear()
    return true
  }

  /** Verifies the session, opens or prepares its partition, then publishes durable readiness.
   * @example await this.prepare('user_123')
   */
  private async prepare(expectedOwner: string | null): Promise<void> {
    const previous = this.context
    const flush = previous
      ? this.options.requestFlush(previous.generation)
      : Promise.resolve(true)
    this.draining = previous
    this.context = null
    this.recovery = null
    const generation = ++this.generation
    this.cancelPreparation()
    this.loop.stop()
    this.options.broker.reset()
    this.verifiedOwner = null
    this.preparingOwner = expectedOwner
    this.publish({ phase: 'preparing', generation })
    try {
      const flushed = await flush
      if (generation !== this.generation) return
      this.draining = null
      if (previous) this.registryState = await this.registry.lock()
      if (!flushed) throw new WorkspaceWorkerError('storage-failed')
      const token = await this.options.broker.acquire(expectedOwner, generation)
      if (generation !== this.generation) return
      if (token.status !== 'ready')
        throw new WorkspaceWorkerError(
          token.status === 'signed-out' ? 'sign-in-required' : 'offline',
        )
      const bootstrap = await this.options
        .transport(token.credential.token)
        .bootstrap()
      if (generation !== this.generation) return
      this.assertPreparationAccount(
        bootstrap.accountId,
        token.credential.accountId,
        expectedOwner,
      )
      const ownerId = bootstrap.accountId
      this.verifiedOwner = ownerId
      this.preparingOwner = ownerId
      const worker = this.actor(ownerId)
      const context = { ownerId, generation, worker }
      this.recovery = context
      let view: WorkspaceView
      try {
        view = await worker.call('open', null)
        view = await worker.call('categories', {
          categories: bootstrap.categories,
          deletions: bootstrap.deletions,
          legacyNotes: this.options.legacyNotes(),
        })
      } catch (error) {
        if (
          !(error instanceof WorkspaceWorkerError) ||
          error.reason !== 'missing' ||
          this.registryState?.preparedAccounts.includes(ownerId)
        )
          throw error
        const preferences = await this.waitForSettings(ownerId, generation)
        if (generation !== this.generation) return
        view = await worker.call('prepare', {
          ownerId,
          deviceId: this.registryState?.deviceId ?? randomUUID(),
          categories: bootstrap.categories,
          preferences,
          legacyNotes: this.options.legacyNotes(),
        })
      }
      // Recheck after a real wait; yielding on null would let logout overtake activation.
      while (this.logoutBarrier) await this.logoutBarrier
      if (generation !== this.generation) return
      this.registryState = await this.registry.activateVerified(ownerId)
      if (generation !== this.generation) return
      this.context = context
      this.recovery = null
      this.preparingOwner = undefined
      this.preparationFailures = 0
      this.publishView(view, generation)
      this.options.onSettingsContext(ownerId, generation, view.preferences)
      this.loop.wake()
    } catch (error) {
      await this.preparationFailed(error, generation)
    }
  }

  /** Requires broker and API identity to match the requested account before opening its files.
   * @example this.assertPreparationAccount(apiOwner, tokenOwner, expectedOwner)
   */
  private assertPreparationAccount(
    owner: string,
    tokenOwner: string,
    expectedOwner: string | null,
  ): void {
    if (owner !== tokenOwner || (expectedOwner && owner !== expectedOwner))
      throw new WorkspaceWorkerError('sign-in-required')
  }

  /** Chooses recovery or a bounded preparation retry without unlocking a stale account generation.
   * @example await this.preparationFailed(error, generation)
   */
  private async preparationFailed(
    error: unknown,
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation) return
    this.preparingOwner = undefined
    const reason =
      error instanceof WorkspaceWorkerError
        ? error.reason
        : isSyncAuthenticationError(error)
          ? 'sign-in-required'
          : 'preparation-failed'
    if (
      [
        'missing',
        'invalid',
        'exists',
        'recovery-missing',
        'storage-failed',
      ].includes(reason)
    )
      await this.publishRecovery(reason)
    else {
      this.recovery = null
      this.publish({
        phase: this.registryState?.lastAccountId
          ? 'locked'
          : 'needs-preparation',
        generation,
        reason,
      })
      // Resume the interrupted connected preparation automatically; explicit logout never enters this path.
      this.preparationFailures++
      this.retryTimer = setTimeout(
        () => {
          this.retryTimer = null
          this.retryPreparation()
        },
        Math.min(60000, 1000 * 2 ** Math.min(this.preparationFailures, 6)),
      )
      this.retryTimer.unref?.()
    }
  }

  /** Starts a bounded handshake with the existing remote Settings document, never with the auth broker.
   * @example const preferences = await this.waitForSettings(ownerId, generation)
   */
  private async waitForSettings(
    ownerId: string,
    generation: number,
  ): Promise<OfflinePreferences> {
    return new Promise<OfflinePreferences>((resolve, reject) => {
      const fail = (): void => {
        if (this.settingsWaiter?.generation === generation)
          this.settingsWaiter = null
        reject(new WorkspaceWorkerError('preparation-failed'))
      }
      const timer = setTimeout(fail, 15000)
      timer.unref?.()
      this.settingsWaiter = {
        ownerId,
        generation,
        resolve,
        reject: fail,
        timer,
      }
      this.options.openSettingsForPreparation()
      this.options.onSettingsContext(ownerId, generation, null)
    })
  }

  /** Cancels stale preparation callbacks before an account transition or quit.
   * @example this.cancelPreparation()
   */
  private cancelPreparation(): void {
    if (this.clearTimer) clearTimeout(this.clearTimer)
    this.clearTimer = null
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    if (this.settingsWaiter) {
      clearTimeout(this.settingsWaiter.timer)
      this.settingsWaiter.reject()
      this.settingsWaiter = null
    }
  }

  /** Creates exactly one storage writer per account in this process.
   * @example const actor = this.actor(ownerId)
   */
  private actor(ownerId: string): Actor {
    let actor = this.actors.get(ownerId)
    if (!actor) {
      actor =
        this.options.actor?.(ownerId) ??
        new WorkspaceWorkerClient({
          directory: join(this.options.directory, 'workspaces'),
          ownerId,
          script: this.options.workerScript,
        })
      this.actors.set(ownerId, actor)
    }
    return actor
  }

  /** Rejects stale UI requests before any account-specific information is read.
   * @example const context = this.requireContext(generation)
   */
  private requireContext(generation: number): AccountContext {
    if (!this.context || generation !== this.generation)
      throw new WorkspaceWorkerError('account-changed')
    return this.context
  }

  /** Publishes only monotonically newer views for the active account generation.
   * @example this.publishView(view, generation)
   */
  private publishView(view: WorkspaceView, generation: number): void {
    if (
      !this.context ||
      this.context.ownerId !== view.ownerId ||
      generation !== this.generation
    )
      return
    if (
      this.snapshot.phase === 'ready' &&
      this.snapshot.workspace.revision > view.revision
    )
      return
    this.publish({
      phase: 'ready',
      generation,
      workspace: view,
      sync: this.snapshot.phase === 'ready' ? this.snapshot.sync : 'offline',
      ...(this.failedDrafts.has(view.ownerId)
        ? { unsavedDraft: this.failedDrafts.get(view.ownerId)! }
        : {}),
    })
    if (this.verifiedOwner === view.ownerId)
      this.options.onSettingsContext(view.ownerId, generation, view.preferences)
    if (this.clearTimer) clearTimeout(this.clearTimer)
    this.clearTimer = null
    const now = Date.now()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    // Expiry and day changes are local clock events, even without another edit or network response.
    const next = Math.min(
      now + 60000,
      midnight.getTime(),
      view.nextClearAt ?? Infinity,
      view.nextUndoAt === null ? Infinity : view.nextUndoAt + 1,
    )
    this.scheduleClear(this.context, Math.max(0, next - now))
  }

  /** Clears acknowledged completed lines on schedule even if the renderer is hidden or restarted.
   * A later edit has a different stored occurrence/text and survives the service's clear guard.
   * @example await this.clearDue(context)
   */
  private async clearDue(context: AccountContext): Promise<void> {
    try {
      const view = await context.worker.call('clearDue', null)
      if (this.context === context) this.publishView(view, context.generation)
    } catch {
      if (this.context === context && this.snapshot.phase === 'ready') {
        this.publish({ ...this.snapshot, storageError: true })
        this.scheduleClear(context, 3000)
      }
    }
  }

  /** Binds delayed-clear retries to the current account, never a departing account's renderer.
   * @example this.scheduleClear(context, 500)
   */
  private scheduleClear(context: AccountContext, delay: number): void {
    if (this.clearTimer) clearTimeout(this.clearTimer)
    this.clearTimer = setTimeout(
      () => {
        this.clearTimer = null
        if (this.context === context) void this.clearDue(context)
      },
      Math.min(delay, 2147483647),
    )
    this.clearTimer.unref?.()
  }

  /** Offers validated recovery without silently resetting data or disclosing another account.
   * @example await this.publishRecovery('invalid')
   */
  private async publishRecovery(reason = 'storage-failed'): Promise<void> {
    const generation = this.generation
    let canRecover = false
    if (this.recovery)
      canRecover = await this.recovery.worker
        .call('previewRecovery', null)
        .then(
          () => true,
          () => false,
        )
    if (generation === this.generation)
      this.publish({ phase: 'recovery', generation, reason, canRecover })
  }

  /** Updates the cached UI projection; the main IPC adapter owns exact recipient validation.
   * @example this.publish(snapshot)
   */
  private publish(snapshot: OfflineEditorSnapshot): void {
    this.snapshot = snapshot
    this.options.onSnapshot(snapshot)
  }
}
