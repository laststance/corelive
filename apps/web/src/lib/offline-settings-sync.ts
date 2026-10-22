import type {
  OfflineSettingsAPI,
  OfflineSettingsContext,
} from '@corelive/desktop-contract/offline-editor-api'
import type {
  WorkspaceCommand,
  OfflinePreferences,
} from '@corelive/desktop-contract/offline-workspace'
import {
  UserSettingsStateSchema,
  type UserSettingsState,
} from '@corelive/desktop-contract/settings'

import { log } from './logger'
import { PreferenceTransport } from './offline-settings-transport'

type Patch = Partial<UserSettingsState>
type PreferenceCommand = Extract<WorkspaceCommand, { type: 'preferences' }>
type Options = {
  accountId: string
  bridge: OfflineSettingsAPI
  settings: () => UserSettingsState
  applySettings: (settings: UserSettingsState) => void
  applyTheme?: (theme: string) => void
  onError?: () => void
  active?: boolean
}
type Reason =
  | 'unavailable'
  | 'preparing'
  | 'revision-conflict'
  | 'account-changed'
  | 'invalid-command'
  | 'storage-failed'
  | 'worker-unavailable'
  | 'unknown'
export type PreferenceOutcome = Readonly<{
  status: 'idle' | 'pending' | 'saved' | 'failed' | 'unknown' | 'cancelled'
  certainty: 'confirmed' | 'unconfirmed'
  keys: readonly (keyof UserSettingsState)[]
  attempt: number
  terminal: boolean
  canRestore: boolean
  reason?: Reason
  expectedRevision?: number
  observedRevision?: number
}>
export const EMPTY_PREFERENCE_OUTCOME: PreferenceOutcome = Object.freeze({
  status: 'idle',
  certainty: 'confirmed',
  keys: [],
  attempt: 0,
  terminal: false,
  canRestore: false,
})
const keys = Object.keys(
  UserSettingsStateSchema.shape,
) as (keyof UserSettingsState)[]
// This list is intentionally frozen at the pre-capability contract, not derived from the growing schema.
const LEGACY_KEYS: readonly (keyof UserSettingsState)[] = [
  'showTodayEmber',
  'liveEditorFontFamily',
  'liveEditorFontSize',
  'liveEditorTextColor',
  'liveEditorClearOnComplete',
  'liveEditorClearDelayMs',
  'liveEditorToastDurationMs',
]

/** Reconciles Settings intent with committed native preferences for one account.
 * {@link OfflineSettingsSync} owns its lifetime; route changes only pause IPC.
 * Unknown writes retain their command identity, including across a timeout or navigation.
 * @example const sync = new OfflinePreferenceSync(options); sync.themeChanged(theme)
 */
export class OfflinePreferenceSync {
  private observed: UserSettingsState
  private theme: string | undefined
  private applyingTheme: string | undefined
  private applying = false
  private dirty: Patch = {}
  private dirtyTheme: string | undefined
  private pending: { generation: number; command: PreferenceCommand } | null =
    null
  private preparation: {
    generation: number
    preferences: OfflinePreferences
    accepted: boolean
  } | null = null
  private restoring = false
  private running = false
  private requested = false
  private stopped = false
  private epoch = 0
  private intent = 0
  private correlationId = crypto.randomUUID()
  private active: boolean
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private budgetTimer: ReturnType<typeof setTimeout> | null = null
  private activeSince = 0
  private remaining = 30_000
  private attempts = 0
  private terminal = false
  private confirmed: OfflinePreferences | null = null
  private outcome = EMPTY_PREFERENCE_OUTCOME
  private listeners = new Set<() => void>()
  private transport: PreferenceTransport
  private supported: readonly (keyof UserSettingsState)[]

  constructor(private readonly options: Options) {
    this.observed = { ...options.settings() }
    this.active = options.active ?? true
    this.supported = options.bridge.supportedKeys ?? LEGACY_KEYS
    this.transport = new PreferenceTransport(() => {
      // Late replies can reconcile an unknown command, but cannot restart an exhausted cycle.
      if (!this.running) this.refresh()
    })
  }

