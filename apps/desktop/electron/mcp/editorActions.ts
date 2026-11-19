import { randomUUID } from 'node:crypto'

import type {
  OfflineEditorSnapshot,
  TaskAddition,
  WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { createCategoryHierarchy } from '@corelive/live-editor/categoryHierarchy'

import type { OfflineEditorController } from '../offline/OfflineEditorController'
import type { OfflineEditorIPC } from '../offline/OfflineEditorIPC'

import { McpActionError } from './result'
import { dispatchMcpAction, type McpActions, type McpCall } from './tools'

export type EditorRuntime = {
  controller: OfflineEditorController
  ipc: OfflineEditorIPC
}
type Ready = Extract<OfflineEditorSnapshot, { phase: 'ready' }>
type CommandIntent = WorkspaceCommand extends infer C
  ? C extends WorkspaceCommand
    ? Omit<C, 'commandId'>
    : never
  : never

const nextSteps: Record<string, string> = {
  'category-unavailable': 'List categories and confirm the intended target.',
  'revision-conflict':
    'Read the current revision and preserve intervening edits before saving.',
  'command-conflict':
    'Inspect the original operation. A separate request requires a fresh operation ID.',
  'undo-expired': 'The Undo window has closed. Read the current completion.',
  'account-changed':
    'Read the current account and category before starting a new request.',
  'connection-not-pending':
    'Read the account status. Only a pending connection can be declined.',
  'invalid-row': 'Read the current row IDs and check the editor input limit.',
}

/** Translates workspace refusals into caller-safe recovery instructions without returning worker diagnostics.
 * @example workspaceRefusal('revision-conflict', {categoryId})
 */
export function workspaceRefusal(
  reason: string,
  detail: Record<string, unknown> = {},
) {
  const interrupted = [
    'storage-failed',
    'worker-unavailable',
    'worker-crashed',
    'worker-exit',
    'worker-closed',
  ].includes(reason)
  return new McpActionError(
    reason,
    interrupted
      ? 'Check the original operation ID before attempting another change.'
      : (nextSteps[reason] ??
          'Read the current CoreLive state and check the requested operation.'),
    interrupted ? 'unknown' : 'none',
    detail,
  )
}

/** Returns only the fields an agent needs to confirm a durable save; the account/device scope stays in CoreLive.
 * @example additionResult(operationId, saved)
 */
function additionResult(operationId: string, saved: TaskAddition) {
  return {
    status: 'saved',
    operationId,
    categoryId: saved.categoryId,
    categoryPath: saved.categoryPath,
    rowId: saved.rowId,
    title: saved.title,
  }
}

/** Returns a bounded portion of one saved note, using UTF-16 offsets that keep Unicode pairs together.
 * The revision from the first page lets a client detect edits before continuing.
 * @example draftTextPage(text, 3, { offset: 0, limit: 32768 })
 */
function draftTextPage(
  text: string,
  revision: number,
  page: NonNullable<
    Extract<McpCall, { name: 'read_draft' }>['args']['textPage']
  >,
) {
  if (page.expectedRevision !== undefined && revision !== page.expectedRevision)
    throw workspaceRefusal('revision-conflict', {
      expectedRevision: page.expectedRevision,
      currentRevision: revision,
    })
  if (page.offset > text.length)
    throw new McpActionError(
      'invalid-input',
      'Use a nextOffset from a previous page, or start at zero.',
    )
  let end = Math.min(text.length, page.offset + page.limit)
  // Include the trailing unit of a surrogate pair when the nominal boundary falls inside it.
  const nextUnit = text.charCodeAt(end)
  if (nextUnit >= 0xdc00 && nextUnit <= 0xdfff) end++
  return {
    text: text.slice(page.offset, end),
    offset: page.offset,
    nextOffset: end < text.length ? end : null,
    totalLength: text.length,
  }
}

/** Executes a single editor or category operation against one flushed snapshot and the ordinary storage actor.
 * @example await runEditorAction(runtime, snapshot, parseMcpCall('read_draft',{}))
 */
async function runEditorAction(
  controller: OfflineEditorController,
  snapshot: Ready,
  call: McpCall,
  selectedAtStart = snapshot.workspace.selectedCategoryId,
): Promise<Record<string, unknown>> {
  const { generation, workspace } = snapshot
  const active = workspace.categories.filter((c) => !c.removed && !c.historical)
  const paths = createCategoryHierarchy(active).paths
  const requireCategory = (id: string) => {
    if (!paths.has(id))
      throw workspaceRefusal('category-unavailable', { categoryId: id })
    return id
  }
  const command = async (
    intent: CommandIntent,
    result: Record<string, unknown> = {},
  ) => {
    const outcome = await controller.command(generation, {
      ...intent,
      commandId: randomUUID(),
    })
    if (!outcome.ok) {
      const detail: Record<string, unknown> = {
        ...result,
        ...(outcome.detail ? { detail: outcome.detail } : {}),
      }
      if (outcome.reason === 'revision-conflict' && 'baseRevision' in intent) {
        const { draft, categoryId } = await controller.draft(
          generation,
          intent.categoryId,
        )
        if (categoryId === intent.categoryId)
          Object.assign(detail, {
            expectedRevision: intent.baseRevision,
            currentRevision: draft.revision,
          })
      }
      throw workspaceRefusal(outcome.reason, detail)
    }
    if (!outcome.workspace)
      throw new McpActionError(
        'account-changed',
        'Inspect the original operation before repeating the change.',
        'unknown',
      )
    // The next change uses the revision of the edited document or preferences, even if other categories changed.
    let revision = outcome.revision
    if ('baseRevision' in intent && outcome.writtenDraft)
      revision = outcome.writtenDraft.draft.revision
    if (intent.type === 'preferences')
      revision = outcome.workspace.preferences.revision
    return { ...result, status: 'saved', revision }
  }
  const actions: McpActions = {
    export_workspace: async () => ({
      writing: await controller.export(generation),
    }),
    read_draft: async (args) => {
      const id = requireCategory(
        args.categoryId ?? workspace.selectedCategoryId,
      )
      const { categoryId, draft } = await controller.draft(generation, id)
      if (id !== categoryId)
        throw workspaceRefusal('category-unavailable', { categoryId: id })
      const text = draft.rows.map((row) => row.text).join('\n')
      return {
        categoryId,
        categoryPath: paths.get(id),
        revision: draft.revision,
        ...(args.textPage
          ? draftTextPage(text, draft.revision, args.textPage)
          : { text, rows: draft.rows }),
      }
    },
    append_unfinished_task: async (args) =>
      additionResult(
        args.operationId,
        await controller.appendMcpTask(generation, {
          ...args,
          selectedAtStart,
        }),
      ),
    get_task_addition_result: async ({ operationId, original }) => {
      const saved = await controller.findMcpTask(
        generation,
        operationId,
        original,
      )
      if (!saved)
        throw new McpActionError(
          'result-unknown',
          'Report the unconfirmed addition without resending it.',
          'unknown',
          { operationId },
        )
      return additionResult(operationId, saved)
    },
    list_categories: () => ({
      selectedCategoryId: workspace.selectedCategoryId,
      categories: active.map(({ id, name, parentId, color, isDefault }) => ({
        categoryId: id,
        name,
        parentId,
        color,
        isDefault,
        path: paths.get(id),
      })),
    }),
    edit_draft: async (args) =>
      command(
        {
          type: 'save',
          requireActiveCategory: true,
          ...args,
          categoryId: requireCategory(args.categoryId),
        },
        { categoryId: args.categoryId, baseRevision: args.baseRevision },
      ),
    complete_draft_line: async (args) => {
      const completionId = randomUUID()
      return command(
        {
          type: 'complete',
          ...args,
          requireActiveCategory: true,
          categoryId: requireCategory(args.categoryId),
          completionId,
          completedAt: Date.now(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        { completionId, categoryId: args.categoryId, rowId: args.rowId },
      )
    },
    record_completed_task: async (args) => {
      const categoryId = requireCategory(
        args.categoryId ?? workspace.selectedCategoryId,
      )
      const completionId = randomUUID()
      return command(
        {
          type: 'recordCompletedTask',
          categoryId,
          completionId,
          title: args.title,
          completedAt: args.completedAt
            ? Date.parse(args.completedAt)
            : Date.now(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        { completionId, categoryId },
      )
    },
    undo_completion: async (args) => command({ type: 'undo', ...args }, args),
    clear_completed_line: async (args) =>
      command({ type: 'clear', ...args }, args),
    correct_completion_time: async (args) =>
      command(
        {
          type: 'correctTime',
          completionId: args.completionId,
          completedAt: Date.parse(args.completedAt),
        },
        args,
      ),
    list_undoable_completions: async (args) =>
      controller.undoHistory(generation, args.offset, args.limit),
    select_category: async (args) =>
      command(
        {
          type: 'select',
          requireActiveCategory: true,
          categoryId: requireCategory(args.categoryId),
        },
        args,
      ),
    create_category: async (args) => {
      const categoryId = randomUUID()
      return command(
        { type: 'categoryCreate', categoryId, ...args },
        { categoryId },
      )
    },
    rename_category: async (args) =>
      command({ type: 'categoryRename', ...args }, args),
    recolor_category: async (args) =>
      command({ type: 'categoryRecolor', ...args }, args),
    move_category: async (args) =>
      command({ type: 'categoryReparent', ...args }, args),
    promote_category: async (args) =>
      command({ type: 'categoryReparent', ...args, parentId: null }, args),
    delete_category: async (args) =>
      command({ type: 'categoryDelete', ...args }, args),
    move_removed_category_writing: async (args) =>
      command({ type: 'moveCategory', ...args }, args),
    update_editor_preferences: async (args) =>
      command({ type: 'preferences', ...args }),
    retry_completion_sync: async (args) =>
      command({ type: 'retrySync', ...args }, args),
    resolve_completion_conflict: async (args) =>
      command({ type: 'resolveConflict', ...args }, args),
    resolve_sync_detail: async (args) =>
      command({ type: 'syncDetailAction', ...args }),
    restore_recovery_copy: async (args) =>
      command({ type: 'restoreRecovery', ...args }, args),
    list_recovery_copies: async (args) =>
      controller.recoveryCopies(generation, args.offset, args.limit),
    list_pending_records: async (args) =>
      controller.details(generation, args.offset, args.limit),
  }
  const result = await dispatchMcpAction(actions, call)
  if (!result)
    throw new McpActionError(
      'unknown-tool',
      'List CoreLive tools and choose the intended operation.',
    )
  return result
}

/** Coordinates each agent's draft read or mutation with the live renderer and other MCP clients.
 * @example const dispatch = createEditorDispatcher(controller, ipc)
 */
export function createEditorDispatcher(
  controller: OfflineEditorController,
  ipc: Pick<OfflineEditorIPC, 'flush' | 'shown'>,
) {
  let editorTail = Promise.resolve()
  return async (call: McpCall): Promise<Record<string, unknown>> => {
    // Serialize MCP challenges so a second helper cannot release the first helper's typing barrier.
    const execute = async () => {
      const snapshot = await controller.readSnapshot()
      if (snapshot.phase !== 'ready')
        throw new McpActionError(
          'workspace-unavailable',
          'Open CoreLive and inspect workspace recovery.',
        )
      if (call.name === 'get_task_addition_result')
        return runEditorAction(controller, snapshot, call)
      const binding = controller.mcpAccountBinding()
      try {
        let flushed = await ipc.flush(snapshot.generation)
        // An unacknowledged pre-write challenge cannot have dispatched the addition. Only this safe retry is automatic.
        if (
          !flushed &&
          call.name === 'append_unfinished_task' &&
          !binding?.signal.aborted
        )
          flushed = await ipc.flush(snapshot.generation)
        if (!flushed)
          throw new McpActionError(
            'flush-failed',
            'Finish typing or composing in LiveEditor and retry.',
          )
        const current = await controller.readSnapshot()
        if (
          current.phase !== 'ready' ||
          current.generation !== snapshot.generation ||
          binding?.signal.aborted ||
          (binding?.epoch ?? null) !==
            (controller.mcpAccountBinding()?.epoch ?? null)
        )
          throw workspaceRefusal('account-changed')
        return await runEditorAction(
          controller,
          current,
          call,
          snapshot.workspace.selectedCategoryId,
        )
      } finally {
        ipc.shown()
      }
    }
    const operation = editorTail.then(execute)
    editorTail = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }
}
