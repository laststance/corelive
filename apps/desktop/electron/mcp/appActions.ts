import { randomUUID } from 'node:crypto'

import type { SignOutResult } from '@corelive/desktop-contract/offline-account'

import { WorkspaceWorkerError } from '../offline/WorkspaceWorkerClient'

import { exportActivityPng } from './activityExport'
import {
  createEditorDispatcher,
  workspaceRefusal,
  type EditorRuntime,
} from './editorActions'
import { createCompletionHistory, McpHistoryError } from './history'
import { McpAccountError } from './historyAuthority'
import { publishExportFile } from './publishExportFile'
import {
  McpActionError,
  mcpFailure,
  mcpSuccess,
  taskAdditionLookupAction,
  type McpResult,
} from './result'
import {
  coreLiveTools,
  dispatchMcpAction,
  parseMcpCall,
  type McpActions,
  type McpCall,
} from './tools'

interface ActionOptions {
  native: (call: McpCall) => Promise<Record<string, unknown> | undefined>
  runtime: EditorRuntime
  profileDirectory: string
  signOutDevice: (run: () => Promise<SignOutResult>) => Promise<SignOutResult>
}

function requireSave(accepted: boolean, action: string) {
  if (!accepted) throw new McpActionError('operation-refused', action)
  return { status: 'saved' }
}

/** Gives one authenticated helper access to named app actions, retaining cursors in the ordinary app.
 * Editor calls share a flush barrier. The handler never interprets caller input as an IPC channel or URL.
 * @example const actions = createAppActions({runtime,profileDirectory,native,signOutDevice})
 */
export function createAppActions(options: ActionOptions) {
  const { runtime, profileDirectory } = options
  const { controller, ipc } = runtime
  const history = createCompletionHistory(runtime)
  const dispatchEditor = createEditorDispatcher(controller, ipc)

  async function endAccount(action: Promise<SignOutResult>) {
    const result = await action
    if (result.status === 'flush-failed')
      throw new McpActionError(
        'flush-failed',
        'Save pending LiveEditor writing before retrying.',
      )
    if (result.status === 'signed-out-residual')
      throw new McpActionError(
        'signout-residual',
        'The account is detached. Use clear_local_session_again to finish clearing the session.',
        'partial',
      )
    return { status: result.status }
  }

  async function run(
    sessionId: string,
    call: McpCall,
  ): Promise<Record<string, unknown>> {
    // A long-running Mac app can move between time zones. Pin the local zone for this request.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const generation = controller.getSnapshot().generation
    const binding = controller.mcpAccountBinding()
    const assertCurrent = (): void => {
      if (
        controller.getSnapshot().generation !== generation ||
        binding?.signal.aborted ||
        controller.mcpAccountBinding()?.epoch !== binding?.epoch
      )
        throw new McpAccountError('account-changed', false)
    }
    const backup = async () => {
      // The recovery worker can export stored writing even when no editable document can be flushed.
      const json =
        controller.getSnapshot().phase === 'ready'
          ? (await dispatchEditor({ name: 'export_workspace', args: {} }))
              .writing
          : await controller.export(generation)
      assertCurrent()
      if (typeof json !== 'string')
        throw new McpActionError(
          'workspace-unavailable',
          'Inspect the workspace recovery state.',
        )
      return json
    }
    const actions: McpActions = {
      list_completions: async (args) => ({
        ...(await history.list(sessionId, args)),
      }),
      read_dashboard_overview: async () => ({
        ...(await controller.withMcpAccount(async (client, signal) =>
          client.home.bootstrap(
            {
              heatmap: { days: 365, timezone },
              journal: { limit: 10, offset: 0 },
            },
            { signal },
          ),
        )),
      }),
      read_activity_day: async (args) => ({
        ...(await controller.withMcpAccount(async (client, signal) =>
          client.completed.dayDetail({ date: args.day, timezone }, { signal }),
        )),
      }),
      read_activity_heatmap: async (args) => ({
        heatmap: await controller.withMcpAccount(async (client, signal) =>
          client.completed.heatmap({ days: args.days, timezone }, { signal }),
        ),
      }),
      export_activity_png: async (args) => {
        if (!binding) throw new McpAccountError('account-required', false)
        return exportActivityPng(args, {
          profileDirectory,
          readDay: async (input) =>
            controller.withMcpAccount(
              async (client, signal) =>
                client.completed.dayDetail(input, { signal }),
              binding.signal,
            ),
          assertAccountCurrent: assertCurrent,
        })
      },
      read_dashboard_appearance: async () => ({
        ...(await controller.withMcpAccount(async (client, signal) =>
          client.dashboardAppearance.get(undefined, { signal }),
        )),
      }),
      set_dashboard_appearance: async (args) => ({
        ...(await controller.withMcpAccount(async (client, signal) =>
          client.dashboardAppearance.set(args, { signal }),
        )),
      }),
      read_skill_tree: async () => ({
        tree: await controller.withMcpAccount(async (client, signal) =>
          client.skillTree.getMyTree(undefined, { signal }),
        ),
      }),
      list_unassigned_skill_tasks: async () => ({
        tasks: await controller.withMcpAccount(async (client, signal) =>
          client.skillTree.getUnassignedPool(undefined, { signal }),
        ),
      }),
      assign_task_to_skill: async (args) => ({
        assignment: await controller.withMcpAccount(async (client, signal) =>
          client.skillTree.assignTask(args, { signal }),
        ),
      }),
      remove_skill_assignment: async (args) => ({
        assignment: await controller.withMcpAccount(async (client, signal) =>
          client.skillTree.unassignTask(args, { signal }),
        ),
      }),
      read_account_status: () => ({ ...ipc.accountStatus() }),
      open_sign_in: () => {
        const result = ipc.signIn.start()
        if (result.status === 'offline')
          throw new McpActionError(
            'account-unavailable',
            'Reconnect to the network to open sign-in.',
          )
        return result
      },
      cancel_sign_in: () => {
        ipc.signIn.cancel()
        return { status: 'closed' }
      },
      connect_account: async ({ promptId }) => {
        if (!(await controller.connect(promptId)))
          throw workspaceRefusal('connection-not-pending')
        return { status: 'saved' }
      },
      acknowledge_first_upload: () => {
        controller.acknowledgeFirstUpload()
        return { status: 'acknowledged' }
      },
      defer_account_connection: async ({ promptId }) =>
        endAccount(
          options.signOutDevice(async () => controller.notNow(promptId)),
        ),
      sign_out: async () =>
        endAccount(options.signOutDevice(async () => controller.signOut())),
      clear_local_session_again: async () =>
        endAccount(controller.clearAgain()),
      retry_sync: () => {
        controller.retrySync()
        return { status: 'requested' }
      },
      read_sync_details: async () => ({
        ...(await controller.syncDetails(generation)),
      }),
      preview_recovery: async () => ({
        ...(await controller.previewRecovery(generation)),
      }),
      recover_workspace: async () =>
        requireSave(
          await controller.recover(generation),
          'Inspect the available recovery backup.',
        ),
      export_workspace: async () => ({
        format: 'json',
        writing: await backup(),
      }),
      save_workspace_backup: async (args) =>
        publishExportFile({
          filename: args.filename,
          overwrite: args.overwrite,
          bytes: Buffer.from(await backup()),
          profileDirectory,
          beforePublish: assertCurrent,
        }),
    }
    return (
      (await dispatchMcpAction(actions, call)) ??
      (await options.native(call)) ??
      dispatchEditor(call)
    )
  }
  return {
    async call(
      sessionId: string,
      name: string,
      input: unknown,
    ): Promise<McpResult> {
      let call: McpCall | undefined
      try {
        call = parseMcpCall(name, input)
        return mcpSuccess(await run(sessionId, call))
      } catch (error) {
        return actionFailure(name, call, error)
      }
    },
    closeSession: (sessionId: string): void => history.closeSession(sessionId),
  }
}