  /** Reactivates subscriptions after a React lifecycle replay, without sharing account state.
   * @example sync.start()
   */
  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.epoch += 1
    this.running = false
    this.restoring = false
    this.active = false
    this.transport = new PreferenceTransport(() => {
      if (!this.running) this.refresh()
    })
  }

  /** Subscribes Settings rows to the cached, payload-free outcome.
   * @example useSyncExternalStore(sync.subscribe, sync.getSnapshot)
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Reads stable outcome identity for React's external-store contract.
   * @example sync.getSnapshot()
   */
  getSnapshot = (): PreferenceOutcome => this.outcome

  /** Records only supported explicit edits, excluding incoming native hydration.
   * @example store.subscribe(() => sync.settingsChanged())
   */
  settingsChanged(): void {
    const next = this.options.settings()
    let changed = false
    if (!this.applying) {
      for (const key of keys) {
        if (this.supported.includes(key) && next[key] !== this.observed[key]) {
          this.dirty = { ...this.dirty, [key]: next[key] }
          changed = true
        }
      }
    }
    this.observed = { ...next }
    if (changed) {
      this.startIntent()
      this.refresh()
    }
  }

  /** Refreshes the theme sink without replacing account-owned pending commands.
   * {@link OfflineSettingsSync} calls this after next-themes updates its setter.
   * @example sync.setThemeHandler(setTheme)
   */
  setThemeHandler(handler: (theme: string) => void): void {
    this.options.applyTheme = handler
  }

  /** Waits for theme hydration and retains later explicit mode/palette edits.
   * @example sync.themeChanged(theme)
   */
  themeChanged(theme: string | undefined): void {
    if (!theme || theme === this.theme) return
    if (theme === this.applyingTheme) this.applyingTheme = undefined
    else if (this.theme !== undefined) {
      this.dirtyTheme = theme
      this.startIntent()
    }
    this.theme = theme
    this.refresh()
  }

  /** Pauses route-restricted IPC without discarding unsent intent or command identity.
   * @example sync.setActive(pathname === '/settings')
   */
  setActive(active: boolean): void {
    if (this.stopped || this.active === active) return
    this.pauseBudget()
    this.active = active
    if (!active) this.clearRetry()
    else this.refresh()
  }

  /** Starts another bounded recovery cycle, coalescing with unresolved transports.
   * @example sync.retry()
   */
  retry(): void {
    this.startIntent()
    this.refresh()
  }

  /** Restores only a freshly confirmed value after unknown commands are reconciled.
   * @example sync.restoreConfirmed()
   */
  async restoreConfirmed(): Promise<void> {
    if (
      this.pending ||
      this.preparation ||
      this.running ||
      this.restoring ||
      !this.terminal ||
      !this.canRun()
    )
      return
    this.startIntent()
    this.restoring = true
    const intent = this.intent
    const epoch = this.epoch
    this.resumeBudget()
    try {
      const context = await this.readContext(epoch)
      // A newer edit or lifecycle supersedes this explicit restoration.
      if (
        context === undefined ||
        intent !== this.intent ||
        epoch !== this.epoch
      )
        return
      if (!context?.preferences) {
        this.fail('unavailable', true)
        return
      }
      this.dirty = {}
      this.dirtyTheme = undefined
      this.confirmed = context.preferences
      this.applyNativePreferences(context.preferences)
      this.requested = false
      this.saved()
    } catch {
      if (intent !== this.intent || epoch !== this.epoch) return
      this.fail('unknown', true)
    } finally {
      if (epoch === this.epoch) {
        this.restoring = false
        if (this.requested) this.refresh()
      }
    }
  }

  /** Coalesces notifications; they never reset attempts or the active-route budget.
   * @example bridge.onChanged(() => sync.refresh())
   */
  refresh(): void {
    if (!this.canRun() || !this.theme || this.terminal) return
    this.requested = true
    this.resumeBudget()
    if (this.running || this.restoring) return
    this.clearRetry()
    this.running = true
    void this.drain()
  }

  /** Disposes account-owned timers and listeners; late IPC cannot touch the next account.
   * @example sync.stop()
   */
  stop(): void {
    this.stopped = true
    this.epoch += 1
    this.clearRetry()
    this.pauseBudget()
    this.transport.stop()
    this.publish('cancelled', 'unconfirmed')
    this.listeners.clear()
  }

  private canRun(): boolean {
    return !this.stopped && this.active
  }

  /** Starts a user-requested budget without abandoning any unknown native command.
   * @example this.startIntent()
   */
  private startIntent(): void {
    this.intent += 1
    this.correlationId = crypto.randomUUID()
    this.pauseBudget()
    this.clearRetry()
    this.remaining = 30_000
    this.attempts = 0
    this.terminal = false
    this.publish('pending', 'unconfirmed')
  }

  /** Counts elapsed authorized-route time, excluding navigation away from Settings.
   * @example this.pauseBudget()
   */
  private pauseBudget(): void {
    if (this.budgetTimer) clearTimeout(this.budgetTimer)
    this.budgetTimer = null
    if (this.activeSince) this.remaining -= Date.now() - this.activeSince
    this.activeSince = 0
  }

  /** Bounds never-settling IPC and notification storms independently of retry scheduling.
   * @example this.resumeBudget()
   */
  private resumeBudget(): void {
    if (this.budgetTimer || !this.canRun()) return
    this.activeSince = Date.now()
    this.budgetTimer = setTimeout(
      () => this.fail('unknown', true),
      Math.max(0, this.remaining),
    )
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  /** Publishes safe diagnostics only; preference values and account identity never enter outcomes.
   * @example this.publish('pending', 'unconfirmed')
   */
  private publish(
    status: PreferenceOutcome['status'],
    certainty: PreferenceOutcome['certainty'],
    reason?: Reason,
  ): void {
    this.outcome = {
      status,
      certainty,
      reason,
      keys: Object.keys(this.dirty) as (keyof UserSettingsState)[],
      attempt: this.attempts,
      terminal: this.terminal,
      canRestore:
        this.terminal &&
        !this.pending &&
        !this.preparation &&
        this.confirmed !== null,
      expectedRevision: this.pending?.command.expectedRevision,
      observedRevision: this.confirmed?.revision,
    }
    for (const listener of this.listeners) listener()
  }

  /** Schedules bounded retry, preserving uncertain writes for exact idempotent replay.
   * @example this.fail('unknown')
   */
  private fail(reason: Reason, exhausted = false): void {
    if (!this.canRun()) return
    this.terminal = exhausted || this.attempts >= 3
    const uncertain =
      reason === 'unknown' ||
      reason === 'preparing' ||
      reason === 'worker-unavailable' ||
      reason === 'storage-failed'
    this.publish(
      uncertain ? 'unknown' : 'failed',
      uncertain ? 'unconfirmed' : 'confirmed',
      reason,
    )
    // Only the bounded terminal outcome is logged, never values or account identity.
    if (this.terminal)
      log.warn('Native preference synchronization stopped', {
        ...this.outcome,
        correlationId: this.correlationId,
        bridgeVersion: this.options.bridge.version,
        capability: this.options.bridge.supportedKeys ? 'explicit' : 'legacy',
        supportedKeys: this.supported,
        commandId: this.pending?.command.commandId,
      })
    this.options.onError?.()
    this.clearRetry()
    if (this.terminal) this.pauseBudget()
    else
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null
        this.refresh()
      }, 3000)
  }

  /** Filters both preparation and patches for older native capability contracts.
   * @example this.supportedSettings(settings)
   */
  private supportedSettings(settings: UserSettingsState): UserSettingsState {
    // Older preloads accept a smaller wire shape and fill their own schema defaults.
    return Object.fromEntries(
      keys
        .filter((key) => this.supported.includes(key))
        .map((key) => [key, settings[key]]),
    ) as UserSettingsState
  }

  /** Treats prepare acceptance as pending until native reads expose a committed snapshot.
   * @example await this.prepare(context, epoch)
   */
  private async prepare(
    context: OfflineSettingsContext,
    epoch: number,
  ): Promise<void> {
    this.preparation ??= {
      generation: context.generation,
      preferences: {
        revision: 0,
        settings: this.supportedSettings(this.options.settings()),
        theme: this.theme!,
      },
      accepted: false,
    }
    const preparing = this.preparation
    if (!preparing.accepted) {
      const accepted = await this.transport.observe(
        'prepare',
        String(context.generation),
        async () =>
          this.options.bridge.prepare(
            this.options.accountId,
            context.generation,
            preparing.preferences,
          ),
      )
      if (!this.canRun() || epoch !== this.epoch) return
      this.transport.consume('prepare')
      if (!accepted) {
        this.preparation = null
        this.fail('account-changed')
        return
      }
      preparing.accepted = true
    }
    this.fail('preparing')
  }

  /** Reads only within the current account lifecycle and retains paused late replies.
   * @example const context = await this.readContext(epoch)
   */
  private async readContext(
    epoch: number,
  ): Promise<OfflineSettingsContext | null | undefined> {
    const context = await this.transport.observe(
      'read',
      this.options.accountId,
      async () => this.options.bridge.read(this.options.accountId),
    )
    if (!this.canRun() || this.terminal || epoch !== this.epoch)
      return undefined
    this.transport.consume('read')
    return context
  }

  /** Reconciles confirmed native state beneath newer local intent, then sends a revisioned patch.
   * @example await this.reconcile(epoch)
   */
  private async reconcile(epoch: number): Promise<void> {
    const context = await this.readContext(epoch)
    if (context === undefined) return
    if (!context) {
      this.fail('unavailable')
      return
    }
    // A changed native generation retires commands from the old workspace.
    if (this.pending && this.pending.generation !== context.generation)
      this.pending = null
    if (this.preparation && this.preparation.generation !== context.generation)
      this.preparation = null
    if (!context.preferences) {
      await this.prepare(context, epoch)
      return
    }
    this.confirmed = context.preferences
    this.preparation = null
    this.applyNativePreferences(context.preferences)
    if (!this.pending && !Object.keys(this.dirty).length && !this.dirtyTheme) {
      this.saved()
      return
    }
    this.pending ??= {
      generation: context.generation,
      command: {
        type: 'preferences',
        commandId: crypto.randomUUID(),
        expectedRevision: context.preferences.revision,
        patch: { ...this.dirty },
        ...(this.dirtyTheme ? { theme: this.dirtyTheme } : {}),
      },
    }
    await this.commit(epoch)
  }

  /** Replays an immutable command until main confirms its outcome; newer edits stay dirty.
   * @example await this.commit(epoch)
   */
  private async commit(epoch: number): Promise<void> {
    const pending = this.pending!
    const result = await this.transport.observe(
      'patch',
      pending.command.commandId,
      async () =>
        this.options.bridge.patch(
          this.options.accountId,
          pending.generation,
          pending.command,
        ),
    )
    if (
      !this.canRun() ||
      this.terminal ||
      this.pending !== pending ||
      epoch !== this.epoch
    )
      return
    this.transport.consume('patch')
    if (!result.ok) {
      const reason = normalizeReason(result.reason)
      // Worker loss and storage flush failure can happen after commit; preserve identity.
      if (
        reason === 'revision-conflict' ||
        reason === 'account-changed' ||
        reason === 'invalid-command'
      )
        this.pending = null
      this.fail(reason)
      return
    }
    if (result.generation !== pending.generation) {
      this.pending = null
      this.fail('account-changed')
      return
    }
    for (const key of keys) {
      if (
        key in pending.command.patch &&
        this.dirty[key] === pending.command.patch[key]
      )
        delete this.dirty[key]
    }
    if (this.dirtyTheme === pending.command.theme) this.dirtyTheme = undefined
    this.confirmed = result.preferences
    this.pending = null
    this.requested =
      Object.keys(this.dirty).length > 0 || this.dirtyTheme !== undefined
    if (!this.requested) this.saved()
  }

  private saved(): void {
    this.clearRetry()
    this.pauseBudget()
    this.publish('saved', 'confirmed')
  }

  /** Hydrates only supported fields underneath the latest local edits, without echoing native values.
   * @example this.applyNativePreferences(native)
   */
  private applyNativePreferences(native: OfflinePreferences): void {
    this.applying = true
    try {
      const settings = {
        ...this.options.settings(),
        ...this.supportedSettings(native.settings),
        ...this.dirty,
      }
      this.options.applySettings(settings)
      this.observed = { ...this.options.settings() }
      if (!this.dirtyTheme && this.theme !== native.theme) {
        this.applyingTheme = native.theme
        this.options.applyTheme?.(native.theme)
      }
    } finally {
      this.applying = false
    }
  }

  /** Serializes attempts and consumes settled failures while retaining timed-out requests.
   * @example void this.drain()
   */
  private async drain(): Promise<void> {
    const epoch = this.epoch
    try {
      while (
        this.requested &&
        this.canRun() &&
        !this.terminal &&
        epoch === this.epoch
      ) {
        this.requested = false
        this.attempts += 1
        this.publish('pending', 'unconfirmed')
        await this.reconcile(epoch)
        if (this.retryTimer) break
      }
    } catch {
      if (epoch !== this.epoch) return
      // A rejected transport is settled; a timeout remains in the transport registry.
      this.transport.consume('read')
      this.transport.consume('prepare')
      this.transport.consume('patch')
      this.fail('unknown')
    } finally {
      if (epoch === this.epoch) this.running = false
    }
  }
}

/** Normalizes the open native reason string without exposing raw IPC payloads in UI.
 * @example normalizeReason('revision-conflict')
 */
function normalizeReason(reason: string): Reason {
  switch (reason) {
    case 'revision-conflict':
    case 'account-changed':
    case 'invalid-command':
    case 'storage-failed':
    case 'worker-unavailable':
      return reason
    default:
      return 'unknown'
  }
}
