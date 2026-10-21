import type { OfflineEditorAPI } from '@corelive/desktop-contract/offline-editor-api'
import type {
  DraftRow,
  OfflineDraft,
  OfflineDraftRecord,
  OfflineCommandResult,
  OfflineEditorSnapshot,
  WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace'

import {
  applyDraftEdits,
  diffDraftRows,
  editDraftRows,
  remapEditorSelection,
  type DraftEdit,
} from './draftEdits'
import { getKeepLineIntent, type EditorSelection } from './editorInput'
import { lineStartOffset, normalizeCompletedTitle } from './liveEditorUtils'
import type { TextEditRange } from './rowIdentity'

type Buffer = {
  ownerId: string
  generation: number
  categoryId: number
  base: OfflineDraft
  rows: DraftRow[]
  version: number
  acknowledged: number
  edits: DraftEdit[]
  selection: EditorSelection
  selectionInputVersion: number
  composing: boolean
  error: string | null
  saveFailed: boolean
}
type PendingCommand = {
  buffer: Buffer
  generation: number
  command: WorkspaceCommand
  version: number
  submittedRows: DraftRow[]
  noticeTitle?: string
  rebaseAttempts?: number
}
export type CompletionNotice = { id: string; title: string; undoUntil: number }
export interface DurableEditorSnapshot {
  main: OfflineEditorSnapshot
  text: string
  save: 'saved' | 'saving' | 'failed'
  error: string | null
  busy: boolean
  exitPending: boolean
  unsavedCategoryCount: number
  selection: EditorSelection
  selectionRevision: number
  notice: CompletionNotice | null
}
const EMPTY_SELECTION: EditorSelection = { start: 0, end: 0, direction: 'none' }
const rowsText = (rows: DraftRow[]): string =>
  rows.map((row) => row.text).join('\n')

/**
 * Owns the bundled editor's live buffer, ordered durable commands and acknowledgement-aware rebase.
 * React subscribes with useSyncExternalStore; the supplied host exposes named operations only.
 * Network state never chooses another editor. Private departing-account buffers stay outside
 * published snapshots, and a late ACK cannot mark newer typing saved or clear its occurrence.
 * @example const store = new DurableEditorStore(workspaceBridge); await store.connect()
 */
export class DurableEditorStore {
  private main: OfflineEditorSnapshot = { phase: 'opening', generation: 0 }
  private snapshot: DurableEditorSnapshot = {
    main: this.main,
    text: '',
    save: 'saved',
    error: null,
    busy: false,
    exitPending: false,
    unsavedCategoryCount: 0,
    selection: EMPTY_SELECTION,
    selectionRevision: 0,
    notice: null,
  }
  private readonly listeners = new Set<() => void>()
  private readonly buffers = new Set<Buffer>()
  private current: Buffer | null = null
  private pending: PendingCommand | null = null
  private deferred: Extract<OfflineEditorSnapshot, { phase: 'ready' }> | null =
    null
  private readonly uncertain = new Map<string, PendingCommand>()
  private readonly completing = new Set<string>()
  private tail: Promise<unknown> = Promise.resolve()
  private queued = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private cleanups: (() => void)[] = []
  private connection = 0
  private selectionRevision = 0
  private notice: CompletionNotice | null = null
  private exitPending = false

  constructor(readonly host: OfflineEditorAPI) {}

  /** Returns the cached immutable render snapshot until an observable update is published.
   * @example useSyncExternalStore(store.subscribe, store.getSnapshot)
   */
  getSnapshot = (): DurableEditorSnapshot => this.snapshot

  /** Adds a React listener with a stable subscription identity.
   * @example const unsubscribe = store.subscribe(render)
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Subscribes before reading so startup cannot miss a prepared snapshot or flush challenge.
   * @example await store.connect()
   */
  async connect(): Promise<void> {
    this.disconnect()
    const connection = ++this.connection
    this.cleanups = [
      this.host.subscribe((snapshot) => {
        if (connection === this.connection) this.receive(snapshot)
      }),
      this.host.onFlush((request) => {
        this.exitPending = true
        this.publish()
        void this.flush(request.generation)
          .then(async (saved) => {
            const accepted = await this.host.replyFlush(request, saved)
            if (!saved || !accepted) {
              this.exitPending = false
              this.publish()
            }
          })
          .catch(() => {
            this.exitPending = false
            this.publish()
          })
      }),
      this.host.onShown(() => {
        this.exitPending = false
        this.publish()
      }),
    ]
    try {
      const snapshot = await this.host.snapshot()
      if (connection === this.connection) this.receive(snapshot)
    } catch {
      if (connection === this.connection)
        this.receive({
          phase: 'recovery',
          generation: this.main.generation,
          reason: 'bridge-unavailable',
          canRecover: false,
        })
    }
  }

  /** Detaches UI subscriptions; native hide keeps this store mounted and uses the flush challenge.
   * @example store.disconnect()
   */
  disconnect(): void {
    this.connection++
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.cancelAutosave()
  }

  /** Applies a browser edit immediately and schedules the existing 400ms autosave delay.
   * @example store.edit(nextText, capturedSelection)
   */
  edit(text: string, range?: TextEditRange): void {
    const buffer = this.current
    if (
      !buffer ||
      this.main.phase !== 'ready' ||
      rowsText(buffer.rows) === text
    )
      return
    const change = editDraftRows(buffer.rows, text, range, ++buffer.version)
    buffer.rows = change.rows
    buffer.edits.push(change.edit)
    this.coalesce(buffer)
    this.publish()
    this.scheduleAutosave()
  }

  /** Records the live DOM selection without rerendering on each arrow key or pointer movement.
   * @example store.setSelection(selection)
   */
  setSelection(selection: EditorSelection): void {
    if (!this.current) return
    if (!this.sameSelection(this.current.selection, selection))
      this.current.selectionInputVersion++
    this.current.selection = { ...selection }
  }

  /** Returns current selection for Details close/focus restoration, including unrendered caret movement.
   * @example const selection = store.getSelection()
   */
  getSelection(): EditorSelection {
    return this.current?.selection ?? EMPTY_SELECTION
  }

  /** Prevents autosave/exit from committing an unfinished IME composition as a completed line.
   * @example store.setComposing(event.type === 'compositionstart')
   */
  setComposing(composing: boolean): void {
    if (!this.current) return
    this.current.composing = composing
    if (composing) this.cancelAutosave()
    else {
      if (
        this.deferred &&
        !this.pending &&
        !this.uncertain.has(this.current.ownerId)
      ) {
        const deferred = this.deferred
        this.deferred = null
        this.receive(deferred)
      }
      this.reconcileCurrent()
      this.scheduleAutosave()
    }
  }

  /** Flushes every live draft in the challenged account generation before a native exit.
   * @example const saved = await store.flush(request.generation)
   */
  async flush(generation = this.main.generation): Promise<boolean> {
    this.cancelAutosave()
    const captures = [...this.buffers]
      .filter((buffer) => buffer.generation === generation)
      .map((buffer) => ({ buffer, version: buffer.version }))
    if (captures.some(({ buffer }) => buffer.composing)) return false
    return this.enqueue(async () => {
      for (const { buffer, version } of captures)
        if (!(await this.saveThrough(buffer, generation, version))) return false
      // Resolving a previous-generation command can expose newer retained edits in that same account.
      const started = Date.now()
      for (let pass = 0; pass < 8 && Date.now() - started < 10000; pass++) {
        const remaining = [...this.buffers].filter(
          (buffer) =>
            buffer.generation === generation && buffer.edits.length > 0,
        )
        if (!remaining.length) return true
        for (const buffer of remaining)
          if (
            buffer.composing ||
            !(await this.saveThrough(buffer, generation, buffer.version))
          )
            return false
      }
      if (
        [...this.buffers].some(
          (buffer) =>
            buffer.generation === generation && buffer.edits.length > 0,
        )
      )
        return false
      return true
    })
  }

  /** Captures a keep intent now; mark/clear/count/Undo feedback follows only a durable ACK.
   * @example await store.completeAt(textarea.selectionStart)
   */
  async completeAt(caret: number): Promise<boolean> {
    const buffer = this.current
    if (!buffer || buffer.composing || this.main.phase !== 'ready') return false
    const intent = getKeepLineIntent(rowsText(buffer.rows), caret)
    if (!intent) return false
    const row = buffer.rows[intent.lineIndex]
    if (!row || row.completionId || this.completing.has(row.id)) return false
    const generation = buffer.generation
    const version = buffer.version
    const capturedSelectionVersion = buffer.selectionInputVersion
    const completedAt = Date.now()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const completionId = crypto.randomUUID()
    this.completing.add(row.id)
    this.cancelAutosave()
    try {
      return await this.enqueue(async () => {
        const earlier = this.uncertain.get(buffer.ownerId)
        const recoveringSameKeep =
          earlier?.command.type === 'complete' &&
          earlier.command.rowId === row.id
        if (
          !(await this.saveThrough(buffer, generation, version)) ||
          !this.authorized(buffer, generation)
        )
          return false
        if (
          recoveringSameKeep ||
          buffer.base.rows.some(
            (candidate) => candidate.id === row.id && candidate.completionId,
          )
        )
          return true
        if (!buffer.base.rows.some((candidate) => candidate.id === row.id))
          return this.fail(
            buffer,
            'The line changed before it could be completed. Try again.',
          )
        const result = await this.send({
          buffer,
          generation,
          version: buffer.acknowledged,
          submittedRows: buffer.base.rows,
          noticeTitle: normalizeCompletedTitle(intent.title),
          command: {
            type: 'complete',
            commandId: crypto.randomUUID(),
            completionId,
            categoryId: buffer.categoryId,
            baseRevision: buffer.base.revision,
            rowId: row.id,
            completedAt,
            timezone,
          },
        })
        if (
          result &&
          this.current === buffer &&
          version === buffer.version &&
          capturedSelectionVersion === buffer.selectionInputVersion &&
          this.main.phase === 'ready' &&
          this.main.workspace.preferences.settings.liveEditorClearOnComplete
        ) {
          const stillVisible = buffer.rows.findIndex(
            (candidate) => candidate.id === row.id,
          )
          const position = lineStartOffset(
            rowsText(buffer.rows),
            stillVisible < 0 ? intent.lineIndex : stillVisible + 1,
          )
          buffer.selection = {
            start: position,
            end: position,
            direction: 'none',
          }
          this.selectionRevision++
          this.publish()
        }
        return result
      })
    } finally {
      this.completing.delete(row.id)
      this.publish()
    }
  }

  /** Flushes writing before selection, Undo or a repair changes its durable rows/references.
   * @example await store.command({ type: 'undo', commandId, completionId })
   */
  async command(command: WorkspaceCommand): Promise<boolean> {
    const buffer = this.current
    if (!buffer || this.main.phase !== 'ready' || buffer.composing) return false
    const generation = buffer.generation
    const captures = [...this.buffers]
      .filter(
        (item) =>
          item.ownerId === buffer.ownerId && item.generation === generation,
      )
      .map((item) => ({ buffer: item, version: item.version }))
    this.cancelAutosave()
    return this.enqueue(async () => {
      for (const capture of captures)
        if (
          !(await this.saveThrough(capture.buffer, generation, capture.version))
        )
          return false
      if (!this.authorized(buffer, generation)) return false
      return this.send({
        buffer,
        generation,
        version: buffer.acknowledged,
        submittedRows: buffer.base.rows,
        command,
      })
    })
  }

  /** Retries an uncertain command with the original identity, then saves the newest text.
   * @example await store.retry()
   */
  async retry(): Promise<boolean> {
    const saved = await this.flush()
    await this.host.retry().catch(() => undefined)
    return saved
  }

  /** Copies the exact live buffer, including edits that failed to reach disk.
   * @example await store.copyWriting()
   */
  async copyWriting(): Promise<boolean> {
    if (!this.current) return false
    return this.host
      .copyWriting(this.current.generation, rowsText(this.current.rows))
      .catch(() => false)
  }

  /** Copies all retained unsaved categories with explicit headings, separately from the exact-text action.
   * @example await store.copyUnsavedWriting()
   */
  async copyUnsavedWriting(): Promise<boolean> {
    if (!this.current) return false
    const current = this.current
    const other = [...this.buffers].filter(
      (buffer) =>
        buffer !== current &&
        buffer.ownerId === current.ownerId &&
        buffer.generation === current.generation &&
        (buffer.edits.length > 0 || buffer.saveFailed),
    )
    const text = other.length
      ? [current, ...other]
          .map((buffer) => {
            const name =
              this.main.phase === 'ready'
                ? this.main.workspace.categories.find(
                    (category) => category.id === buffer.categoryId,
                  )?.name
                : undefined
            return `${name ?? `Category ${buffer.categoryId}`}\n${rowsText(buffer.rows)}`
          })
          .join('\n\n')
      : rowsText(current.rows)
    return this.host.copyWriting(current.generation, text).catch(() => false)
  }

  /** Dismisses only presentation; durable restart Undo remains available until its original deadline.
   * @example store.dismissNotice()
   */
  dismissNotice(): void {
    this.notice = null
    this.publish()
  }

  /** Serializes renderer intents while allowing typing to continue in the live buffer.
   * @example return this.enqueue(async () => this.saveThrough(buffer, generation, version))
   */
  private async enqueue(work: () => Promise<boolean>): Promise<boolean> {
    this.queued++
    this.publish()
    const result = this.tail.then(work, work)
    this.tail = result.catch(() => false)
    try {
      return await result
    } catch {
      return this.current
        ? this.fail(this.current, 'Could not save writing on this Mac.')
        : false
    } finally {
      this.queued--
      if (this.current) this.coalesce(this.current)
      this.publish()
    }
  }

  /** Saves only the captured edit version, preserving later typing for the next ordered transaction.
   * @example await this.saveThrough(buffer, generation, capturedVersion)
   */
  private async saveThrough(
    buffer: Buffer,
    generation: number,
    version: number,
    rebaseAttempts = 0,
  ): Promise<boolean> {
    const uncertain = this.uncertain.get(buffer.ownerId)
    if (uncertain) {
      if (uncertain.generation !== generation) {
        if (!this.authorized(buffer, generation)) return false
        // The same verified account can resolve its retained command after reauthentication.
        uncertain.generation = generation
        uncertain.buffer.generation = generation
      }
      if (!(await this.send(uncertain))) return false
    }
    if (
      version <= buffer.acknowledged ||
      !buffer.edits.some((edit) => edit.version <= version)
    )
      return true
    const edits = buffer.edits.filter((edit) => edit.version <= version)
    const rows = applyDraftEdits(buffer.base.rows, edits)
    const pending: PendingCommand = {
      buffer,
      generation,
      version,
      rebaseAttempts,
      submittedRows: rows,
      command: {
        type: 'save',
        commandId: crypto.randomUUID(),
        categoryId: buffer.categoryId,
        baseRevision: buffer.base.revision,
        rows,
      },
    }
    return this.send(pending)
  }

  /** Retains the exact wire command across a lost response and publishes only generation-matched results.
   * @example await this.send(pending)
   */
  private async send(pending: PendingCommand): Promise<boolean> {
    const { buffer, generation, command } = pending
    this.pending = pending
    this.uncertain.set(buffer.ownerId, pending)
    buffer.error = null
    this.publish()
    try {
      const result = await this.withDeadline(
        this.host.command(generation, command),
      )
      if (!result.ok) return await this.rejectCommand(pending, result.reason)
      this.uncertain.delete(buffer.ownerId)
      if (command.type === 'save')
        buffer.acknowledged = Math.max(buffer.acknowledged, pending.version)
      buffer.edits = buffer.edits.filter(
        (edit) => edit.version > buffer.acknowledged,
      )
      const written =
        result.writtenDraft ??
        (command.type === 'save'
          ? {
              categoryId: buffer.categoryId,
              draft: {
                revision: command.baseRevision + 1,
                rows: pending.submittedRows,
              },
            }
          : null)
      if (written) this.acceptWrittenDraft(pending, written)
      if (result.workspace) this.acceptView(pending, result.workspace)
      this.acceptNotice(pending)
      buffer.error = null
      buffer.saveFailed = false
      return true
    } catch {
      return this.fail(
        buffer,
        'Could not confirm saving on this Mac. Retry or copy your writing.',
      )
    } finally {
      if (this.pending === pending) this.pending = null
      this.reconcileCurrent()
      this.publish()
    }
  }

  /** Rebases a definite save rejection but retains the exact command after an uncertain storage outcome.
   * @example await this.rejectCommand(pending, reason)
   */
  private async rejectCommand(
    pending: PendingCommand,
    reason: string,
  ): Promise<boolean> {
    const { buffer, generation, command } = pending
    // A definite revision conflict can rebase a save; an unknown result must keep its command identity.
    if (
      reason === 'revision-conflict' &&
      command.type === 'save' &&
      (pending.rebaseAttempts ?? 0) < 3
    ) {
      this.uncertain.delete(buffer.ownerId)
      this.pending = null
      const fresh = await this.host.draft(generation, buffer.categoryId)
      this.acceptDraft(buffer, fresh, buffer.acknowledged)
      return this.saveThrough(
        buffer,
        generation,
        pending.version,
        (pending.rebaseAttempts ?? 0) + 1,
      )
    }
    const storageFailure = [
      'storage-failed',
      'worker-unavailable',
      'invalid-reply',
    ].includes(reason)
    if (!storageFailure) this.uncertain.delete(buffer.ownerId)
    return this.fail(
      buffer,
      reason === 'revision-conflict'
        ? 'This record changed. Close the dialog and review its latest details.'
        : reason === 'undo-expired'
          ? 'Undo has expired. Your writing is still saved.'
          : reason === 'account-changed'
            ? 'The active account changed.'
            : 'Could not save writing on this Mac. Retry or copy your writing.',
      storageFailure,
    )
  }

  /** Accepts only the latest same-account workspace projection while preserving fresher sync status.
   * @example this.acceptView(pending, workspace)
   */
  private acceptView(
    pending: PendingCommand,
    workspaceResult: NonNullable<
      Extract<OfflineCommandResult, { ok: true }>['workspace']
    >,
  ): void {
    const { buffer, generation } = pending
    if (
      workspaceResult &&
      this.main.generation === generation &&
      workspaceResult.ownerId === buffer.ownerId
    ) {
      const deferred =
        this.deferred?.generation === generation ? this.deferred : null
      const sync =
        deferred?.sync ??
        (this.main.phase === 'ready' ? this.main.sync : 'offline')
      const workspace =
        deferred && deferred.workspace.revision >= workspaceResult.revision
          ? deferred.workspace
          : this.main.phase === 'ready' &&
              this.main.workspace.revision > workspaceResult.revision
            ? this.main.workspace
            : workspaceResult
      this.main = { phase: 'ready', generation, workspace, sync }
      this.deferred = null
    }
  }

  /** Creates completion feedback only after an acknowledged local intent in the active generation.
   * @example this.acceptNotice(pending)
   */
  private acceptNotice(pending: PendingCommand): void {
    const { command, generation } = pending
    if (
      command.type === 'complete' &&
      pending.noticeTitle &&
      this.main.generation === generation &&
      this.main.phase === 'ready'
    ) {
      const record = this.main.workspace.recentUndo.find(
        (record) => record.id === command.completionId,
      )
      this.notice = {
        id: command.completionId,
        title: pending.noticeTitle,
        undoUntil: record?.undoUntil ?? Date.now(),
      }
    }
    if (command.type === 'undo' && this.notice?.id === command.completionId)
      this.notice = null
  }

  /** Uses a bounded acknowledgement wait; timing out never implies that the command was not committed.
   * @example const result = await this.withDeadline(host.command(generation, command))
   */
  private async withDeadline<T>(request: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Acknowledgement timed out')),
            12000,
          )
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /** Keeps account transitions private and ignores obsolete startup reads/status messages.
   * @example this.receive(snapshot)
   */
  private receive(snapshot: OfflineEditorSnapshot): void {
    if (snapshot.generation < this.main.generation) return
    if (
      snapshot.phase === 'ready' &&
      this.main.phase === 'ready' &&
      snapshot.generation === this.main.generation &&
      snapshot.workspace.revision < this.main.workspace.revision
    )
      return
    if (
      snapshot.phase === 'ready' &&
      snapshot.generation === this.main.generation &&
      ((this.pending && this.pending.generation === snapshot.generation) ||
        this.uncertain.get(snapshot.workspace.ownerId)?.generation ===
          snapshot.generation ||
        this.current?.composing)
    ) {
      if (
        !this.deferred ||
        snapshot.workspace.revision >= this.deferred.workspace.revision
      )
        this.deferred = snapshot
      return
    }
    if (snapshot.generation !== this.main.generation) {
      this.cancelAutosave()
      this.notice = null
      this.deferred = null
      this.exitPending = false
    }
    this.main = snapshot
    if (snapshot.phase !== 'ready') {
      this.current = null
      this.publish()
      return
    }
    this.reconcileCurrent()
    this.publish()
  }

  /** Reconciles a current durable view around live edits; pending commands defer base replacement.
   * @example this.reconcileCurrent()
   */
  private reconcileCurrent(): void {
    if (this.main.phase !== 'ready') return
    const { workspace, generation } = this.main
    // Reauthentication restores all retained drafts of this owner, including a failed inactive-category save.
    for (const retained of this.buffers)
      if (retained.ownerId === workspace.ownerId)
        retained.generation = generation
    let buffer = [...this.buffers].find(
      (item) =>
        item.ownerId === workspace.ownerId &&
        item.categoryId === workspace.selectedCategoryId,
    )
    if (!buffer) {
      buffer = {
        ownerId: workspace.ownerId,
        generation,
        categoryId: workspace.selectedCategoryId,
        base: workspace.draft,
        rows: workspace.draft.rows,
        version: 0,
        acknowledged: 0,
        edits: [],
        selection: { ...EMPTY_SELECTION },
        selectionInputVersion: 0,
        composing: false,
        error: null,
        saveFailed: false,
      }
      this.buffers.add(buffer)
    }
    if (this.current !== buffer) this.selectionRevision++
    buffer.generation = generation
    this.current = buffer
    if (
      this.pending?.buffer === buffer ||
      this.uncertain.has(buffer.ownerId) ||
      buffer.composing
    )
      return
    if (workspace.draft.revision >= buffer.base.revision)
      this.acceptDraft(
        buffer,
        { categoryId: workspace.selectedCategoryId, draft: workspace.draft },
        buffer.acknowledged,
      )
    if (this.main.unsavedDraft && buffer.version === 0) {
      const dirty = this.main.unsavedDraft
      if (dirty.categoryId === buffer.categoryId) {
        buffer.edits = diffDraftRows(
          buffer.base.rows,
          dirty.rows,
          ++buffer.version,
        )
        buffer.rows = applyDraftEdits(buffer.base.rows, buffer.edits)
        buffer.error = 'Writing is not saved on this Mac.'
        buffer.saveFailed = true
      }
    }
  }

  /** Applies a durable row generation while replaying only unacknowledged local edits.
   * @example this.acceptDraft(buffer, record, acknowledgedVersion)
   */
  private acceptDraft(
    buffer: Buffer,
    record: OfflineDraftRecord,
    acknowledged: number,
  ): void {
    const previous = buffer.rows
    buffer.categoryId = record.categoryId
    buffer.base = record.draft
    buffer.edits = buffer.edits.filter((edit) => edit.version > acknowledged)
    buffer.rows = applyDraftEdits(record.draft.rows, buffer.edits)
    if (rowsText(previous) !== rowsText(buffer.rows)) {
      buffer.selection = remapEditorSelection(
        previous,
        buffer.rows,
        buffer.selection,
      )
      if (this.current === buffer) this.selectionRevision++
    }
  }

  /** Applies replies to their affected category; selection or cross-category Undo cannot transplant text.
   * @example this.acceptWrittenDraft(pending, written)
   */
  private acceptWrittenDraft(
    pending: PendingCommand,
    record: OfflineDraftRecord,
  ): void {
    const { buffer, command } = pending
    const movingCurrent =
      command.type === 'moveCategory' && command.sourceId === buffer.categoryId
    if (
      command.type === 'save' ||
      movingCurrent ||
      record.categoryId === buffer.categoryId
    ) {
      if (record.categoryId !== buffer.categoryId) {
        for (const other of this.buffers)
          if (
            other !== buffer &&
            other.ownerId === buffer.ownerId &&
            other.categoryId === record.categoryId &&
            !other.edits.length
          )
            this.buffers.delete(other)
      }
      this.acceptDraft(buffer, record, buffer.acknowledged)
      return
    }
    const target = [...this.buffers].find(
      (item) =>
        item.ownerId === buffer.ownerId &&
        item.categoryId === record.categoryId,
    )
    if (target) this.acceptDraft(target, record, target.acknowledged)
  }

  /** Bounds idle edit history while retaining captured versions that queued commands still need.
   * @example this.coalesce(buffer)
   */
  private coalesce(buffer: Buffer): void {
    if (this.queued > 0) return
    const pending = this.uncertain.get(buffer.ownerId)
    if (pending?.buffer === buffer) {
      const earlier = buffer.edits.filter(
        (edit) => edit.version <= pending.version,
      )
      buffer.edits = [
        ...earlier,
        ...diffDraftRows(pending.submittedRows, buffer.rows, buffer.version),
      ]
    } else
      buffer.edits = diffDraftRows(
        buffer.base.rows,
        buffer.rows,
        buffer.version,
      )
  }

  /** Keeps the original debounce; composition holds the timer until its final input settles.
   * @example this.scheduleAutosave()
   */
  private scheduleAutosave(): void {
    this.cancelAutosave()
    if (!this.current || this.current.composing) return
    const generation = this.current.generation
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush(generation)
    }, 400)
  }

  /** Clears only the renderer's pending autosave timer, never a durable command in flight.
   * @example this.cancelAutosave()
   */
  private cancelAutosave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Requires the captured account generation before a destructive editor command is dispatched.
   * @example if (!this.authorized(buffer, generation)) return false
   */
  private authorized(buffer: Buffer, generation: number): boolean {
    return (
      this.main.phase === 'ready' &&
      this.main.generation === generation &&
      this.main.workspace.ownerId === buffer.ownerId
    )
  }

  /** Records a recoverable failure only in its owning buffer; another account never sees its text or error.
   * @example return this.fail(buffer, 'Retry saving')
   */
  private fail(buffer: Buffer, message: string, saveFailed = true): false {
    buffer.error = message
    buffer.saveFailed = saveFailed
    this.publish()
    return false
  }

  /** Compares a captured caret without replacing later selection movement from keyboard/pointer input.
   * @example this.sameSelection(captured, current)
   */
  private sameSelection(
    left: EditorSelection,
    right: EditorSelection,
  ): boolean {
    return (
      left.start === right.start &&
      left.end === right.end &&
      left.direction === right.direction
    )
  }

  /** Publishes a fresh immutable snapshot only when state changes, omitting locked account data entirely.
   * @example this.publish()
   */
  private publish(): void {
    const buffer = this.main.phase === 'ready' ? this.current : null
    const owned = buffer
      ? [...this.buffers].filter(
          (item) =>
            item.ownerId === buffer.ownerId &&
            item.generation === buffer.generation,
        )
      : []
    const failed = Boolean(
      owned.some((item) => item.saveFailed) ||
      (this.main.phase === 'ready' && this.main.storageError),
    )
    this.snapshot = {
      main: this.main,
      text: buffer ? rowsText(buffer.rows) : '',
      save: failed
        ? 'failed'
        : buffer &&
            (owned.some((item) => item.edits.length > 0) ||
              this.pending?.buffer.ownerId === buffer.ownerId)
          ? 'saving'
          : 'saved',
      error: buffer?.error ?? null,
      busy: this.queued > 0,
      exitPending: this.exitPending,
      unsavedCategoryCount: owned.filter(
        (item) => item.edits.length > 0 || item.saveFailed,
      ).length,
      selection: buffer ? { ...buffer.selection } : EMPTY_SELECTION,
      selectionRevision: this.selectionRevision,
      notice: buffer ? this.notice : null,
    }
    for (const listener of this.listeners) listener()
  }
}
