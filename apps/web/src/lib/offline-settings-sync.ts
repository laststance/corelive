import type { OfflineSettingsAPI } from '@corelive/desktop-contract/offline-editor-api'
import type {
  WorkspaceCommand,
  OfflinePreferences,
} from '@corelive/desktop-contract/offline-workspace'
import {
  UserSettingsStateSchema,
  type UserSettingsState,
} from '@corelive/desktop-contract/settings'

type Patch = Partial<UserSettingsState>
type PreferenceCommand = Extract<WorkspaceCommand, { type: 'preferences' }>
type Options = {
  accountId: string
  bridge: OfflineSettingsAPI
  settings: () => UserSettingsState
  applySettings: (settings: UserSettingsState) => void
  applyTheme: (theme: string) => void
  onError: () => void
}
const keys = Object.keys(
  UserSettingsStateSchema.shape,
) as (keyof UserSettingsState)[]

/**
 * Reconciles the hydrated remote Settings view with native account preferences.
 * {@link OfflineSettingsSync} forwards store/theme changes here. Incoming native
 * values never echo; user edits during an IPC read/write retain their field intent.
 * An uncertain write retries the exact command identity instead of duplicating it.
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
  private running = false
  private requested = false
  private stopped = false
  private errorReported = false
  private retry: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: Options) {
    this.observed = { ...options.settings() }
  }

  /** Records explicit store field changes; native hydration is excluded from outbound intent.
   * @example store.subscribe(() => sync.settingsChanged())
   */
  settingsChanged(): void {
    const next = this.options.settings()
    if (!this.applying) {
      for (const key of keys)
        if (next[key] !== this.observed[key])
          this.dirty = { ...this.dirty, [key]: next[key] }
    }
    this.observed = { ...next }
    if (!this.applying) this.refresh()
  }

  /** Waits for next-themes hydration before first preparation; remembers later theme edits.
   * @example sync.themeChanged(theme)
   */
  themeChanged(theme: string | undefined): void {
    if (!theme || theme === this.theme) return
    if (theme === this.applyingTheme) this.applyingTheme = undefined
    else if (this.theme !== undefined) this.dirtyTheme = theme
    this.theme = theme
    this.refresh()
  }

  /** Coalesces native notifications and local edits into one serial reconciliation pass.
   * @example bridge.onChanged(() => sync.refresh())
   */
  refresh(): void {
    if (this.stopped || !this.theme) return
    this.requested = true
    if (this.running) return
    this.running = true
    void this.drain()
  }

  /** Drops callbacks on route/account change; a new instance has a separate account binding.
   * @example sync.stop()
   */
  stop(): void {
    this.stopped = true
    if (this.retry) clearTimeout(this.retry)
  }

  /** Applies native state underneath any newer local edits, then commits only those explicit edits.
   * @example await this.reconcile()
   */
  private async reconcile(): Promise<void> {
    const context = await this.options.bridge.read(this.options.accountId)
    if (this.stopped || !context || !this.theme) return
    if (!context.preferences) {
      const prepared = await this.options.bridge.prepare(
        this.options.accountId,
        context.generation,
        { revision: 0, settings: this.options.settings(), theme: this.theme },
      )
      if (!prepared) throw new Error('Preparation changed')
      return
    }
    if (this.pending && this.pending.generation !== context.generation)
      this.pending = null
    const native = context.preferences
    this.applyNativePreferences(native)
    if (!this.pending && !Object.keys(this.dirty).length && !this.dirtyTheme)
      return
    this.pending ??= {
      generation: context.generation,
      command: {
        type: 'preferences',
        commandId: crypto.randomUUID(),
        expectedRevision: native.revision,
        patch: { ...this.dirty },
        ...(this.dirtyTheme ? { theme: this.dirtyTheme } : {}),
      },
    }
    const pending = this.pending
    const result = await this.options.bridge.patch(
      this.options.accountId,
      pending.generation,
      pending.command,
    )
    if (this.stopped) return
    if (!result.ok) {
      // A proven revision rejection is safe to rebase; an unknown IPC outcome retains its identity.
      if (['revision-conflict', 'account-changed'].includes(result.reason))
        this.pending = null
      throw new Error('Native settings save failed')
    }
    for (const key of keys)
      if (
        key in pending.command.patch &&
        this.dirty[key] === pending.command.patch[key]
      )
        delete this.dirty[key]
    if (this.dirtyTheme === pending.command.theme) this.dirtyTheme = undefined
    this.pending = null
    this.requested =
      Object.keys(this.dirty).length > 0 || this.dirtyTheme !== undefined
  }

  /** Applies the acknowledged native settings beneath edits made while IPC was pending.
   * @example this.applyNativePreferences(native)
   */
  private applyNativePreferences(native: OfflinePreferences): void {
    this.applying = true
    try {
      this.options.applySettings({ ...native.settings, ...this.dirty })
      this.observed = { ...this.options.settings() }
      if (!this.dirtyTheme && this.theme !== native.theme) {
        this.applyingTheme = native.theme
        this.options.applyTheme(native.theme)
      }
    } finally {
      this.applying = false
    }
  }

  /** Backs off failures without resetting native preferences or flooding notifications.
   * @example void this.drain()
   */
  private async drain(): Promise<void> {
    try {
      while (this.requested && !this.stopped) {
        this.requested = false
        await this.reconcile()
        this.errorReported = false
      }
    } catch {
      if (!this.stopped) {
        if (!this.errorReported) this.options.onError()
        this.errorReported = true
        if (this.retry) clearTimeout(this.retry)
        this.retry = setTimeout(() => {
          this.retry = null
          this.refresh()
        }, 3000)
      }
    } finally {
      this.running = false
    }
  }
}
