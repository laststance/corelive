import { createHash, randomUUID } from 'node:crypto'

import type { SyncOutcome } from '@corelive/desktop-contract/category-sync'
import {
  validateCategoryAction,
  type CategoryAction,
} from '@corelive/desktop-contract/category-validator'
import {
  CompletionSyncReceiptSchema,
  CountCheckpointSchema,
  type CompletionProjection,
  type CompletionSyncReceipt,
  type DraftRow,
  type OfflineDraft,
} from '@corelive/desktop-contract/offline-workspace'
import {
  WorkspaceCommandSchema,
  type LocalCompletionProjection,
  type OfflineCompletion,
  type OfflineWorkspace,
  type OutboxEntry,
  type RetiredCompletion,
  type WorkspaceArchive,
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

import {
  WorkspaceFileError,
  type AtomicWorkspaceFile,
} from './AtomicWorkspaceFile'
import { mergeCategories, type CategoryMergeInput } from './categoryMerge'
import {
  applyCategoryReceipts,
  categoryWork,
  freezeCategoryBatch,
  hasSendableWork,
  noteReceiptQuery,
  parkOperations,
} from './categoryReceipts'
import { clearMarker, type CategoryContext } from './categoryState'
import {
  buildOperation,
  selectUploads,
  uploadKind,
  waitingCompletionCount,
} from './completionUpload'
import { effectiveCategory } from './effectiveCategory'
import { applySyncDetailAction, buildSyncDetails } from './syncDetails'
import { WorkspaceCommandError } from './WorkspaceCommandError'

export { WorkspaceCommandError, effectiveCategory }

/**
 * Commands whose receipts are kept. A receipt only answers a replay of the same command id
 * (a lost reply, a retried IPC), which can only span a handful of commits; an unbounded map
 * grew by about 160 bytes per command forever (#216 perf gate).
 */
export const COMMAND_RECEIPT_WINDOW = 2000

/** Records moved back from the archive for upload before the roll moves settled ones out again. */
const ARCHIVE_DRAIN_ROLL_THRESHOLD = 1000

const EMPTY_ARCHIVE: ReadonlyMap<string, OfflineCompletion> = new Map()

/** Settled records must be older than this before they leave the keep-path snapshot. */
export const ARCHIVE_MIN_AGE_MS = 48 * 60 * 60 * 1000

/**
 * Copies a workspace for a reducer that only adds or replaces whole records.
 *
 * Small fields are deep-cloned. The growing records get new containers but share their
 * entry objects with `current`, so a reducer must replace an entry (`state.x[id] = {...}`)
 * and never mutate one in place. Sharing is also what lets
 * the file's change validator skip the untouched entries. Used by the hot save and
 * keep commands.
 *
 * @param current - The committed state; never mutated.
 * @returns A state safe to hand to {@link WorkspaceService.apply} for save and complete.
 * @example const state = forkWorkspace(current)
 */
function forkWorkspace(current: OfflineWorkspace): OfflineWorkspace {
  const {
    completions,
    retiredCompletions,
    outbox,
    categoryOutbox,
    commandReceipts,
    ...small
  } = current
  return {
    ...structuredClone(small),
    completions: { ...completions },
    retiredCompletions: { ...retiredCompletions },
    outbox: { ...outbox },
    categoryOutbox: { ...categoryOutbox },
    commandReceipts: { ...commandReceipts },
  }
}

/**
 * Drops receipts older than {@link COMMAND_RECEIPT_WINDOW} commits (by workspace revision).
 *
 * @param state - The candidate state, already at its new revision; mutated in place.
 * @example pruneCommandReceipts(state)
 */
function pruneCommandReceipts(state: OfflineWorkspace): void {
  const receipts = Object.keys(state.commandReceipts)
  if (receipts.length <= COMMAND_RECEIPT_WINDOW) return
  const oldest = state.revision - COMMAND_RECEIPT_WINDOW
  for (const id of receipts)
    if (state.commandReceipts[id]!.revision <= oldest)
      delete state.commandReceipts[id]
}

/**
 * Whether a live completion can no longer be touched by Undo, a delayed clear, a sync
 * operation or a conflict flow, so it may move to the archive.
 *
 * @param completion - A record from `completions`.
 * @param pending - Completion ids that still have an outbox entry.
 * @param now - Epoch ms.
 * @returns True when nothing in the product reads or writes it any more.
 * @example if (isSettledCompletion(c, pending, Date.now())) archive(c)
 */
function isSettledCompletion(
  completion: OfflineCompletion,
  pending: ReadonlySet<string>,
  now: number,
): boolean {
  const cutoff = now - ARCHIVE_MIN_AGE_MS
  return (
    !pending.has(completion.id) &&
    completion.completedAt < cutoff &&
    completion.originalCompletedAt < cutoff &&
    (completion.restored || completion.undoUntil < now) &&
    (completion.cancelled ||
      completion.cleared ||
      completion.clearAfter === null)
  )
}

/**
 * Whether a retired record is old enough to leave the keep-path snapshot.
 *
 * @param retired - A record from `retiredCompletions`.
 * @param now - Epoch ms.
 * @returns True when it can no longer count toward today.
 * @example if (isSettledRetired(r, Date.now())) archive(r)
 */
function isSettledRetired(retired: RetiredCompletion, now: number): boolean {
  const cutoff = now - ARCHIVE_MIN_AGE_MS
  return retired.completedAt < cutoff && retired.originalCompletedAt < cutoff
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
    private readonly archive: AtomicWorkspaceFile<WorkspaceArchive> | null = null,
  ) {}

  /**
   * Archived completions that were never uploaded, keyed by id; null until first needed.
   * Local-only history is archivable after two days yet stays derivable for upload (#216 D1),
   * so the sync paths read the archive file once into this map instead of once per batch.
   */
  private archivedUnsent: Map<string, OfflineCompletion> | null = null

  /** Records moved back from the archive since the last roll; bounds the drain's hot growth. */
  private unarchivedSinceRoll = 0

  /**
   * Validates/idempotently applies one user intent. Same command ID with different bytes
   * is rejected; stale full-draft writes are returned as conflicts for live-text rebase.
   * @example await service.execute({ type: 'select', commandId, categoryId: 1 })
   */
  async execute(input: unknown): Promise<OfflineWorkspace> {
    const command = WorkspaceCommandSchema.parse(input)
    const commandDigest = digest(JSON.stringify(command))
    return this.file.update(
      (current) => {
        const receipt = current.commandReceipts[command.commandId]
        if (receipt) {
          if (receipt.digest !== commandDigest)
            throw new WorkspaceCommandError('command-conflict')
          return current
        }
        // Typing and keeping only touch drafts and add records, so they fork cheaply; every
        // other command deep-clones.
        const state =
          command.type === 'save' || command.type === 'complete'
            ? forkWorkspace(current)
            : structuredClone(current)
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
        pruneCommandReceipts(state)
        return state
        // The worker only projects the result, so it skips the defensive clone.
      },
      { shared: true },
    )
  }

  /**
   * Moves settled history out of the keep-path snapshot into the archive file.
   *
   * Order is the safety argument: the records are made durable in the archive first, and only
   * then removed from the workspace, re-checked against the then-current state. A crash in
   * between leaves a record in both files (the workspace wins on read, the next pass rewrites
   * the archive copy); nothing can be in neither. Runs off the keep path (startup, day roll).
   * @returns How many records left the workspace.
   * @example const moved = await service.archiveSettled()
   */
  async archiveSettled(): Promise<number> {
    const archive = this.archive
    if (!archive) return 0
    const now = this.now()
    const chosen: {
      completions: Record<string, OfflineCompletion>
      retired: Record<string, RetiredCompletion>
    } = { completions: {}, retired: {} }
    // A shared no-op update scans the cached state without cloning it (the callback only reads).
    await this.file.update(
      (state) => {
        const pending = new Set(
          Object.values(state.outbox).map(
            (entry) => entry.operation.completionId,
          ),
        )
        for (const [id, completion] of Object.entries(state.completions))
          if (isSettledCompletion(completion, pending, now))
            chosen.completions[id] = completion
        for (const [id, record] of Object.entries(state.retiredCompletions))
          if (isSettledRetired(record, now)) chosen.retired[id] = record
        return state
      },
      { shared: true },
    )
    if (
      !Object.keys(chosen.completions).length &&
      !Object.keys(chosen.retired).length
    )
      return 0
    await archive.updateOrInitialize(
      {
        version: 1,
        ownerId: 'device',
        completions: {},
        retiredCompletions: {},
      },
      (current) => {
        const completions = { ...current.completions, ...chosen.completions }
        // A retired record supersedes any stale never-uploaded copy left by an earlier upload.
        for (const id of Object.keys(chosen.retired)) delete completions[id]
        return {
          ...current,
          // The newest copy wins if a record was archived before and has changed since.
          completions,
          retiredCompletions: {
            ...current.retiredCompletions,
            ...chosen.retired,
          },
        }
      },
    )
    let moved = 0
    await this.file.update((current) => {
      const pending = new Set(
        Object.values(current.outbox).map(
          (entry) => entry.operation.completionId,
        ),
      )
      const completions = { ...current.completions }
      const retiredCompletions = { ...current.retiredCompletions }
      for (const [id, archived] of Object.entries(chosen.completions)) {
        const live = completions[id]
        // Skip anything that changed or became active since it was archived.
        if (
          live &&
          live.revision === archived.revision &&
          isSettledCompletion(live, pending, now)
        ) {
          delete completions[id]
          moved++
          // Never-uploaded history stays derivable for the next attach (#216 D1).
          if (this.archivedUnsent && uploadKind(archived, []))
            this.archivedUnsent.set(id, archived)
        }
      }
      for (const [id, archived] of Object.entries(chosen.retired)) {
        const live = retiredCompletions[id]
        if (live && live.revision === archived.revision) {
          delete retiredCompletions[id]
          moved++
        }
      }
      if (!moved) return current
      return {
        ...current,
        revision: current.revision + 1,
        completions,
        retiredCompletions,
      }
    })
    this.unarchivedSinceRoll = 0
    return moved
  }

  /**
   * Drops outbox entries that were queued but never offered to the dashboard.
   *
   * Uploads are derived from completion state now, so such an entry (written by an earlier build
   * of this workspace version) is re-derivable; `sent` (uncertain) and `blocked` entries stay
   * for their receipts and for the user's decision (P3). Runs once per open.
   * @returns How many entries were dropped.
   * @example await service.dropDerivableEntries()
   */
  async dropDerivableEntries(): Promise<number> {
    let dropped = 0
    await this.file.update((current) => {
      const queued = Object.keys(current.outbox).filter(
        (id) => current.outbox[id]!.state === 'queued',
      )
      if (!queued.length) return current
      const next = forkWorkspace(current)
      for (const id of queued) delete next.outbox[id]
      dropped = queued.length
      next.revision++
      return next
    })
    return dropped
  }

  /**
   * Reads the never-uploaded archived records once (see {@link archivedUnsent}).
   *
   * Ids that also live in the workspace or in either retired map are skipped: a stale archive
   * copy is left behind when an upload moved the record back (crash or pending roll), and the
   * workspace always wins on read.
   * @returns The shared map; callers must not mutate its records.
   * @throws {@link WorkspaceFileError} when the archive exists but cannot be read.
   * @example const unsent = await this.loadArchivedUnsent()
   */
  private async loadArchivedUnsent(): Promise<Map<string, OfflineCompletion>> {
    if (this.archivedUnsent) return this.archivedUnsent
    const unsent = new Map<string, OfflineCompletion>()
    if (this.archive) {
      let stored: WorkspaceArchive | null = null
      try {
        // A shared no-op read avoids cloning a multi-year archive.
        stored = await this.archive.update((current) => current, {
          shared: true,
        })
      } catch (error) {
        if (
          !(error instanceof WorkspaceFileError) ||
          error.reason !== 'missing'
        )
          throw error
      }
      if (stored) {
        const hot = await this.file.update((current) => current, {
          shared: true,
        })
        for (const [id, completion] of Object.entries(stored.completions))
          if (
            !hot.completions[id] &&
            !hot.retiredCompletions[id] &&
            !stored.retiredCompletions[id] &&
            uploadKind(completion, [])
          )
            unsent.set(id, completion)
      }
    }
    // An archive roll that finished while reading may already have filled the map.
    this.archivedUnsent ??= unsent
    return this.archivedUnsent
  }

  /**
   * How many archived completions still wait for their first upload (0 until the archive was read).
   * Added to the view's waiting count so the footer and the attach progress include archive.
   * @example view.pendingCount + service.archivedPendingCount()
   */
  archivedPendingCount(): number {
    return this.archivedUnsent?.size ?? 0
  }

  /**
   * Whether enough records came back from the archive that a roll should move them out again.
   * @example if (service.needsArchiveRoll()) scheduleArchive()
   */
  needsArchiveRoll(): boolean {
    return this.unarchivedSinceRoll >= ARCHIVE_DRAIN_ROLL_THRESHOLD
  }

  /**
   * Counts every completion still waiting to be sent, archive included (D2/DA4 progress).
   * Read when the user presses Connect so "Sending N keeps…" is the true total.
   * @returns Hot completions needing upload or holding an entry, plus archived unsent ones.
   * @example const total = await service.pendingTotal()
   */
  async pendingTotal(): Promise<number> {
    const archivedUnsent = await this.loadArchivedUnsent()
    const state = await this.file.update((current) => current, { shared: true })
    return waitingCompletionCount(state) + archivedUnsent.size
  }

  /**
   * Lists the work the sync loop can do now: uncertain entries to recover plus how many
   * completions could be frozen and sent (capped at `limit`). Nothing is written (EA3).
   * @param limit - Upper bound for both numbers.
   * @example const { uncertain, sendable } = await service.pendingWork(16)
   */
  async pendingWork(
    limit: number,
  ): Promise<{ uncertain: OutboxEntry[]; sendable: number }> {
    const state = await this.file.update((current) => current, { shared: true })
    const uncertain = Object.values(state.outbox)
      .filter((entry) => entry.state === 'sent')
      .slice(0, limit)
    if (!state.binding) return { uncertain, sendable: 0 }
    const archivedUnsent = await this.loadArchivedUnsent()
    return {
      uncertain,
      sendable: selectUploads(state, archivedUnsent, limit).length,
    }
  }

  /**
   * Derives the next sendable operations from completion state and freezes each wire payload
   * into the outbox in the same transaction that marks it in flight, before any request leaves
   * the process (D1, EA3). Only the bound account can send; a completion whose category has no
   * server id yet is skipped (D4 last bullet). Uncertain entries are returned unchanged so the
   * loop replays their stored bytes.
   * @param accountId - The attached account; anything but the binding's account sends nothing.
   * @param limit - Maximum number of operations in the batch, replays included.
   * @returns Uncertain entries first, then the newly frozen ones, each with its `wire` payload.
   * @example const sent = await service.markSentBatch(accountId, 16)
   */
  async markSentBatch(
    accountId: string,
    limit: number,
  ): Promise<OutboxEntry[]> {
    const probe = await this.file.update((current) => current, { shared: true })
    if (probe.binding?.accountId !== accountId) return []
    const archivedUnsent = await this.loadArchivedUnsent()
    let replay: OutboxEntry[] = []
    const frozen: string[] = []
    const fromArchive: string[] = []
    const state = await this.file.update((current) => {
      const binding = current.binding
      if (binding?.accountId !== accountId) return current
      replay = Object.values(current.outbox)
        .filter((entry) => entry.state === 'sent')
        .slice(0, limit)
      const candidates = selectUploads(
        current,
        archivedUnsent,
        limit - replay.length,
      )
      if (!candidates.length) return current
      // Replace entries, never mutate: the fork shares them with the committed state.
      const next = forkWorkspace(current)
      for (const { completion, kind, archived } of candidates) {
        // A proven-unsent or rejected entry is superseded by the operation frozen now.
        for (const [id, entry] of Object.entries(next.outbox))
          if (
            entry.operation.completionId === completion.id &&
            entry.state !== 'sent'
          )
            delete next.outbox[id]
        const operationId = this.nextId()
        const operation = buildOperation(
          next.deviceId,
          completion,
          kind,
          operationId,
        )
        // Server ids are mapped exactly once here; every retry sends these stored bytes.
        next.outbox[operationId] = {
          state: 'sent',
          operation,
          wire: {
            ...operation,
            categoryId: binding.serverCategoryIds[operation.categoryId]!,
          },
        }
        if (archived) {
          next.completions[completion.id] = completion
          fromArchive.push(completion.id)
        }
        frozen.push(operationId)
      }
      next.revision++
      return next
    })
    // The workspace now owns these records; any archive copy is stale and loses on read.
    for (const id of fromArchive) archivedUnsent.delete(id)
    this.unarchivedSinceRoll += fromArchive.length
    return [...replay, ...frozen.flatMap((id) => state.outbox[id] ?? [])]
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
      // A fork is enough: applyReceipt replaces the entries it changes.
      const state = forkWorkspace(current)
      for (const receipt of receipts) this.applyReceipt(state, receipt)
      // C22: written with the receipt that leaves nothing sendable.
      if (!this.hasSendableWork(state)) state.binding!.lastSyncedAt = this.now()
      state.revision++
      return state
    })
  }

  /**
   * Whether anything could still be sent: category work, uncertain entries, or derivable keeps
   * (archive included).
   * @example if (!this.hasSendableWork(state)) binding.lastSyncedAt = now
   */
  private hasSendableWork(state: OfflineWorkspace): boolean {
    return hasSendableWork(state, this.archivedUnsent ?? EMPTY_ARCHIVE)
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
    let completion = this.completion(state, wireReceipt.completionId)
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
    ) {
      // Replace, never mutate: the receipt commit forks the workspace and shares entries.
      completion = { ...completion, remote: receipt.projection }
      state.completions[completion.id] = completion
    }
    if (receipt.projection?.cancelled && !completion.cancelled) {
      state.outbox[receipt.operationId] = {
        ...pending,
        state: 'blocked',
        receipt,
        failure: 'conflict',
      }
    } else if (receipt.status === 'applied') {
      delete state.outbox[receipt.operationId]
      this.supersedeUnsent(state, completion)
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
        this.supersedeUnsent(state, completion)
    }
  }

  /**
   * Runs the D4 three-way category merge against the attached account's server list.
   * The first call binds the account (name-path match, local default pairs with the server
   * default); every call re-derives the not-yet-sent operations (C19). It defers, changing
   * nothing, while a category operation is still uncertain.
   * @param input - The verified account id/email and the server category list with deletions.
   * @throws {@link WorkspaceCommandError} `command-conflict` when another account is bound (C10).
   * @example await service.reconcileCategories({ accountId, displayEmail, categories, deletions })
   */
  async reconcileCategories(
    input: CategoryMergeInput,
  ): Promise<OfflineWorkspace> {
    return this.file.update((current) => {
      if (current.binding && current.binding.accountId !== input.accountId)
        throw new WorkspaceCommandError('command-conflict')
      const state = structuredClone(current)
      if (!mergeCategories(state, input, this.categoryContext())) return current
      state.revision++
      return state
    })
  }

  /** Clock and id source handed to the pure category modules. */
  private categoryContext(): CategoryContext {
    return {
      now: this.now(),
      nextId: this.nextId,
      archivedUnsent: this.archivedUnsent ?? EMPTY_ARCHIVE,
    }
  }

  /**
   * Lists category work for the sync loop: uncertain entries to recover and sendable queued ones.
   * @example const { uncertain, sendable } = await service.categoryPending(16)
   */
  async categoryPending(limit: number) {
    // A shared no-op read avoids cloning the whole workspace; callers only serialize the entries.
    const state = await this.file.update((current) => current, { shared: true })
    return categoryWork(state, limit)
  }

  /**
   * Freezes and marks category operations in flight in one transaction (EA3, D1).
   * @param accountId - Must be the binding's account.
   * @param operationIds - Candidates from {@link categoryPending}.
   * @returns The entries now in flight, each with its frozen wire payload.
   * @example const sent = await service.markCategorySent(accountId, ids)
   */
  async markCategorySent(accountId: string, operationIds: string[]) {
    const state = await this.file.update((current) => {
      if (current.binding?.accountId !== accountId) return current
      const next = structuredClone(current)
      if (!freezeCategoryBatch(next, operationIds).length) return current
      next.revision++
      return next
    })
    return operationIds.flatMap((id) =>
      state.categoryOutbox[id]?.state === 'sent'
        ? [state.categoryOutbox[id]]
        : [],
    )
  }

  /**
   * Stores category receipts durably, applying each only to its own `operationId` (EA16).
   * @example await service.acceptCategoryReceipts(accountId, response.receipts)
   */
  async acceptCategoryReceipts(
    accountId: string,
    receipts: SyncOutcome[],
  ): Promise<OfflineWorkspace> {
    return this.file.update((current) => {
      if (current.binding?.accountId !== accountId)
        throw new WorkspaceCommandError('command-conflict')
      const categoryReceipts = receipts.flatMap((receipt) =>
        receipt.kind === 'category' &&
        current.categoryOutbox[receipt.operationId]
          ? [receipt]
          : [],
      )
      if (!categoryReceipts.length) return current
      const state = structuredClone(current)
      applyCategoryReceipts(state, categoryReceipts, this.categoryContext())
      state.revision++
      return state
    })
  }

  /**
   * Durably applies a category-outbox edit only while the workspace is still bound to the account.
   * A stale account (signed out or switched meanwhile) leaves the file untouched.
   * @example await this.updateBoundAccount(accountId, (state) => parkOperations(state, ids))
   */
  private async updateBoundAccount(
    accountId: string,
    edit: (state: OfflineWorkspace) => void,
  ): Promise<OfflineWorkspace> {
    return this.file.update((current) => {
      if (current.binding?.accountId !== accountId) return current
      const state = structuredClone(current)
      edit(state)
      state.revision++
      return state
    })
  }

  /** Counts an unanswered receipt lookup for uncertain operations (EA4).
   * @example await service.noteCategoryQuery(accountId, ids)
   */
  async noteCategoryQuery(
    accountId: string,
    operationIds: string[],
  ): Promise<OfflineWorkspace> {
    return this.updateBoundAccount(accountId, (state) =>
      noteReceiptQuery(state, operationIds),
    )
  }

  /** Parks operations a 4xx rejected on their own (E3).
   * @example await service.parkCategory(accountId, ids)
   */
  async parkCategory(
    accountId: string,
    operationIds: string[],
  ): Promise<OfflineWorkspace> {
    return this.updateBoundAccount(accountId, (state) =>
      parkOperations(state, operationIds),
    )
  }

  /** Reads the Sync details page data (rows, History, C34 summary, v1 backups).
   * @example const details = await service.syncDetails()
   */
  async syncDetails() {
    // A shared no-op read avoids cloning the whole workspace; the view is serialized across the worker boundary.
    const state = await this.file.update((current) => current, { shared: true })
    return buildSyncDetails(state)
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
          // A local change the dashboard has not received yet (an Undo, a move) must outlive the
          // checkpoint; retiring now would replace it with the dashboard's older state.
          uploadKind(completion, []) !== null ||
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
      case 'categoryCreate':
        return this.categoryCreate(state, command)
      case 'categoryRename':
        return this.categoryEdit(state, command.categoryId, 'name', command)
      case 'categoryRecolor':
        return this.categoryEdit(state, command.categoryId, 'color', command)
      case 'categoryReparent':
        return this.categoryEdit(
          state,
          command.categoryId,
          'parentLocalId',
          command,
        )
      case 'categoryDelete':
        return this.categoryDelete(state, command)
      case 'syncDetailAction':
        return applySyncDetailAction(state, command, this.categoryContext())
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
    for (const [id, completion] of Object.entries(state.completions)) {
      if (completion.categoryId !== command.categoryId || completion.restored)
        continue
      // A single rewritten occurrence remains a placement anchor, never the captured completion itself.
      const replacement = replacements.get(completion.lineId)
      const nextRowId = replacement
        ? replacement
        : completion.nextRowId
          ? (replacements.get(completion.nextRowId) ?? completion.nextRowId)
          : completion.nextRowId
      const previousRowId = completion.previousRowId
        ? (replacements.get(completion.previousRowId) ??
          completion.previousRowId)
        : completion.previousRowId
      // Replace the entry rather than mutate it: forked states share unchanged records.
      if (
        nextRowId !== completion.nextRowId ||
        previousRowId !== completion.previousRowId
      )
        state.completions[id] = { ...completion, nextRowId, previousRowId }
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

    this.supersedeUnsent(state, completion)

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
    for (const [id, completion] of Object.entries(state.completions)) {
      // Retarget references before deleting the row so a later completion cannot erase an earlier Undo anchor.
      const retargetPrevious = completion.previousRowId === removed.id
      const retargetNext = completion.nextRowId === removed.id
      // Replace the entry rather than mutate it: forked states share unchanged records.
      if (retargetPrevious || retargetNext)
        state.completions[id] = {
          ...completion,
          ...(retargetPrevious ? { previousRowId: previous } : {}),
          ...(retargetNext ? { nextRowId: next } : {}),
        }
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

    this.supersedeUnsent(state, completion)

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

    this.retireCategory(state, source, destination)
  }

  /**
   * Moves a category's writing and records into its destination and removes it from the list.
   * Shared by the confirmed move of a removed category and the local delete (D4).
   * @example this.retireCategory(state, sourceId, destinationId)
   */
  private retireCategory(
    state: OfflineWorkspace,
    source: string,
    destination: string,
  ): void {
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
      this.supersedeUnsent(state, completion)
    }

    return
  }

  /** Judges a local category edit with the shared validator; refusals are definite, never storage errors (C5).
   * @returns The normalized name for create/rename.
   * @example const name = this.judgeCategory(state, { type: 'create', name, parentId })
   */
  private judgeCategory(
    state: OfflineWorkspace,
    action: CategoryAction<string>,
  ): string | undefined {
    const verdict = validateCategoryAction(state.categories, action)
    if (!verdict.ok)
      throw new WorkspaceCommandError(verdict.reason, verdict.childName)
    return verdict.name
  }

  /** Creates a local category offline and selects it (D4, DA8; restores the step 3 auto-select).
   * @example this.categoryCreate(state, command)
   */
  private categoryCreate(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'categoryCreate' }>,
  ): void {
    if (state.categories.some((category) => category.id === command.categoryId))
      throw new WorkspaceCommandError('command-conflict')
    const name = this.judgeCategory(state, {
      type: 'create',
      name: command.name,
      parentId: command.parentId,
    })
    state.categories.push({
      id: command.categoryId,
      name: name ?? command.name,
      color: command.color,
      isDefault: false,
      parentId: command.parentId,
      removed: false,
      historical: false,
      fieldRevisions: { name: 1, color: 1, parentLocalId: 1 },
    })
    state.drafts[command.categoryId] = { revision: 0, rows: this.rows('') }
    state.selectedCategoryId = command.categoryId
  }

  /** Renames, recolors or reparents a local category; a new edit clears that field's declined marker (C18).
   * @example this.categoryEdit(state, id, 'name', command)
   */
  private categoryEdit(
    state: OfflineWorkspace,
    categoryId: string,
    field: 'name' | 'color' | 'parentLocalId',
    command: Extract<
      WorkspaceCommand,
      { type: 'categoryRename' | 'categoryRecolor' | 'categoryReparent' }
    >,
  ): void {
    const category = state.categories.find(
      (entry) => entry.id === categoryId && !entry.removed,
    )
    if (!category) throw new WorkspaceCommandError('not-found')
    if (command.type === 'categoryRename') {
      const name = this.judgeCategory(state, {
        type: 'rename',
        id: categoryId,
        name: command.name,
      })
      if (name === category.name) return
      category.name = name ?? command.name
    } else if (command.type === 'categoryRecolor') {
      this.judgeCategory(state, { type: 'recolor', id: categoryId })
      if (command.color === category.color) return
      category.color = command.color
    } else {
      this.judgeCategory(state, {
        type: 'reparent',
        id: categoryId,
        parentId: command.parentId,
      })
      if (command.parentId === category.parentId) return
      category.parentId = command.parentId
    }
    category.fieldRevisions[field]++
    if (state.binding) {
      clearMarker(state.binding, categoryId, field)
      clearMarker(state.binding, categoryId, 'create')
    }
  }

  /** Deletes a local category offline: children become roots, writing and records move to the destination (D4, EA8).
   * @example this.categoryDelete(state, command)
   */
  private categoryDelete(
    state: OfflineWorkspace,
    command: Extract<WorkspaceCommand, { type: 'categoryDelete' }>,
  ): void {
    const destination = effectiveCategory(state, command.destinationId)
    this.judgeCategory(state, {
      type: 'delete',
      id: command.categoryId,
      destinationId: destination,
    })
    for (const child of state.categories)
      if (child.parentId === command.categoryId) child.parentId = null
    if (state.binding) delete state.binding.declined[command.categoryId]
    this.retireCategory(state, command.categoryId, destination)
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

    this.supersedeUnsent(state, completion)

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
      this.supersedeUnsent(state, completion)
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
    this.supersedeUnsent(state, completion)
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

  /**
   * Drops proven-unsent or rejected entries that a newer revision of the completion supersedes.
   *
   * It no longer creates an operation: upload work is derived from completion state and frozen
   * only when first marked in flight ({@link markSentBatch}), so keeping or editing while
   * detached leaves the outbox untouched (#216 D1 local-only gate). Sent bytes stay for
   * receipt lookup and are never changed (EA3).
   * @example this.supersedeUnsent(state, completion)
   */
  private supersedeUnsent(
    state: OfflineWorkspace,
    completion: OfflineCompletion,
  ): void {
    const entries = Object.entries(state.outbox).filter(
      ([, entry]) => entry.operation.completionId === completion.id,
    )
    if (
      entries.some(
        ([, entry]) => entry.operation.revision === completion.revision,
      ) ||
      (entries.some(([, entry]) => entry.state === 'sent') &&
        !completion.cancelled) ||
      (completion.remote?.revision ?? 0) >= completion.revision
    )
      return
    for (const [id, entry] of entries) {
      if (entry.state !== 'sent') delete state.outbox[id]
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
