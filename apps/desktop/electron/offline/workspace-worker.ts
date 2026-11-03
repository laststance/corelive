import { randomUUID } from 'node:crypto'
import { parentPort, workerData } from 'node:worker_threads'

import {
  DEVICE_ARCHIVE_FILE_NAME,
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  type OfflineWorkspace,
  validateWorkspaceChange,
  WorkspaceArchiveSchema,
  type WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { z } from 'zod'

import { AtomicWorkspaceFile, WorkspaceFileError } from './AtomicWorkspaceFile'
import {
  buildOperation,
  outboxByCompletion,
  uploadKind,
} from './completionUpload'
import {
  eligibleUndo,
  workspaceView,
  type WorkspaceView,
  type WorkspaceWorkerRequest,
  type WorkspaceWorkerCalls,
} from './workspace-worker-protocol'
import { checkpointIdentities } from './workspaceCounts'
import {
  effectiveCategory,
  WorkspaceCommandError,
  WorkspaceService,
} from './WorkspaceService'

const options = z
  .object({ directory: z.string(), ownerId: z.literal(DEVICE_OWNER_ID) })
  .parse(workerData as unknown)
const file = new AtomicWorkspaceFile({
  directory: options.directory,
  ownerId: options.ownerId,
  fileName: DEVICE_WORKSPACE_FILE_NAME,
  parse: (value) => {
    const state = OfflineWorkspaceSchema.parse(value)
    // The worker accepts only the device workspace (D1).
    if (state.ownerId !== DEVICE_OWNER_ID)
      throw new WorkspaceFileError('invalid')
    return state
  },
  // Commands change a few entries; only those are re-validated (#216 perf gate).
  validateChange: validateWorkspaceChange,
})
const archive = new AtomicWorkspaceFile({
  directory: options.directory,
  ownerId: options.ownerId,
  fileName: DEVICE_ARCHIVE_FILE_NAME,
  parse: WorkspaceArchiveSchema.parse,
})
const service = new WorkspaceService(file, Date.now, randomUUID, archive)
/** Quiet period before the archive roll, so it never lands inside a keep. */
const ARCHIVE_IDLE_MS = 1500
let archivedDay: string | null = null
let archiveTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Schedules one archive roll per local day (and one at startup), after a quiet period.
 * `force` adds a roll when an upload drain moved many records back out of the archive.
 * Failures only delay the roll: the workspace keeps every record until it is archived.
 *
 * @example scheduleArchive()
 */
function scheduleArchive(force = false): void {
  const day = new Date().toDateString()
  if ((archivedDay === day && !force) || archiveTimer) return
  archiveTimer = setTimeout(() => {
    archiveTimer = undefined
    service.archiveSettled().then(
      () => {
        archivedDay = day
      },
      () => undefined,
    )
  }, ARCHIVE_IDLE_MS)
  archiveTimer.unref()
}
/**
 * Projects a workspace for the renderer, counting never-uploaded archived keeps as waiting.
 *
 * @param state - A committed workspace.
 * @returns The bounded view.
 * @example return view(await service.clearDue())
 */
function view(state: OfflineWorkspace): WorkspaceView {
  return workspaceView(state, service.archivedPendingCount())
}
const pageSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
})

/** Executes trusted main-process requests in the same process's dedicated storage thread.
 * Domain commands and persisted inputs still cross runtime validation boundaries.
 * @example const result = await dispatch(request)
 */
