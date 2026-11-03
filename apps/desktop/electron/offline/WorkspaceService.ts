import { createHash, randomUUID } from 'node:crypto'

import {
  CompletionSyncReceiptSchema,
  CountCheckpointSchema,
  type CompletionProjection,
  type CompletionSyncReceipt,
  type DraftRow,
  type EditorCategory,
  type OfflineDraft,
} from '@corelive/desktop-contract/offline-workspace'
import {
  WorkspaceCommandSchema,
  type LocalCompletionProjection,
  type OfflineCompletion,
  type OfflineWorkspace,
  type OutboxEntry,
  type WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { diffDraftRows } from '../../renderer/editor/draftEdits'
import { getDraftInputLimit } from '../../renderer/editor/draftInputLimit'
import {
  markPlainLineCompleted,
  normalizeCompletedTitle,
  parseCheckboxLine,
  setCheckboxStateAtLine,
} from '../../renderer/editor/liveEditorUtils'

import type { AtomicWorkspaceFile } from './AtomicWorkspaceFile'

export class WorkspaceCommandError extends Error {
  constructor(
    readonly reason:
      | 'revision-conflict'
      | 'command-conflict'
      | 'category-unavailable'
      | 'undo-expired'
      | 'invalid-row'
      | 'finished-line'
      | 'record-unavailable'
      | 'conflict-unavailable',
  ) {
    super(`Workspace command: ${reason}`)
    this.name = 'WorkspaceCommandError'
  }
}

/**
 * Commits editor commands, captured Undo and outgoing completion identities together.
 * The storage worker owns one instance for the device workspace. Renderer commands
 * never receive success until {@link AtomicWorkspaceFile} has flushed the transaction.
 * No credentials, network calls or UI callbacks enter the reducer.
 *
 * @example
 * const service = new WorkspaceService(file)
 * await service.execute({ type: 'undo', commandId: crypto.randomUUID(), completionId })
 */
export class WorkspaceService {
  constructor(
    readonly file: AtomicWorkspaceFile<OfflineWorkspace>,
    private readonly now: () => number = Date.now,
    private readonly nextId: () => string = randomUUID,
  ) {}

  /**
   * Validates/idempotently applies one user intent. Same command ID with different bytes
   * is rejected; stale full-draft writes are returned as conflicts for live-text rebase.
   * @example await service.execute({ type: 'select', commandId, categoryId: 1 })
   */
  async execute(input: unknown): Promise<OfflineWorkspace> {
    const command = WorkspaceCommandSchema.parse(input)
    const commandDigest = digest(JSON.stringify(command))
    return this.file.update((current) => {
      const receipt = current.commandReceipts[command.commandId]
      if (receipt) {
        if (receipt.digest !== commandDigest)
          throw new WorkspaceCommandError('command-conflict')
        return current
      }
      const state = structuredClone(current)
      this.apply(state, command)
      // Trusted reducers can preserve larger documents; normal saves cannot grant themselves capacity.
      for (const [id, draft] of Object.entries(state.drafts)) {
        if (draft.revision !== current.drafts[id]?.revision)
          draft.inputLimit = getDraftInputLimit(draft)
      }
      state.revision++
      state.commandReceipts[command.commandId] = {
        digest: commandDigest,
        revision: state.revision,
        ...('completionId' in command
          ? { completionId: command.completionId }
          : {}),
      }
      return state
    })
  }

  /**
   * Freezes and marks sendable operations in flight in one transaction, before any request leaves
   * the process (D1, EA3). Only the bound account can send; an operation whose category has no
   * server id yet stays queued (D4 last bullet).
   * @param accountId - The attached account; anything but the binding's account sends nothing.
   * @param operationIds - Candidate queued operations.
   * @returns The entries that are now in flight, each with its frozen server-id `wire` payload.
   * @example const sent = await service.markSentBatch(accountId, ids)
   */
  async markSentBatch(
    accountId: string,
    operationIds: string[],
  ): Promise<OutboxEntry[]> {
    const state = await this.file.update((current) => {
      const binding = current.binding
      if (binding?.accountId !== accountId) return current
      const candidates = operationIds.filter(
        (id) =>
          current.outbox[id]?.state === 'queued' &&
          binding.serverCategoryIds[current.outbox[id].operation.categoryId] !==
            undefined,
      )
      if (!candidates.length) return current
      const next = structuredClone(current)
      for (const id of candidates) {
        const entry = next.outbox[id]!
        // Server ids are mapped exactly once here; every retry sends these stored bytes.
        entry.wire = {
          ...entry.operation,
          categoryId: binding.serverCategoryIds[entry.operation.categoryId]!,
        }
        entry.state = 'sent'
      }
      next.revision++
      return next
    })
    return operationIds.flatMap((id) =>
      state.outbox[id]?.state === 'sent' ? [state.outbox[id]] : [],
    )
  }

  /**
   * Stores all returned receipts with one durable acknowledgement before retiring their work.
   * A late receipt after detach still applies, but only to its own `operationId` (EA16).
   * @param accountId - Must equal the binding's account (C10, P3).
   * @param inputs - Wire receipts with server category ids.
   * @example await service.acceptReceipts(accountId, response.receipts)
   */
  async acceptReceipts(
    accountId: string,
    inputs: unknown[],
  ): Promise<OfflineWorkspace> {
    const receipts = inputs.map((input) =>
      CompletionSyncReceiptSchema.parse(input),
    )
    return this.file.update((current) => {
      if (current.binding?.accountId !== accountId)
        throw new WorkspaceCommandError('command-conflict')
      if (!receipts.some((receipt) => current.outbox[receipt.operationId]))
        return current
      const state = structuredClone(current)
      for (const receipt of receipts) this.applyReceipt(state, receipt)
      state.revision++
      return state
    })
  }

  /** Reduces one receipt without changing an uncertain operation's original payload.
   * @example this.applyReceipt(state, receipt)
   */
  private applyReceipt(
    state: OfflineWorkspace,
    wireReceipt: CompletionSyncReceipt,
  ): void {
    const pending = state.outbox[wireReceipt.operationId]
    if (!pending) return
    if (
      pending.operation.completionId !== wireReceipt.completionId ||
      pending.operation.revision !== wireReceipt.revision
    )
      throw new WorkspaceCommandError('command-conflict')
    const completion = this.completion(state, wireReceipt.completionId)
    const toLocal = localProjectionMapper(state, completion.categoryId)
    const receipt = {
      ...wireReceipt,
      projection: wireReceipt.projection
        ? toLocal(wireReceipt.projection)
        : null,
    }
    if (
      receipt.projection &&
      receipt.projection.revision >= (completion.remote?.revision ?? 0)
    )
      completion.remote = receipt.projection
    if (receipt.projection?.cancelled && !completion.cancelled) {
      state.outbox[receipt.operationId] = {
        ...pending,
        state: 'blocked',
        receipt,
        failure: 'conflict',
      }
    } else if (receipt.status === 'applied') {
      delete state.outbox[receipt.operationId]
      this.queueDesired(state, completion)
    } else {
      state.outbox[receipt.operationId] = {
        ...pending,
        state: 'blocked',
        receipt,
        failure: receipt.reason,
      }
      // An explicit repair made during delivery proceeds only after a definite non-conflict result.
      if (
        completion.revision > receipt.revision &&
        receipt.reason !== 'conflict'
      )
        this.queueDesired(state, completion)
    }
  }

  /**
   * Mirrors the attached account's categories into the device workspace (minimal D2 attach merge).
   * The first call binds the account; later calls apply one-sided server changes, add
   * server-only categories and keep a removed category's writing (it is never dropped).
   * Local-only edits are left for the full D4 merge.
   * @param input - The verified account id/email and the server category list with deletions.
   * @throws {@link WorkspaceCommandError} `command-conflict` when another account is bound (C10).
   * @example await service.reconcileCategories({ accountId, displayEmail, categories, deletions })
   */
  async reconcileCategories(input: {
    accountId: string
    displayEmail: string | null
    categories: EditorCategory[]
    deletions: { sourceId: number; destinationId: number }[]
  }): Promise<OfflineWorkspace> {
    return this.file.update((current) => {
      if (current.binding && current.binding.accountId !== input.accountId)
        throw new WorkspaceCommandError('command-conflict')
      const state = structuredClone(current)
      state.binding ??= {
        accountId: input.accountId,
        displayEmail: input.displayEmail,
        serverCategoryIds: {},
        base: {},
        declined: {},
        deletionReceipts: {},
        lastSyncedAt: null,
      }
      const binding = state.binding
      if (input.displayEmail) binding.displayEmail = input.displayEmail
      const serverToLocal = new Map(
        Object.entries(binding.serverCategoryIds).map(
          ([localId, serverId]) => [serverId, localId] as const,
        ),
      )
      const live = input.categories.filter((category) => !category.removed)
      // Roots first so a child can resolve its parent's local id.
      const ordered = [
        ...live.filter((category) => category.parentId === null),
        ...live.filter((category) => category.parentId !== null),
      ]
      for (const server of ordered) {
        const parentLocalId =
          server.parentId === null
            ? null
            : (serverToLocal.get(server.parentId) ?? null)
        let localId = serverToLocal.get(server.id)
        if (!localId) {
          const match = state.categories.find(
            (category) =>
              !category.removed &&
              !category.historical &&
              binding.serverCategoryIds[category.id] === undefined &&
              (server.isDefault
                ? category.isDefault
                : !category.isDefault &&
                  category.name === server.name &&
                  category.parentId === parentLocalId),
          )
          localId = match?.id ?? this.nextId()
          if (!match) {
            state.categories.push({
              id: localId,
              name: server.name,
              color: server.color,
              isDefault: server.isDefault,
              parentId: parentLocalId,
              removed: false,
              historical: false,
              fieldRevisions: { name: 0, color: 0, parentLocalId: 0 },
            })
            state.drafts[localId] ??= { revision: 0, rows: this.rows('') }
          }
          binding.serverCategoryIds[localId] = server.id
          serverToLocal.set(server.id, localId)
          binding.base[localId] = {
            name: server.name,
            color: server.color,
            parentLocalId,
          }
          continue
        }
        // A field changed only on the server takes the server value; both-changed waits for D4.
        const local = state.categories.find(
          (category) => category.id === localId,
        )
        const base = binding.base[localId]
        if (local && base) {
          if (local.name === base.name && server.name !== base.name)
            local.name = server.name
          if (local.color === base.color && server.color !== base.color)
            local.color = server.color
          if (
            local.parentId === base.parentLocalId &&
            parentLocalId !== base.parentLocalId
          )
            local.parentId = parentLocalId
          if (local.name === server.name) base.name = server.name
          if (local.color === server.color) base.color = server.color
          if (local.parentId === parentLocalId)
            base.parentLocalId = parentLocalId
        }
      }
      // A bound category the server no longer lists keeps its writing and awaits a confirmed move.
      const liveServerIds = new Set(live.map((category) => category.id))
      for (const [localId, serverId] of Object.entries(
        binding.serverCategoryIds,
      )) {
        if (liveServerIds.has(serverId)) continue
        const local = state.categories.find(
          (category) => category.id === localId,
        )
        if (local) local.removed = true
        const destination = resolveServerDeletion(
          serverId,
          input.deletions,
          serverToLocal,
        )
        if (destination) binding.deletionReceipts[localId] = destination
        delete binding.serverCategoryIds[localId]
        delete binding.base[localId]
        serverToLocal.delete(serverId)
      }
      state.revision++
      return state
    })
  }

  /**
   * Records the end of a sync pass with nothing sendable left (C22).
   * @example await service.markSynced(accountId, Date.now())
   */
  async markSynced(accountId: string, at: number): Promise<OfflineWorkspace> {
    return this.file.update((current) => {
      if (current.binding?.accountId !== accountId) return current
      const state = structuredClone(current)
      state.binding!.lastSyncedAt = at
      state.revision++
      return state
    })
  }

  /** Persists a coherent count checkpoint and retires only fully resolved payloads.
   * Undo, delayed clear and uncertain delivery keep their original recovery text alive.
   * Retirement keeps each completion's text on the Mac (C28).
   * @example await service.checkpoint(accountId, expectedRevision, checkpoint)
   */
  async checkpoint(
    accountId: string,
    expectedRevision: number,
    input: unknown,
  ): Promise<OfflineWorkspace> {
    const wire = CountCheckpointSchema.parse(input)
    return this.file.update((current) => {
      if (
        current.revision !== expectedRevision ||
        current.binding?.accountId !== accountId
      )
        return current
      const state = structuredClone(current)
      const toLocal = localProjectionMapper(state, null)
      const identities: NonNullable<
        OfflineWorkspace['checkpoint']
      >['identities'] = {}
      for (const [id, projection] of Object.entries(wire.identities))
        identities[id] = projection ? toLocal(projection) : null
      state.checkpoint = { ...wire, identities }
      const checkpoint = state.checkpoint
      const pending = new Set(
        Object.values(state.outbox).map(
          (entry) => entry.operation.completionId,
        ),
      )
      for (const completion of Object.values(state.completions)) {
        const remote = checkpoint.identities[completion.id]
        if (
          pending.has(completion.id) ||
          (!completion.restored && completion.undoUntil >= this.now()) ||
          (!completion.cancelled &&
            !completion.cleared &&
            completion.clearAfter !== null) ||
          !completion.remote ||
          !remote ||
          remote.revision < completion.remote.revision
        )
          continue
        state.retiredCompletions[completion.id] = {
          completedAt: remote.completedAt,
          originalCompletedAt: completion.originalCompletedAt,
          originalCategoryId: completion.originalCategoryId,
          timezone: completion.timezone,
          cancelled: remote.cancelled,
          revision: completion.revision,
          remoteRevision: remote.revision,
          title: completion.title,
          rawText: completion.rawText,
        }
        delete state.completions[completion.id]
      }
      // Keep the small occurrence link on unchanged visible rows; retiring payloads must not enable duplicate keeps.
      state.revision++
      return state
    })
  }

  /** Finishes due clear-on-complete work after restart without losing an edited occurrence.
   * Called by main's scheduled worker request; the same guarded clear reducer serves UI requests.
   * @example await service.clearDue()
   */
  async clearDue(): Promise<OfflineWorkspace> {
    return this.file.update((current) => {
      const due = Object.values(current.completions).filter(
        (completion) =>
          !completion.cleared &&
          !completion.cancelled &&
          completion.clearAfter !== null &&
          completion.clearAfter <= this.now(),
      )
      if (!due.length) return current
      const state = structuredClone(current)
      for (const completion of due)
        this.clearCompletedLine(state, {
          type: 'clear',
          commandId: this.nextId(),
          completionId: completion.id,
        })
      state.revision++
      return state
    })
  }

  /** Applies a validated discriminated command inside the serialized disk transaction.
   * @example this.apply(state, command)
   */
  private apply(state: OfflineWorkspace, command: WorkspaceCommand): void {
    switch (command.type) {
      case 'save':
        return this.saveDraft(state, command)
      case 'complete':
        return this.completeLine(state, command)
      case 'undo':
        return this.undoCompletion(state, command)
      case 'clear':
        return this.clearCompletedLine(state, command)
      case 'select':
        return this.selectCategory(state, command)
      case 'moveCategory':
        return this.moveCategory(state, command)
      case 'correctTime':
        return this.correctCompletionTime(state, command)
      case 'resolveConflict':
        return this.resolveConflict(state, command)
      case 'retrySync':
        return this.retrySync(state, command)
      case 'preferences':
        return this.patchPreferences(state, command)
      case 'restoreRecovery':
        return this.restoreRecoveryCopy(state, command)
    }
  }

  /** Applies the save command inside the account's durable transaction.
   * @example this.saveDraft(state, command)
   */
  private saveDraft(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'save' }>,
  ): void {
    const draft = this.draft(state, command.categoryId)

    if (draft.revision !== command.baseRevision)
      throw new WorkspaceCommandError('revision-conflict')

    const unique = new Set(command.rows.map((row) => row.id))

    const length = command.rows.reduce(
      (sum, row) => sum + row.text.length,
      Math.max(0, command.rows.length - 1),
    )

    if (
      unique.size !== command.rows.length ||
      length > getDraftInputLimit(draft) ||
      command.rows.some((row) => row.text.includes('\n'))
    )
      throw new WorkspaceCommandError('invalid-row')

    for (const [key, other] of Object.entries(state.drafts)) {
      if (
        key !== command.categoryId &&
        other.rows.some((row) => unique.has(row.id))
      )
        throw new WorkspaceCommandError('invalid-row')
    }

    const previous = new Map(draft.rows.map((row) => [row.id, row]))
    const replacements = new Map(
      diffDraftRows(draft.rows, command.rows, draft.revision).flatMap((edit) =>
        edit.removedIds.length === 1 && edit.inserted.length === 1
          ? [[edit.removedIds[0]!, edit.inserted[0]!.id] as const]
          : [],
      ),
    )
    for (const completion of Object.values(state.completions)) {
      if (completion.categoryId !== command.categoryId || completion.restored)
        continue
      // A single rewritten occurrence remains a placement anchor, never the captured completion itself.
      const replacement = replacements.get(completion.lineId)
      if (replacement) completion.nextRowId = replacement
      else if (completion.nextRowId)
        completion.nextRowId =
          replacements.get(completion.nextRowId) ?? completion.nextRowId
      if (completion.previousRowId)
        completion.previousRowId =
          replacements.get(completion.previousRowId) ?? completion.previousRowId
    }

    draft.rows = command.rows.map((row) => {
      const old = previous.get(row.id)
      return {
        id: row.id,
        text: row.text,
        ...(old?.text === row.text && old.completionId
          ? { completionId: old.completionId }
          : {}),
      }
    })

    draft.revision++

    return
  }

  /** Applies the complete command inside the account's durable transaction.
   * @example this.completeLine(state, command)
   */
  private completeLine(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'complete' }>,
  ): void {
    const draft = this.draft(state, command.categoryId)

    if (draft.revision !== command.baseRevision)
      throw new WorkspaceCommandError('revision-conflict')

    const index = draft.rows.findIndex((row) => row.id === command.rowId)

    const row = draft.rows[index]

    if (
      !row ||
      row.completionId ||
      state.completions[command.completionId] ||
      state.retiredCompletions[command.completionId]
    )
      throw new WorkspaceCommandError('invalid-row')

    const checkbox = parseCheckboxLine(row.text, index)

    if (!checkbox && !markPlainLineCompleted(row.text, 0))
      throw new WorkspaceCommandError('invalid-row')

    // Keep mode leaves finished rows struck in place; completing one again is a refused no-op.
    if (
      checkbox?.checked &&
      !state.preferences.settings.liveEditorClearOnComplete
    )
      throw new WorkspaceCommandError('finished-line')

    const title = normalizeCompletedTitle(checkbox?.title ?? row.text)

    if (!title) throw new WorkspaceCommandError('invalid-row')

    const settings = state.preferences.settings

    const now = this.now()

    const completion: OfflineCompletion = {
      id: command.completionId,
      categoryId: command.categoryId,
      originalCategoryId: command.categoryId,
      title,
      rawText: row.text,
      lineId: row.id,
      lineIndex: index,
      previousRowId: draft.rows[index - 1]?.id,
      nextRowId: draft.rows[index + 1]?.id,
      completedAt: command.completedAt,
      originalCompletedAt: command.completedAt,
      timezone: command.timezone,
      revision: 1,
      undoUntil: now + settings.liveEditorToastDurationMs,
      cancelled: false,
      restored: false,
      remote: null,
      clearAfter: settings.liveEditorClearOnComplete
        ? now +
          Math.min(
            settings.liveEditorClearDelayMs,
            settings.liveEditorToastDurationMs,
          )
        : null,
      cleared: false,
    }

    state.completions[completion.id] = completion

    row.text = checkedText(completion.rawText)

    row.completionId = completion.id

    if (completion.clearAfter !== null && completion.clearAfter <= now) {
      this.removeCompletedRow(state, draft, index)
      completion.cleared = true
    }

    draft.revision++

    this.queueDesired(state, completion)

    return
  }

  /** Preserves other Undo positions when immediate or delayed clearing removes a known occurrence.
   * Called by {@link completeLine} and {@link clearCompletedLine} inside their transaction.
   * User-deleted anchors are not guessed; only this exact automatic removal has known neighbors.
   * @example this.removeCompletedRow(state, draft, index)
   */
  private removeCompletedRow(
    state: OfflineWorkspace,
    draft: OfflineDraft,
    index: number,
  ): void {
    const removed = draft.rows[index]!
    const previous = draft.rows[index - 1]?.id
    const next = draft.rows[index + 1]?.id
    for (const completion of Object.values(state.completions)) {
      // Retarget references before deleting the row so a later completion cannot erase an earlier Undo anchor.
      if (completion.previousRowId === removed.id)
        completion.previousRowId = previous
      if (completion.nextRowId === removed.id) completion.nextRowId = next
    }
    draft.rows.splice(index, 1)
  }

  /** Restores one captured occurrence without replacing an edited or identical neighboring line.
   * Undo and an explicit cancelled-conflict repair share this preservation boundary.
   * Uses surviving occurrence identities after edits, category merges and restart;
   * an old numeric position cannot identify the same writing context.
   * @example this.restoreCapturedRow(draft, completion)
   */
  private restoreCapturedRow(
    draft: OfflineDraft,
    completion: OfflineCompletion,
  ): void {
    const occurrence = draft.rows.findIndex(
      (item) => item.id === completion.lineId,
    )
    const row = draft.rows[occurrence]

    if (
      row?.completionId === completion.id &&
      row.text === checkedText(completion.rawText)
    ) {
      row.text = completion.rawText
      delete row.completionId
    } else {
      const next = draft.rows.findIndex(
        (item) => item.id === completion.nextRowId,
      )
      const previous = draft.rows.findIndex(
        (item) => item.id === completion.previousRowId,
      )
      // Moves retain row IDs, so neighbors still resolve in the effective destination.
      const index =
        occurrence >= 0
          ? occurrence
          : next >= 0
            ? next
            : previous >= 0
              ? previous + 1
              : draft.rows.length
      draft.rows.splice(index, 0, {
        id: this.nextId(),
        text: completion.rawText,
      })
    }
  }

  /** Applies the undo command inside the account's durable transaction.
   * @example this.undoCompletion(state, command)
   */
  private undoCompletion(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'undo' }>,
  ): void {
    const completion = this.completion(state, command.completionId)

    if (completion.restored) return

    if (this.now() > completion.undoUntil)
      throw new WorkspaceCommandError('undo-expired')

    const destination = effectiveCategory(state, completion.categoryId)

    const draft = this.draft(state, destination)

    this.restoreCapturedRow(draft, completion)

    completion.categoryId = destination

    completion.cancelled = true

    completion.restored = true

    completion.revision =
      Math.max(completion.revision, completion.remote?.revision ?? 0) + 1

    draft.revision++

    this.queueDesired(state, completion)

    return
  }

  /** Applies the clear command inside the account's durable transaction.
   * @example this.clearCompletedLine(state, command)
   */
  private clearCompletedLine(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'clear' }>,
  ): void {
    const completion = this.completion(state, command.completionId)

    if (
      completion.cleared ||
      completion.cancelled ||
      completion.clearAfter === null ||
      this.now() < completion.clearAfter
    )
      return

    const draft = this.draft(
      state,
      effectiveCategory(state, completion.categoryId),
    )

    const index = draft.rows.findIndex(
      (row) =>
        row.id === completion.lineId &&
        row.completionId === completion.id &&
        row.text === checkedText(completion.rawText),
    )

    if (index !== -1) {
      this.removeCompletedRow(state, draft, index)
      draft.revision++
    }

    completion.cleared = true

    return
  }

  /** Applies the select command inside the account's durable transaction.
   * @example this.selectCategory(state, command)
   */
  private selectCategory(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'select' }>,
  ): void {
    this.draft(state, command.categoryId)

    state.selectedCategoryId = command.categoryId

    return
  }

  /** Applies the moveCategory command inside the account's durable transaction.
   * @example this.moveCategory(state, command)
   */
  private moveCategory(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'moveCategory' }>,
  ): void {
    const source = effectiveCategory(state, command.sourceId)

    const destination = effectiveCategory(state, command.destinationId)

    if (source === destination) return

    const targetCategory = state.categories.find(
      (category) => category.id === destination && !category.removed,
    )

    if (!targetCategory) throw new WorkspaceCommandError('category-unavailable')

    const from = this.draft(state, source)

    const to = this.draft(state, destination)

    // Retiring a shortened source also transfers its retained absolute editing allowance.
    to.inputLimit = Math.max(getDraftInputLimit(to), getDraftInputLimit(from))

    // A blank separator retains both complete documents and every occurrence identity.
    if (from.rows.some((row) => row.text.length > 0)) {
      if (to.rows.some((row) => row.text.length > 0))
        to.rows.push({ id: this.nextId(), text: '' })
      else to.rows = []
      to.rows.push(...from.rows)
      to.revision++
    }

    state.categoryMoves[source] = destination

    delete state.drafts[source]

    state.categories = state.categories.filter(
      (category) => category.id !== source,
    )

    if (state.selectedCategoryId === source)
      state.selectedCategoryId = destination

    for (const completion of Object.values(state.completions)) {
      if (completion.categoryId !== source) continue
      completion.categoryId = destination
      completion.revision =
        Math.max(completion.revision, completion.remote?.revision ?? 0) + 1
      this.queueDesired(state, completion)
    }

    return
  }

  /** Applies the correctTime command inside the account's durable transaction.
   * @example this.correctCompletionTime(state, command)
   */
  private correctCompletionTime(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'correctTime' }>,
  ): void {
    const completion = this.completion(state, command.completionId)

    completion.completedAt = command.completedAt

    completion.revision =
      Math.max(completion.revision, completion.remote?.revision ?? 0) + 1

    this.queueDesired(state, completion)

    return
  }

  /** Applies the resolveConflict command inside the account's durable transaction.
   * @example this.resolveConflict(state, command)
   */
  private resolveConflict(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'resolveConflict' }>,
  ): void {
    const completion = this.completion(state, command.completionId)

    const remote = completion.remote
    if (
      completion.revision !== command.expectedLocalRevision ||
      remote?.revision !== command.expectedRemoteRevision
    )
      throw new WorkspaceCommandError('revision-conflict')

    if (
      !remote ||
      !Object.values(state.outbox).some(
        (entry) =>
          entry.operation.completionId === completion.id &&
          entry.failure === 'conflict',
      )
    )
      throw new WorkspaceCommandError('conflict-unavailable')

    state.recoveryCopies.push({
      id: this.nextId(),
      categoryId: completion.categoryId,
      text: command.choice === 'server' ? completion.rawText : remote.title,
      reason: 'Conflict alternative',
      createdAt: this.now(),
    })

    if (remote.cancelled && command.choice === 'local') {
      // Restore writing for a deliberate new Keep; never resurrect the cancelled identity.
      const draft = this.draft(
        state,
        effectiveCategory(state, completion.categoryId),
      )
      if (!completion.restored) this.restoreCapturedRow(draft, completion)
      draft.revision++
      completion.restored = true
    }

    if (command.choice === 'server' || remote.cancelled) {
      completion.categoryId = remote.categoryId
      completion.title = remote.title
      completion.completedAt = remote.completedAt
      completion.cancelled = remote.cancelled
      completion.revision = remote.revision
      for (const [id, entry] of Object.entries(state.outbox))
        if (
          entry.operation.completionId === completion.id &&
          entry.state !== 'sent'
        )
          delete state.outbox[id]
    } else {
      completion.revision = Math.max(completion.revision, remote.revision) + 1
      this.queueDesired(state, completion)
    }

    return
  }

  /** Requeues only a definitely rejected dependency after an explicit retry; uncertain deliveries stay immutable.
   * @example this.retrySync(state, command)
   */
  private retrySync(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'retrySync' }>,
  ): void {
    const completion = this.completion(state, command.completionId)
    const entries = Object.values(state.outbox).filter(
      (entry) => entry.operation.completionId === completion.id,
    )
    const rejected = entries.find(
      (entry) =>
        entry.state === 'blocked' &&
        entry.failure === 'dependency' &&
        entry.receipt?.status === 'rejected',
    )
    if (
      !rejected ||
      entries.some((entry) => entry.state === 'sent') ||
      completion.remote?.cancelled
    )
      throw new WorkspaceCommandError('conflict-unavailable')
    completion.remote = rejected.receipt!.projection
    completion.revision =
      Math.max(completion.revision, completion.remote?.revision ?? 0) + 1
    this.queueDesired(state, completion)
  }

  /** Appends an explicitly selected recovery copy once, preserving newer destination writing.
   * @example this.restoreRecoveryCopy(state, command)
   */
  private restoreRecoveryCopy(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'restoreRecovery' }>,
  ): void {
    const copy = state.recoveryCopies.find(
      (entry) => entry.id === command.copyId,
    )
    if (!copy) throw new WorkspaceCommandError('record-unavailable')
    if (copy.restoredTo !== undefined) return
    const destination = effectiveCategory(state, command.destinationId)
    if (
      !state.categories.some(
        (category) => category.id === destination && !category.removed,
      )
    )
      throw new WorkspaceCommandError('category-unavailable')
    const draft = this.draft(state, destination)
    if (draft.rows.some((row) => row.text.length > 0))
      draft.rows.push({ id: this.nextId(), text: '' })
    else draft.rows = []
    draft.rows.push(...this.rows(copy.text))
    draft.revision++
    copy.restoredTo = destination
  }

  /** Applies the preferences command inside the account's durable transaction.
   * @example this.patchPreferences(state, command)
   */
  private patchPreferences(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'preferences' }>,
  ): void {
    if (state.preferences.revision !== command.expectedRevision)
      throw new WorkspaceCommandError('revision-conflict')

    Object.assign(state.preferences.settings, command.patch)

    if (command.theme !== undefined) state.preferences.theme = command.theme

    state.preferences.revision++

    return
  }

  /** Queues the latest desired projection without ever changing an uncertain sent payload.
   * @example this.queueDesired(state, completion)
   */
  private queueDesired(
    state: OfflineWorkspace,
    completion: OfflineCompletion,
  ): void {
    const entries = Object.entries(state.outbox).filter(
      ([, entry]) => entry.operation.completionId === completion.id,
    )
    if (
      entries.some(
        ([, entry]) => entry.operation.revision === completion.revision,
      )
    )
      return
    if (
      entries.some(([, entry]) => entry.state === 'sent') &&
      !completion.cancelled
    )
      return
    if ((completion.remote?.revision ?? 0) >= completion.revision) return
    for (const [id, entry] of entries) {
      // Proven unsent/rejected operations can be superseded; sent bytes stay for receipt lookup.
      if (entry.state !== 'sent') delete state.outbox[id]
    }
    const operationId = this.nextId()
    state.outbox[operationId] = {
      state: 'queued',
      operation: {
        operationId,
        completionId: completion.id,
        deviceId: state.deviceId,
        revision: completion.revision,
        expectedRemoteRevision: completion.remote?.revision ?? 0,
        kind: completion.cancelled
          ? 'cancel'
          : !completion.remote
            ? 'create'
            : completion.remote.categoryId !== completion.categoryId
              ? 'relocate'
              : 'correctTime',
        categoryId: completion.categoryId,
        title: completion.title,
        completedAt: completion.completedAt,
        originalCompletedAt: completion.originalCompletedAt,
        timezone: completion.timezone,
      },
    }
  }

  /** Resolves an accessible draft; retired sources require the caller's explicit rebase.
   * @example const draft = this.draft(state, categoryId)
   */
  private draft(state: OfflineWorkspace, categoryId: string): OfflineDraft {
    const draft = state.drafts[categoryId]
    if (
      !draft ||
      !state.categories.some((category) => category.id === categoryId)
    )
      throw new WorkspaceCommandError('category-unavailable')
    // Capture an older document's allowance before a reducer can shorten its rows.
    draft.inputLimit = getDraftInputLimit(draft)
    return draft
  }

  /** Rejects unknown identities instead of creating orphan Undo operations.
   * @example const item = this.completion(state, completionId)
   */
  private completion(
    state: OfflineWorkspace,
    completionId: string,
  ): OfflineCompletion {
    const completion = state.completions[completionId]
    if (!completion) throw new WorkspaceCommandError('record-unavailable')
    return completion
  }

  /** Allocates a distinct identity for each raw line, including equal titles and empty rows.
   * @example const rows = this.rows('one\ntwo')
   */
  private rows(text: string): DraftRow[] {
    return text.split('\n').map((line) => ({ id: this.nextId(), text: line }))
  }
}

