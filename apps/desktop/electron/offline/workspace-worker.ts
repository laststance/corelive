import { parentPort, workerData } from 'node:worker_threads'

import {
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  type WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { z } from 'zod'

import { AtomicWorkspaceFile, WorkspaceFileError } from './AtomicWorkspaceFile'
import {
  eligibleUndo,
  workspaceView,
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
})
const service = new WorkspaceService(file)
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
    case 'open':
      return workspaceView(await service.clearDue())
    case 'clearDue':
      return workspaceView(await service.clearDue())
    case 'command':
      return executeCommand(request.input)
    case 'draft':
      return readDraft(request.input.categoryId)
    case 'markSentBatch':
      return service.markSentBatch(
        request.input.accountId,
        request.input.operationIds,
      )
    case 'receipts':
      return workspaceView(
        await service.acceptReceipts(
          request.input.accountId,
          request.input.receipts,
        ),
      )
    case 'reconcile':
      return workspaceView(await service.reconcileCategories(request.input))
    case 'categoryPending':
      return service.categoryPending(request.input.limit)
    case 'markCategorySent':
      return service.markCategorySent(
        request.input.accountId,
        request.input.operationIds,
      )
    case 'categoryReceipts':
      return workspaceView(
        await service.acceptCategoryReceipts(
          request.input.accountId,
          request.input.receipts,
        ),
      )
    case 'noteCategoryQuery':
      return workspaceView(
        await service.noteCategoryQuery(
          request.input.accountId,
          request.input.operationIds,
        ),
      )
    case 'parkCategory':
      return workspaceView(
        await service.parkCategory(
          request.input.accountId,
          request.input.operationIds,
        ),
      )
    case 'syncDetails':
      return service.syncDetails()
    case 'markSynced':
      return workspaceView(
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
    case 'pending': {
      const state = await file.read()
      const limit = z.number().int().min(1).max(100).parse(request.input.limit)
      const serverIds = state.binding?.serverCategoryIds ?? {}
      return Object.values(state.outbox)
        .filter(
          (entry) =>
            // Uncertain work is always recoverable; queued work needs its category on the server.
            entry.state === 'sent' ||
            (entry.state === 'queued' &&
              serverIds[entry.operation.categoryId] !== undefined),
        )
        .sort(
          (left, right) =>
            Number(right.operation.kind === 'cancel') -
            Number(left.operation.kind === 'cancel'),
        )
        .slice(0, limit)
    }
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
      return workspaceView(state)
    }
    case 'export':
      return exportWriting()
    case 'previewRecovery': {
      const preview = await file.previewRecoveryInfo()
      return {
        workspace: workspaceView(preview.workspace),
        savedAt: preview.savedAt,
      }
    }
    case 'recover':
      return workspaceView(
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
  try {
    return JSON.stringify(await file.read(), null, 2)
  } catch (error) {
    if (!(error instanceof WorkspaceFileError)) throw error
    return file.exportRecoveryFiles()
  }
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
  return { ...workspaceView(state), writtenDraft: { categoryId, draft } }
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
