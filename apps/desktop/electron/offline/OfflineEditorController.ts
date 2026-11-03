import { join } from 'node:path'

import type {
  AccountState,
  AccountStatus,
  SignOutResult,
} from '@corelive/desktop-contract/offline-account'
import type { OfflineRecoveryPreview } from '@corelive/desktop-contract/offline-editor-api'
import type { CompletionSyncTransport } from '@corelive/desktop-contract/offline-sync'
import {
  DEVICE_OWNER_ID,
  WorkspaceCommandSchema,
  type DeviceRegistry,
  type OfflineCommandResult,
  type OfflineEditorSnapshot,
  type OfflineSyncStatus,
  type WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { migrateWorkspaceV1 } from './migrateWorkspaceV1'
import { OfflineAccountRegistry } from './OfflineAccountRegistry'
import { SyncLoop, type SyncAccountContext } from './SyncLoop'
import type { TokenBroker } from './TokenBroker'
import type { WorkspaceView } from './workspace-worker-protocol'
import {
  WorkspaceWorkerClient,
  WorkspaceWorkerError,
} from './WorkspaceWorkerClient'

type Actor = Pick<WorkspaceWorkerClient, 'call' | 'close'>
type AccountContext = Omit<SyncAccountContext, 'worker'> & { worker: Actor }
type LoopStatus = 'idle' | 'syncing' | 'offline' | 'sign-in-required'
type SessionEnd = Exclude<SignOutResult, { status: 'flush-failed' }>
type ControllerOptions = {
  directory: string
  workerScript: string | URL
  broker: Pick<TokenBroker, 'acquire' | 'reset' | 'revoke'>
  transport: (token: string) => CompletionSyncTransport
  /** Pre-offline plaintext notes, imported once by the v1 migration (D7). */
  legacyNotes: () => Record<string, string>
  requestFlush: (generation: number) => Promise<boolean>
  onSnapshot: (snapshot: OfflineEditorSnapshot) => void
  /** D3 step 4 against the default session (wraps `endLocalSession`). */
  endLocalSession: () => Promise<SessionEnd>
  registry?: OfflineAccountRegistry
  actor?: () => Actor
  /** Redacted log sink: codes, ids and counts only (DX7). */
  log?: (line: string) => void
  /** Bound on the best-effort remote revoke (D3 step 3). */
  revokeTimeoutMs?: number
  /** Bound on awaiting an in-flight sync request at sign-out (C9). */
  settleTimeoutMs?: number
}

/** Sign-out's remote revoke bound (D3 step 3). */
const REMOTE_REVOKE_TIMEOUT_MS = 5000

/**
 * Owns the device workspace, the optional account attachment and background synchronization.
 *
 * Main creates one controller before opening the bundled panel. The editor is always
 * `ready` from local disk (or `recovery`); an account only adds sync (#216 D2). UI IPC must
 * validate its window/frame before calling these generation-bound methods. A remembered or
 * payload-supplied account id never authenticates a request: `auth-set-user` is a trigger, and
 * the identity comes from an authenticated `account.whoami` call (EA2).
 * @example const controller = new OfflineEditorController(options); await controller.initialize()
 */
export class OfflineEditorController {
  private readonly registry: OfflineAccountRegistry
  private actorInstance: Actor | null = null
  private readonly failedDrafts = new Map<
    string,
    Extract<WorkspaceCommand, { type: 'save' }>
  >()
  private readonly loop: SyncLoop
  private registryState: DeviceRegistry | null = null
  private context: AccountContext | null = null
  private recovery: AccountContext | null = null
  private pendingCommands = 0
  private readonly snapshotWaiters = new Set<() => void>()
  private generation = 0
  private clearTimer: ReturnType<typeof setTimeout> | null = null
  private snapshotSequence = 0
  private loopStatus: LoopStatus = 'syncing'
  /** The verified identity of the session seen in this process run (EA1, state D). */
  private signedIn: { clerkId: string; email: string | null } | null = null
  private firstUpload: AccountStatus['firstUpload'] = null
  private signOutRun: Promise<SignOutResult> | null = null
  private sessionTail: Promise<void> = Promise.resolve()
  private snapshot: OfflineEditorSnapshot = {
    phase: 'opening',
    generation: 0,
    sequence: 0,
  }

  constructor(private readonly options: ControllerOptions) {
    this.registry =
      options.registry ?? new OfflineAccountRegistry(options.directory)
    this.loop = new SyncLoop({
      context: () => this.syncContext(),
      broker: options.broker,
      transport: options.transport,
      displayEmail: () => this.signedIn?.email ?? this.pendingEmail,
      settleTimeoutMs: options.settleTimeoutMs,
      log: options.log,
      onView: (view, generation) => this.publishView(view, generation),
      onStatus: (status, generation) => {
        if (generation !== this.generation) return
        this.loopStatus = status
        this.publishSync()
      },
    })
  }

  /** The email stored at Connect time, used until the binding carries it. */
  private pendingEmail: string | null = null

  /**
   * The context the sync loop may use: only an attached account, never a bare session (EA1).
   * @example const syncContext = this.syncContext()
   */
  private syncContext(): SyncAccountContext | null {
    const accountId = this.registryState?.attachedAccountId
    if (!accountId || !this.context || this.registryState?.signOutPending)
      return null
    return {
      ownerId: accountId,
      generation: this.context.generation,
      worker: this.context.worker,
    }
  }

  /**
   * Runs the v1 migration once, opens the device workspace from disk and, if an account is
   * attached, starts optional sync. Never waits for the network (D1, D7, EA14).
   * @example await controller.initialize()
   */
  async initialize(): Promise<void> {
    try {
      const migrated = await migrateWorkspaceV1({
        directory: this.options.directory,
        legacyNotes: this.options.legacyNotes(),
        log: this.options.log,
      })
      this.registryState = await this.registry.read()
      const worker = this.actor()
      const context = {
        ownerId: DEVICE_OWNER_ID,
        generation: this.generation,
        worker,
      }
      this.recovery = context
      if (!migrated.ok && !migrated.fileName.startsWith('device')) {
        // The v1 source is unreadable: never a fresh workspace; the files stay as they are (EA9).
        await this.publishRecovery(migrated.code)
        return
      }
      // EA1: a sign-out that crashed between detach and the session clear finishes first.
      if (this.registryState.signOutPending) await this.finishPendingSignOut()
      const view = await worker.call('open', null)
      this.context = context
      this.recovery = null
      this.publishView(view, this.generation)
      if (this.syncContext()) this.loop.wake()
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

  /**
   * Hands a replacement renderer the outcome of every already accepted command.
   * {@link OfflineEditorIPC} holds its initial read and notifications while this
   * waits, so old disk text cannot become editable before a late save is rescued.
   * Existing connected renderers continue editing while their commands run.
   * @example const snapshot = await controller.readSnapshot()
   */
  async readSnapshot(): Promise<OfflineEditorSnapshot> {
    while (this.pendingCommands > 0) {
      await new Promise<void>((resolve) => this.snapshotWaiters.add(resolve))
    }
    return this.snapshot
  }

  /**
   * Handles a trusted `auth-set-user` notification. The payload is only a trigger (EA2): main
   * confirms the account through an authenticated call with the TokenBroker token, then decides
   * between the Connect prompt (unbound Mac), attach (the bound account) and staying detached
   * (a different account, C10). Calls are serialized.
   * @param clerkId - The id the login window reported; never trusted on its own.
   * @example await controller.authenticated('user_123')
   */
  async authenticated(clerkId: string): Promise<void> {
    this.sessionTail = this.sessionTail
      .then(async () => this.handleSession(clerkId))
      .catch(() => undefined)
    await this.sessionTail
  }

  /** Verifies the identity and routes it; see {@link authenticated}. */
  private async handleSession(clerkId: string): Promise<void> {
    if (!this.context || this.signOutRun) return
    const attached = this.registryState?.attachedAccountId
    // Already attached to this account: only a wake, no identity round trip.
    if (attached === clerkId) {
      this.loop.wake()
      return
    }
    const who = await this.verifyIdentity(clerkId)
    if (!who) return
    this.signedIn = who
    const bound = await this.context.worker.call('binding', null)
    if (!bound) {
      // DA4/EA2b: an unbound Mac waits for Connect; nothing is sent to the sync endpoints.
      this.registryState = await this.registry.update({
        pendingConnect: {
          accountId: who.clerkId,
          displayEmail: who.email ?? '',
        },
        signOutPending: false,
      })
    } else if (bound.accountId === who.clerkId) {
      this.pendingEmail = who.email
      this.registryState = await this.registry.update({
        attachedAccountId: who.clerkId,
        pendingConnect: null,
        signOutPending: false,
      })
      this.loop.wake()
    } else if (attached) {
      // C10: another account signed in over the bound one; detach and stay detached.
      await this.loop.stop()
      this.registryState = await this.registry.update({
        attachedAccountId: null,
      })
    }
    this.publishSync()
  }

  /**
   * Confirms the signed-in account with an authenticated server call (EA2).
   * @returns The server's `{ clerkId, email }`, or null when unverifiable or mismatched
   * (`AUTH_IDENTITY_MISMATCH` is logged without any identity).
   * @example const who = await this.verifyIdentity(payload.clerkId)
   */
  private async verifyIdentity(
    claimedClerkId: string,
  ): Promise<{ clerkId: string; email: string | null } | null> {
    const token = await this.options.broker.acquire(null, this.generation)
    if (token.status !== 'ready') return null
    let who: Awaited<ReturnType<CompletionSyncTransport['whoami']>>
    try {
      who = await this.options.transport(token.credential.token).whoami()
    } catch {
      return null
    }
    if (
      who.clerkId !== claimedClerkId ||
      who.clerkId !== token.credential.accountId
    ) {
      this.options.log?.('AUTH_IDENTITY_MISMATCH')
      return null
    }
    return who
  }

  /**
   * Attaches the pending account after the user pressed Connect this Mac (DA4, EA2b). The binding
   * is written by the first sync pass; nothing was sent before this.
   * @returns Whether a pending Connect existed and was accepted.
   * @example if (await controller.connect()) showUploading()
   */
  async connect(): Promise<boolean> {
    const pending = this.registryState?.pendingConnect
    if (!pending || !this.context || this.signOutRun) return false
    const bound = await this.context.worker.call('binding', null)
    if (bound && bound.accountId !== pending.accountId) return false
    // DA4: the progress count is every unsent keep, archived history included.
    const total = await this.context.worker.call('pendingTotal', null)
    this.firstUpload = { state: 'uploading', count: total }
    this.pendingEmail = pending.displayEmail || null
    this.registryState = await this.registry.update({
      attachedAccountId: pending.accountId,
      pendingConnect: null,
      signOutPending: false,
    })
    this.loop.wake()
    this.publishSync()
    return true
  }

  /**
   * Declines the pending Connect (DA4): the prompt is dropped and the session ends locally.
   * @returns The sign-out result; offline, the remote revoke is simply skipped.
   * @example await controller.notNow()
   */
  async notNow(): Promise<SignOutResult> {
    this.registryState = await this.registry.update({ pendingConnect: null })
    return this.signOut()
  }

  /**
   * What Settings ▸ Account renders (DA3, X1): derived from the registry, the binding and the
   * session verified in this run.
   * @example const status = controller.accountStatus()
   */
  accountStatus(): Omit<AccountStatus, 'signIn'> {
    const view =
      this.snapshot.phase === 'ready' ? this.snapshot.workspace : null
    const binding = view?.binding ?? null
    const pending = this.registryState?.pendingConnect ?? null
    let state: AccountState = 'never-attached'
    if (this.registryState?.attachedAccountId) state = 'attached'
    else if (binding)
      state =
        this.signedIn && this.signedIn.clerkId !== binding.accountId
          ? 'other-account'
          : 'signed-out'
    return {
      state,
      boundEmail: binding?.displayEmail ?? null,
      signedInEmail:
        state === 'other-account' ? (this.signedIn?.email ?? null) : null,
      waitingCount: view?.pendingCount ?? 0,
      needsALookCount: view?.needsALookCount ?? 0,
      lastSyncedAt: binding?.lastSyncedAt ?? null,
      pendingConnect: pending ? { displayEmail: pending.displayEmail } : null,
      firstUpload: this.firstUpload,
    }
  }

  /**
   * One implementation behind `account.signOut` and `auth-logout` (C23, D3 steps 1-4).
   * 1. flush the editor to disk (a failure cancels with no side effect, SIGNOUT_FLUSH_FAILED);
   * 2. journal `signOutPending` (EA1), stop the loop (<= 5 s, C9) and persist the detach;
   * 3. best-effort remote revoke (<= 5 s; skipped offline, SIGNOUT_REMOTE_REVOKE_SKIPPED);
   * 4. end the local session (origin-scoped storage + cookie sweep + read-back, DX6).
   * The editor stays `ready` with identical content; the binding, outbox and `lastSyncedAt`
   * are untouched (P3), also when a different account was signed in (state D).
   * @returns `signed-out`, `signed-out-residual` (names/domains only) or `flush-failed`.
   * @example const result = await controller.signOut()
   */
  async signOut(): Promise<SignOutResult> {
    this.signOutRun ??= this.runSignOut().finally(() => {
      this.signOutRun = null
    })
    return this.signOutRun
  }

  private async runSignOut(): Promise<SignOutResult> {
    const generation = this.generation
    const flushed = await this.options
      .requestFlush(generation)
      .catch(() => false)
    if (!flushed || generation !== this.generation) return this.flushFailed()
    try {
      this.registryState = await this.registry.update({
        signOutPending: true,
        pendingConnect: null,
      })
    } catch {
      return this.flushFailed()
    }
    await this.loop.stop()
    this.registryState = await this.registry.update({ attachedAccountId: null })
    this.signedIn = null
    this.firstUpload = null
    this.pendingEmail = null
    this.loopStatus = 'idle'
    this.publishSync()
    const revoked = await this.options.broker
      .revoke(
        generation,
        this.options.revokeTimeoutMs ?? REMOTE_REVOKE_TIMEOUT_MS,
      )
      .catch(() => 'skipped' as const)
    if (revoked === 'skipped')
      this.options.log?.('SIGNOUT_REMOTE_REVOKE_SKIPPED')
    // Destroy the hidden document first so it cannot refresh the session during the sweep.
    this.options.broker.reset()
    return this.finishPendingSignOut()
  }

  /** Logs the cancelled sign-out; no state was changed (DX7). */
  private flushFailed(): SignOutResult {
    this.options.log?.('SIGNOUT_FLUSH_FAILED')
    return { status: 'flush-failed', code: 'SIGNOUT_FLUSH_FAILED' }
  }

  /**
   * Runs D3 step 4 and clears the journal only when nothing survived (EA1, DX6). Called by
   * {@link signOut}, by {@link initialize} for a marker left by a crash, and by
   * {@link clearAgain}.
   * @returns The session-end result.
   * @example await this.finishPendingSignOut()
   */
  private async finishPendingSignOut(): Promise<SessionEnd> {
    this.options.broker.reset()
    const result = await this.options.endLocalSession()
    if (result.status === 'signed-out')
      this.registryState = await this.registry.update({ signOutPending: false })
    return result
  }

  /**
   * The "Clear again" action after a residual result: reruns only D3 step 4 and its read-back.
   * @example await controller.clearAgain()
   */
  async clearAgain(): Promise<SessionEnd> {
    return this.finishPendingSignOut()
  }

  /**
   * Drops the finished first-upload progress once Settings has shown it, so the DA4 line
   * "<N> keeps are on your dashboard" appears once.
   * @example controller.acknowledgeFirstUpload()
   */
  acknowledgeFirstUpload(): void {
    if (this.firstUpload?.state !== 'done') return
    this.firstUpload = null
    this.publishSync()
  }

  /** Session expiry pauses synchronization while preserving the local workspace.
   * @example controller.sessionUnavailable()
   */
  sessionUnavailable(): void {
    this.options.broker.reset()
    if (this.registryState?.attachedAccountId) {
      this.loopStatus = 'sign-in-required'
      this.publishSync()
    }
  }

  /** Retries synchronization and due clearing; editing is never affected (D2).
   * @example controller.retrySync()
   */
  retrySync(): void {
    if (!this.context) return
    void this.clearDue(this.context)
    if (this.syncContext()) this.loop.wake()
  }

  /**
   * Commits a generation-bound editor command. The departing account remains
   * active until its challenged final save finishes, then old commands are rejected.
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
      this.context?.generation === generation ? this.context : null
    if (!context) return { ok: false, reason: 'account-changed' }
    this.pendingCommands++
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
      const detail =
        error instanceof WorkspaceWorkerError ? error.detail : undefined
      if (command.type === 'save' && reason !== 'revision-conflict') {
        this.failedDrafts.set(context.ownerId, command)
        // A replacement renderer must receive rescued writing before any later refresh.
        if (this.snapshot.phase === 'ready')
          this.publishView(this.snapshot.workspace, generation)
      }
      return { ok: false, reason, ...(detail ? { detail } : {}) }
    } finally {
      this.finishCommand()
    }
  }

  /**
   * Releases initial snapshot readers only after the last accepted command settles.
   * {@link OfflineEditorController.command} calls this for success and failure.
   * @example this.finishCommand()
   */
  private finishCommand(): void {
    this.pendingCommands--
    if (this.pendingCommands !== 0) return
    for (const resolve of this.snapshotWaiters) resolve()
    this.snapshotWaiters.clear()
  }

  /**
   * Protects main-retained writing when no renderer can answer a flush challenge.
   * {@link OfflineEditorIPC.flush} checks this for an unavailable renderer, and
   * {@link OfflineEditorController.shutdown} rechecks after awaiting any flush.
   * @param generation - The account generation challenged before the asynchronous exit.
   * @returns Whether no command or failed-save rescue can be discarded by that exit.
   * @example if (!controller.canLeaveWithoutRenderer(generation)) return false
   */
  canLeaveWithoutRenderer(generation: number): boolean {
    return (
      generation === this.generation &&
      this.pendingCommands === 0 &&
      this.failedDrafts.size === 0
    )
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

  /**
   * Sync details data for the page reached from Settings ▸ Account (DA7, C31): the only place
   * conflict and refusal items appear. Actions run as `syncDetailAction` commands.
   * @example const details = await controller.syncDetails(generation)
   */
  async syncDetails(generation: number) {
    return this.requireContext(generation).worker.call('syncDetails', null)
  }

  /** Reads a specific owned draft for revision-conflict repair without changing the visible category.
   * @example await controller.draft(generation, categoryId)
   */
  async draft(generation: number, categoryId: string) {
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
      if (generation !== this.generation) return false
      this.context = context
      this.recovery = null
      this.publishView(view, generation)
      if (this.syncContext()) this.loop.wake()
      return true
    } catch {
      return false
    }
  }

  /** Flushes before ordinary quit; a storage error keeps the editor open for Retry/Copy writing.
   * @example if (await controller.shutdown()) app.quit()
   */
  async shutdown(): Promise<boolean> {
    const generation = this.generation
    if (
      !(await this.options.requestFlush(generation)) ||
      !this.canLeaveWithoutRenderer(generation)
    )
      return false
    this.generation++
    this.context = null
    if (this.clearTimer) clearTimeout(this.clearTimer)
    this.clearTimer = null
    await this.loop.stop()
    this.options.broker.reset()
    const actor = this.actorInstance
    this.actorInstance = null
    if (actor) {
      await actor.call('open', null).catch(() => undefined)
      await actor.close()
    }
    return true
  }

  /** Creates exactly one storage writer for the device workspace in this process.
   * @example const actor = this.actor()
   */
  private actor(): Actor {
    this.actorInstance ??=
      this.options.actor?.() ??
      new WorkspaceWorkerClient({
        directory: join(this.options.directory, 'workspaces'),
        ownerId: DEVICE_OWNER_ID,
        script: this.options.workerScript,
      })
    return this.actorInstance
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
      sync: this.syncStatus(view),
      ...(this.failedDrafts.has(view.ownerId)
        ? { unsavedDraft: this.failedDrafts.get(view.ownerId)! }
        : {}),
    })
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

  /**
   * Derives the D2/X1 sync status. Detached (never attached, signed out, another account) is
   * always `local-only`, so the editor shows only its save line (DA2); "sign in to sync" is
   * reserved for an attached account whose session expired.
   * @example const sync = this.syncStatus(view)
   */
  private syncStatus(view: WorkspaceView): OfflineSyncStatus {
    const base = {
      waitingCount: view.pendingCount,
      lastSyncedAt: view.binding?.lastSyncedAt ?? null,
      boundEmail: view.binding?.displayEmail ?? null,
    }
    if (!this.registryState?.attachedAccountId)
      return { state: 'local-only', ...base }
    switch (this.loopStatus) {
      case 'syncing':
        return { state: 'syncing', ...base }
      case 'offline':
        return { state: 'waiting', ...base }
      case 'sign-in-required':
        return { state: 'sign-in-to-sync', ...base }
      case 'idle':
        return { state: view.pendingCount > 0 ? 'waiting' : 'synced', ...base }
    }
  }

  /** Re-publishes the current ready snapshot with a recomputed sync status and first-upload progress.
   * @example this.publishSync()
   */
  private publishSync(): void {
    if (this.snapshot.phase !== 'ready') return
    const { workspace } = this.snapshot
    const sync = this.syncStatus(workspace)
    if (
      this.firstUpload?.state === 'uploading' &&
      this.loopStatus === 'idle' &&
      workspace.pendingCount === 0
    )
      this.firstUpload = { state: 'done', count: this.firstUpload.count }
    this.publish({ ...this.snapshot, sync })
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
    this.snapshot = { ...snapshot, sequence: ++this.snapshotSequence }
    this.options.onSnapshot(this.snapshot)
  }
}
