import type {
  SettingsSnapshot,
  SettingsWindowAPI,
} from '@corelive/desktop-contract/offline-editor-api'
import type { WorkspaceCommand } from '@corelive/desktop-contract/offline-workspace-v2'
import type { UserSettingsState } from '@corelive/desktop-contract/settings'

import type { CategoryCommandOutcome } from '../editor/categoryCopy'

/** Preference changes not yet acknowledged by main. */
export type PendingChange = {
  settings: Partial<UserSettingsState>
  theme?: string
}

/** The empty change; also the "nothing pending" overlay. */
export const EMPTY_CHANGE: PendingChange = { settings: {} }

/** Render-state sinks that {@link PreferenceWriter} reports into. */
export interface PreferenceWriterSinks {
  onSnapshot: (snapshot: SettingsSnapshot) => void
  /** Queued plus in-flight edits, shown on top of the stored value. */
  onOverlay: (change: PendingChange) => void
  onSaveFailed: (failed: boolean) => void
}

/** Tells whether a change carries nothing to send. */
function isEmptyChange(change: PendingChange): boolean {
  return Object.keys(change.settings).length === 0 && change.theme === undefined
}

/** Merges two unacknowledged changes; the later one wins per key. */
function mergeChange(a: PendingChange, b: PendingChange): PendingChange {
  const theme = b.theme ?? a.theme
  return {
    settings: { ...a.settings, ...b.settings },
    ...(theme !== undefined ? { theme } : {}),
  }
}

/**
 * Serial writer of revisioned preference commands for the Settings window.
 *
 * Edits apply optimistically (the overlay), travel as one `preferences` command at a time with
 * the latest value per key winning, and a revision conflict re-reads the snapshot and retries
 * once. A refused write drops the edit and reports a calm failure. Plain class, no React:
 * {@link SettingsProvider} owns one instance and mirrors its sinks into render state.
 *
 * @example
 * const writer = new PreferenceWriter(api, sinks)
 * writer.queue({ settings: { showTodayEmber: true } })
 */
export class PreferenceWriter {
  private latest: SettingsSnapshot | null = null
  private inFlight: PendingChange | null = null
  private queued: PendingChange = EMPTY_CHANGE
  private flushing = false

  constructor(
    private readonly api: SettingsWindowAPI,
    private readonly sinks: PreferenceWriterSinks,
  ) {}

  /** Re-reads the projection from main and publishes it.
   * @example await writer.refresh()
   */
  async refresh(): Promise<void> {
    const next = await this.api.snapshot()
    this.latest = next
    this.sinks.onSnapshot(next)
  }

  /** Queues an edit and starts flushing if idle.
   * @example writer.queue({ settings: {}, theme: 'dark' })
   */
  queue(change: PendingChange): void {
    this.queued = mergeChange(this.queued, change)
    this.sinks.onSaveFailed(false)
    this.publishOverlay()
    void this.flush()
  }

  /** Sends one category command and refreshes on success.
   * @example const outcome = await writer.sendCategoryCommand(command)
   */
  async sendCategoryCommand(
    command: WorkspaceCommand,
  ): Promise<CategoryCommandOutcome> {
    const current = this.latest
    if (current?.phase !== 'ready')
      return { ok: false, reason: 'account-changed' }
    const result = await this.api.categories.command(
      current.generation,
      command,
    )
    if (!result.ok)
      return {
        ok: false,
        reason: result.reason,
        ...(result.detail ? { detail: result.detail } : {}),
      }
    await this.refresh()
    return { ok: true }
  }

  /** Publishes queued plus in-flight edits to render state. */
  private publishOverlay(): void {
    this.sinks.onOverlay(
      mergeChange(this.inFlight ?? EMPTY_CHANGE, this.queued),
    )
  }

  /** Drains the queue serially; one command is in flight at a time. */
  private async flush(): Promise<void> {
    if (this.flushing) return
    this.flushing = true
    try {
      while (!isEmptyChange(this.queued)) {
        const batch = this.queued
        this.queued = EMPTY_CHANGE
        this.inFlight = batch
        this.publishOverlay()
        const saved = await this.send(batch)
        this.inFlight = null
        // A refused edit is reverted (the overlay drops it) and reported once.
        if (!saved) this.sinks.onSaveFailed(true)
        this.publishOverlay()
      }
    } finally {
      this.flushing = false
    }
  }

  /** Sends one batch, re-reading the revision and retrying once on a conflict. */
  private async send(batch: PendingChange): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = this.latest
      if (current?.phase !== 'ready') return false
      try {
        const result = await this.api.preferences.patch(current.generation, {
          type: 'preferences',
          commandId: crypto.randomUUID(),
          expectedRevision: current.preferences.revision,
          patch: batch.settings,
          ...(batch.theme !== undefined ? { theme: batch.theme } : {}),
        })
        if (result.ok) {
          const next: SettingsSnapshot = {
            ...current,
            preferences: result.preferences,
          }
          this.latest = next
          this.sinks.onSnapshot(next)
          return true
        }
        if (result.reason !== 'revision-conflict') return false
        await this.refresh()
      } catch {
        return false
      }
    }
    return false
  }
}