/** Reports the committed effect of a failed operation without including secrets or draft text in diagnostics.
 * @example actionFailure(name, call, error)
 */
function actionFailure(
  name: string,
  call: McpCall | undefined,
  error: unknown,
): McpResult {
  const operationId =
    call?.name === 'append_unfinished_task'
      ? { operationId: call.args.operationId }
      : {}
  if (error instanceof McpActionError)
    return mcpFailure(name, error.code, error.effect, error.nextAction, {
      ...operationId,
      ...error.detail,
    })
  if (error instanceof McpHistoryError)
    return mcpFailure(
      name,
      error.code,
      'none',
      'Start a fresh completion-history read for the current account and category.',
    )
  if (error instanceof McpAccountError) return accountFailure(name, error)
  const writing = call !== undefined && !coreLiveTools[call.name].readOnly
  if (error instanceof WorkspaceWorkerError) {
    const problem = workspaceRefusal(error.reason)
    return mcpFailure(
      name,
      problem.code,
      writing ? problem.effect : 'none',
      call?.name === 'append_unfinished_task' && problem.effect === 'unknown'
        ? taskAdditionLookupAction
        : problem.nextAction,
      operationId,
    )
  }
  const reference = randomUUID()
  // A generated reference links redacted stderr to the client without logging notes, paths, or tokens.
  process.stderr.write('CoreLive MCP operation failed (' + reference + ')\n')
  return mcpFailure(
    name,
    'operation-unavailable',
    writing ? 'unknown' : 'none',
    'Inspect the current CoreLive state. For a task addition, look up the original operation ID.',
    { reference, ...operationId },
  )
}

/** Distinguishes a rejected account change from a dispatched write with an unknown outcome.
 * @example accountFailure('assign_task_to_skill', error)
 */
function accountFailure(name: string, error: McpAccountError) {
  const mutation =
    name === 'assign_task_to_skill' ||
    name === 'remove_skill_assignment' ||
    name === 'set_dashboard_appearance'
  return mcpFailure(
    name,
    error.code,
    mutation && error.dispatched && !error.definiteRefusal ? 'unknown' : 'none',
    'Inspect the connected account and current state before retrying.',
  )
}