/** Resolves chained category moves without restoring into a retired source.
 * @example effectiveCategory(workspace, 3)
 */
export function effectiveCategory(
  state: OfflineWorkspace,
  categoryId: string,
): string {
  const visited = new Set<string>()
  let current = categoryId
  while (state.categoryMoves[current]) {
    if (visited.has(current))
      throw new WorkspaceCommandError('category-unavailable')
    visited.add(current)
    current = state.categoryMoves[current]!
  }
  return current
}

/**
 * Builds the server -> local projection mapper from the binding's reverse id map.
 * An id the binding does not know keeps `fallbackCategoryId`, or the first local id, so a
 * receipt never fails to apply just because a category was unbound meanwhile.
 * @example const toLocal = localProjectionMapper(state, completion.categoryId)
 */
function localProjectionMapper(
  state: OfflineWorkspace,
  fallbackCategoryId: string | null,
): (projection: CompletionProjection) => LocalCompletionProjection {
  const reverse = new Map(
    Object.entries(state.binding?.serverCategoryIds ?? {}).map(
      ([localId, serverId]) => [serverId, localId] as const,
    ),
  )
  const fallback = fallbackCategoryId ?? state.selectedCategoryId
  return (projection) => ({
    ...projection,
    categoryId: reverse.get(projection.categoryId) ?? fallback,
  })
}