async function dispatch(request: WorkspaceWorkerRequest): Promise<unknown> {
  switch (request.type) {
    case 'open': {
      // Files written before uploads were derived may hold never-sent entries (#216 D1).
      await service.dropDerivableEntries()
      const opened = view(await service.clearDue())
      scheduleArchive()
      return opened
    }
    case 'archive':
      return { archived: await service.archiveSettled() }
    case 'clearDue':
      return view(await service.clearDue())
    case 'command': {
      const result = await executeCommand(request.input)
      scheduleArchive()
      return result
    }
    case 'draft':
      return readDraft(request.input.categoryId)
    case 'markSentBatch': {
      const sent = await service.markSentBatch(
        request.input.accountId,
        request.input.limit,
      )
      // Records moved back from the archive for upload leave the keep path again soon.
      if (service.needsArchiveRoll()) scheduleArchive(true)
      return sent
    }
    case 'pendingTotal':
      return service.pendingTotal()
    case 'receipts':
      return view(
        await service.acceptReceipts(
          request.input.accountId,
          request.input.receipts,
        ),
      )
    case 'reconcile':
      return view(await service.reconcileCategories(request.input))
    case 'categoryPending':
      return service.categoryPending(request.input.limit)
    case 'markCategorySent':
      return service.markCategorySent(
        request.input.accountId,
        request.input.operationIds,
      )
    case 'categoryReceipts':
      return view(
        await service.acceptCategoryReceipts(
          request.input.accountId,
          request.input.receipts,
        ),
      )
    case 'noteCategoryQuery':
      return view(
        await service.noteCategoryQuery(
          request.input.accountId,
          request.input.operationIds,
        ),
      )
    case 'parkCategory':
      return view(
        await service.parkCategory(
          request.input.accountId,
          request.input.operationIds,
        ),
      )
    case 'syncDetails':
      return service.syncDetails()
    case 'markSynced':
      return view(
        await service.markSynced(request.input.accountId, request.input.at),
      )
    case 'binding': {
      const { binding } = await file.read()
      return binding
        ? {
            accountId: binding.accountId,
            displayEmail: binding.displayEmail,
            lastSyncedAt: binding.lastSyncedAt,
          }
        : null
    }
    case 'localCategory': {
      const { binding } = await file.read()
      const entry = Object.entries(binding?.serverCategoryIds ?? {}).find(
        ([, serverId]) => serverId === request.input.serverId,
      )
      return entry?.[0] ?? null
    }
    case 'recoveryCopies': {
      const { offset, limit } = pageSchema.parse(request.input)
      const state = await file.read()
      const copies = state.recoveryCopies.filter(
        (copy) => copy.restoredTo === undefined,
      )
      return {
        total: copies.length,
        copies: copies.slice(offset, offset + limit),
      }
    }
    case 'pending':
      return service.pendingWork(
        z.number().int().min(1).max(100).parse(request.input.limit),
      )
    case 'undoHistory': {
      const { offset, limit } = pageSchema.parse(request.input)
      const completions = eligibleUndo(await file.read())
      return {
        total: completions.length,
        completions: completions.slice(offset, offset + limit),
      }
    }
    case 'details':
      return readDetails(request.input)
    case 'tracked': {
      const state = await file.read()
      return checkpointIdentities(state, Date.now())
    }
    case 'checkpoint': {
      const state = await service.checkpoint(
        request.input.accountId,
        request.input.expectedRevision,
        request.input.checkpoint,
      )
      return view(state)
    }
    case 'export':
      return exportWriting()
    case 'previewRecovery': {
      const preview = await file.previewRecoveryInfo()
      return {
        workspace: view(preview.workspace),
        savedAt: preview.savedAt,
      }
    }
    case 'recover':
      return view(
        await file.restoreRecovery((current) => ({
          ...current,
          revision: current.revision + 1,
          // A previous file generation cannot prove that a retained queued operation was never sent later.
          checkpoint: null,
          outbox: Object.fromEntries(
            Object.entries(current.outbox).map(([id, entry]) => [
              id,
              entry.state === 'queued'
                ? { ...entry, state: 'sent' as const }
                : entry,
            ]),
          ),
        })),
      )
  }
}

/** Keeps ordinary workspace exports compatible and offers preserved raw files after corruption.
 * @example const json = await exportWriting()
 */
async function exportWriting(): Promise<string> {
  let workspace
  try {
    workspace = await file.read()
  } catch (error) {
    if (!(error instanceof WorkspaceFileError)) throw error
    return file.exportRecoveryFiles()
  }
  // C28/C29: settled history lives in the archive file and must travel with the export.
  try {
    const archived = await archive.read()
    if (
      Object.keys(archived.completions).length ||
      Object.keys(archived.retiredCompletions).length
    )
      return JSON.stringify({ ...workspace, archive: archived }, null, 2)
  } catch (error) {
    if (!(error instanceof WorkspaceFileError)) throw error
    // A missing archive is normal; an unreadable one is exported as raw files, never dropped.
    if (error.reason === 'invalid')
      return JSON.stringify(
        {
          ...workspace,
          archiveRecoveryFiles: JSON.parse(
            await archive.exportRecoveryFiles(),
          ) as unknown,
        },
        null,
        2,
      )
  }
  return JSON.stringify(workspace, null, 2)
}

