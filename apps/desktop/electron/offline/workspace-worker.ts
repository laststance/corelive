import { parentPort, workerData } from 'node:worker_threads'

import {
  OfflineWorkspaceSchema,
  type WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace'
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
  .object({ directory: z.string(), ownerId: z.string().min(1) })
  .parse(workerData as unknown)
const file = new AtomicWorkspaceFile({
  directory: options.directory,
  ownerId: options.ownerId,
  parse: (value) => {
    const state = OfflineWorkspaceSchema.parse(value)
    if (state.ownerId !== options.ownerId)
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
    case 'prepare':
      return prepareWorkspace(request.input)
    case 'command':
      return executeCommand(request.input)
    case 'draft':
      return readDraft(request.input.categoryId)
    case 'markSent':
      return workspaceView(await service.markSent(request.input.operationId))
    case 'markSentBatch': {
      const state = await service.markSentBatch(request.input.operationIds)
      return request.input.operationIds.flatMap((id) =>
        state.outbox[id]?.state === 'sent' ? [state.outbox[id]] : [],
      )
    }
    case 'receipts':
      return workspaceView(
        await service.acceptReceipts(
          request.input.ownerId,
          request.input.receipts,
        ),
      )
    case 'receipt':
      return workspaceView(
        await service.acceptReceipt(
          request.input.ownerId,
          request.input.receipt,
        ),
      )
    case 'categories':
      return workspaceView(
        await service.refreshCategories(
          request.input.categories,
          request.input.deletions,
          request.input.legacyNotes,
        ),
      )
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
      return Object.values(state.outbox)
        .filter((entry) => entry.state !== 'blocked')
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
        request.input.expectedRevision,
        request.input.checkpoint,
      )
      return workspaceView(state)
    }
    case 'export':
      return JSON.stringify(await file.read(), null, 2)
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

/** Validates main's account identity before first workspace initialization.
 * @example await prepareWorkspace(input)
 */
async function prepareWorkspace(
  input: WorkspaceWorkerCalls['prepare']['input'],
): Promise<WorkspaceWorkerCalls['prepare']['output']> {
  if (input.ownerId !== options.ownerId) throw new WorkspaceFileError('invalid')
  return workspaceView(await service.prepare(input))
}

/** Reads the owned effective category draft without changing the selection.
 * @example await readDraft(categoryId)
 */
async function readDraft(
  requestedCategoryId: number,
): Promise<WorkspaceWorkerCalls['draft']['output']> {
  const state = await file.read()
  const categoryId = effectiveCategory(
    state,
    z.number().int().positive().parse(requestedCategoryId),
  )
  const draft = state.drafts[String(categoryId)]
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
  const draft = state.drafts[String(categoryId)]
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
      })
    },
  )
})