/**
 * Follows chained server deletions to a still-bound local destination (EA11c guard).
 * @returns The local destination id, or undefined when the chain ends at an unknown category.
 * @example resolveServerDeletion(7, deletions, serverToLocal)
 */
function resolveServerDeletion(
  sourceServerId: number,
  deletions: { sourceId: number; destinationId: number }[],
  serverToLocal: Map<number, string>,
): string | undefined {
  const next = new Map(
    deletions.map((entry) => [entry.sourceId, entry.destinationId] as const),
  )
  const visited = new Set<number>()
  let current = next.get(sourceServerId)
  // Visited-set and hop cap guard against cyclic or runaway chains.
  for (let hop = 0; current !== undefined && hop < 1000; hop++) {
    const local = serverToLocal.get(current)
    if (local) return local
    if (visited.has(current)) return undefined
    visited.add(current)
    current = next.get(current)
  }
  return undefined
}

/** Reuses the editor's established checkbox grammar for durable completion/Undo.
 * @example checkedText('Write release notes')
 */
function checkedText(raw: string): string {
  const parsed = parseCheckboxLine(raw, 0)
  if (parsed) return setCheckboxStateAtLine(raw, 0, true)
  return markPlainLineCompleted(raw, 0)?.text ?? raw
}

/** Hashes command bytes and preserved migration inputs without storing credentials.
 * @example digest(JSON.stringify(command))
 */
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