/** Reads the owned effective category draft without changing the selection.
 * @example await readDraft(categoryId)
 */
async function readDraft(
  requestedCategoryId: string,
): Promise<WorkspaceWorkerCalls['draft']['output']> {
  const state = await file.read()
  const categoryId = effectiveCategory(
    state,
    z.uuid().parse(requestedCategoryId),
  )
  const draft = state.drafts[categoryId]
  if (!draft) throw new WorkspaceCommandError('category-unavailable')
  return { categoryId, draft }
}

/** Publishes a bounded view and the specifically affected draft after a durable command.
 * @example const result = await executeCommand(command)
 */
async function executeCommand(
  command: WorkspaceCommand,
): Promise<WorkspaceWorkerCalls['command']['output']> {
  const state = await service.execute(command)
  const affected =
    'categoryId' in command
      ? command.categoryId
      : 'completionId' in command
        ? (state.completions[command.completionId]?.categoryId ??
          state.selectedCategoryId)
        : 'destinationId' in command
          ? command.destinationId
          : state.selectedCategoryId
  const categoryId = effectiveCategory(state, affected)
  const draft = state.drafts[categoryId]
  if (!draft) throw new WorkspaceCommandError('category-unavailable')
  return { ...view(state), writtenDraft: { categoryId, draft } }
}

/** Returns one page of distinct completion identities, prioritizing records that need repair.
 * @example const page = await readDetails({ offset: 0, limit: 20 })
 */
async function readDetails(
  input: unknown,
): Promise<WorkspaceWorkerCalls['details']['output']> {
  const { offset, limit } = pageSchema.parse(input)
  const state = await file.read()
  const latest = new Map<string, (typeof state.outbox)[string]>()
  for (const entry of Object.values(state.outbox)) {
    const previous = latest.get(entry.operation.completionId)
    if (!previous || previous.operation.revision < entry.operation.revision)
      latest.set(entry.operation.completionId, entry)
  }
  // Keeps that wait for the dashboard have no outbox entry (uploads are derived, #216 D1); they
  // are listed as queued rows keyed by the completion id, which is not a real operation id.
  const grouped = outboxByCompletion(state)
  for (const completion of Object.values(state.completions)) {
    if (latest.has(completion.id)) continue
    const kind = uploadKind(completion, grouped.get(completion.id) ?? [])
    if (kind)
      latest.set(completion.id, {
        state: 'queued',
        operation: buildOperation(
          state.deviceId,
          completion,
          kind,
          completion.id,
        ),
      })
  }
  const entries = [...latest.values()].sort(
    (left, right) =>
      Number(right.state === 'blocked') - Number(left.state === 'blocked'),
  )
  return {
    total: entries.length,
    records: entries.slice(offset, offset + limit).map((entry) => {
      const completion = state.completions[entry.operation.completionId]
      if (!completion) throw new WorkspaceFileError('invalid')
      return { entry, completion }
    }),
  }
}

// The serialized file queue orders state changes; replies contain projections instead of the full history.
parentPort?.on('message', (request: WorkspaceWorkerRequest) => {
  void dispatch(request).then(
    (result) =>
      parentPort?.postMessage({
        requestId: request.requestId,
        ok: true,
        result,
      }),
    (error: unknown) => {
      const reason =
        error instanceof WorkspaceFileError ||
        error instanceof WorkspaceCommandError
          ? error.reason
          : 'storage-failed'
      parentPort?.postMessage({
        requestId: request.requestId,
        ok: false,
        reason,
        ...(error instanceof WorkspaceCommandError && error.detail
          ? { detail: error.detail }
          : {}),
      })
    },
  )
})
