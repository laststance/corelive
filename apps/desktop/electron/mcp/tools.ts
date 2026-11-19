import { CategoryColorSchema } from '@corelive/desktop-contract/category'
import { SyncDetailActionSchema } from '@corelive/desktop-contract/category-sync'
import { McpHistoryInputSchema } from '@corelive/desktop-contract/completion-history'
import { SHORTCUT_OPEN_SOUND_CUES } from '@corelive/desktop-contract/constants'
import { DashboardThemeSchema } from '@corelive/desktop-contract/dashboard-appearance'
import {
  LIVE_EDITOR_FONT_FAMILY_IDS,
  LIVE_EDITOR_FONT_SIZE_MIN_PX,
  LIVE_EDITOR_FONT_SIZE_MAX_PX,
  LIVE_EDITOR_TEXT_COLOR_PATTERN,
  LIVE_EDITOR_CLEAR_DELAY_MIN_MS,
  LIVE_EDITOR_CLEAR_DELAY_MAX_MS,
  LIVE_EDITOR_TOAST_DURATION_MIN_MS,
  LIVE_EDITOR_TOAST_DURATION_MAX_MS,
} from '@corelive/desktop-contract/live-editor-constants'
import { DraftRowSchema } from '@corelive/desktop-contract/offline-workspace'
import { THEME_IDS } from '@corelive/live-editor/themes'
import { z } from 'zod'

import {
  LiveEditorWindowDimensionSchema,
  ShortcutAcceleratorSchema,
} from '../ipc/ipc-schemas'

import { McpActionError } from './result'

const id = z.uuid()
const positiveId = z.number().int().positive()
const revision = z.number().int().nonnegative()
const day = z.iso.date()
const name = z.string().trim().min(1).max(30)
const title = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\r\n\0]+$/)
const selected = {
  categoryId: id
    .optional()
    .describe(
      'Local category UUID. When continuing a draft read, pass the UUID returned by read_draft.',
    ),
}
const pagination = {
  offset: revision.default(0),
  limit: positiveId.max(100).default(50),
}
const assignment = { nodeId: positiveId, todoId: positiveId }
const flag = { enabled: z.boolean() }
const target = { window: z.enum(['editor', 'settings']).default('editor') }
const empty = z.strictObject({})
// An agent patch must contain only explicitly supplied settings; storage defaults belong to initial creation.
const editorPatch = z
  .strictObject({
    liveEditorShowStatusBar: z.boolean(),
    showTodayEmber: z.boolean(),
    liveEditorFontFamily: z.enum(LIVE_EDITOR_FONT_FAMILY_IDS),
    liveEditorFontSizePx: z
      .number()
      .min(LIVE_EDITOR_FONT_SIZE_MIN_PX)
      .max(LIVE_EDITOR_FONT_SIZE_MAX_PX),
    liveEditorTextColor: z.string().regex(LIVE_EDITOR_TEXT_COLOR_PATTERN),
    liveEditorClearOnComplete: z.boolean(),
    liveEditorClearDelayMs: z
      .int()
      .min(LIVE_EDITOR_CLEAR_DELAY_MIN_MS)
      .max(LIVE_EDITOR_CLEAR_DELAY_MAX_MS),
    liveEditorToastDurationMs: z
      .int()
      .min(LIVE_EDITOR_TOAST_DURATION_MIN_MS)
      .max(LIVE_EDITOR_TOAST_DURATION_MAX_MS),
  })
  .partial()

/** Defines one discoverable operation for both the stdio server and trusted app dispatcher.
 * @example tool('Read the selected category.', true, empty)
 */
function tool<S extends z.ZodObject>(
  description: string,
  readOnly: boolean,
  inputSchema: S,
) {
  return { description, readOnly, inputSchema }
}

export const coreLiveTools = {
  read_draft: tool(
    'Read saved text, row IDs, revision and category path, including pending typing. For a large note request textPage starting at offset 0. For each continuation, supply the first page’s categoryId and revision as expectedRevision, and use the previous nextOffset as offset.',
    true,
    z
      .strictObject({
        ...selected,
        textPage: z
          .strictObject({
            offset: revision,
            limit: positiveId.max(65536).default(32768),
            expectedRevision: revision.optional(),
          })
          .optional(),
      })
      .refine(
        ({ categoryId, textPage }) =>
          !textPage ||
          textPage.offset === 0 ||
          (categoryId !== undefined && textPage.expectedRevision !== undefined),
        {
          path: ['textPage'],
          message: 'A continuation requires categoryId and expectedRevision.',
        },
      ),
  ),
  append_unfinished_task: tool(
    'Append one unfinished task to the draft. Generate a fresh UUID for this request. Keep it for get_task_addition_result after an interrupted response. Pass the categoryId from read_draft for a combined request.',
    false,
    z.strictObject({ ...selected, title, operationId: id }),
  ),
  get_task_addition_result: tool(
    'Check whether this original task addition was saved after reconnecting. A missing receipt means unknown. Never retry a write on evidence of a missing receipt.',
    true,
    z.strictObject({
      operationId: id,
      original: z
        .strictObject({ ...selected, title })
        .optional()
        .describe(
          'When supplied, verify the original title and category choice. Omit its categoryId if the original addition used the selected category.',
        ),
    }),
  ),
  edit_draft: tool(
    'Save the rows of a draft at the specified revision. Preserve existing row IDs, use fresh UUIDs for new rows and read again if the revision changes.',
    false,
    z.strictObject({
      categoryId: id,
      baseRevision: revision,
      rows: z.array(
        z.strictObject({
          ...DraftRowSchema.shape,
          text: z.string().regex(/^[^\n]*$/),
        }),
      ),
    }),
  ),
  complete_draft_line: tool(
    'Mark an existing draft row complete and record it in history.',
    false,
    z.strictObject({ categoryId: id, rowId: id, baseRevision: revision }),
  ),
  record_completed_task: tool(
    'Record already completed work in history without appending an unfinished task.',
    false,
    z.strictObject({
      ...selected,
      title,
      completedAt: z.iso.datetime({ offset: true }).optional(),
    }),
  ),
  undo_completion: tool(
    'Restore an eligible completed line during its Undo window.',
    false,
    z.strictObject({ completionId: id }),
  ),
  list_undoable_completions: tool(
    'Read completions that are still eligible for Undo.',
    true,
    z.strictObject(pagination),
  ),
  clear_completed_line: tool(
    'Clear an eligible finished line from the editor while retaining its history.',
    false,
    z.strictObject({ completionId: id }),
  ),
  correct_completion_time: tool(
    'Correct the completion time on this Mac.',
    false,
    z.strictObject({
      completionId: id,
      completedAt: z.iso.datetime({ offset: true }),
    }),
  ),
  list_categories: tool(
    'List categories on this Mac, their full paths, parents, colors, and current selection.',
    true,
    empty,
  ),
  select_category: tool(
    'Select a category in LiveEditor.',
    false,
    z.strictObject({ categoryId: id }),
  ),
  create_category: tool(
    'Create a category in the root or under a parent.',
    false,
    z.strictObject({
      name,
      color: CategoryColorSchema.default('blue'),
      parentId: id.nullable().default(null),
    }),
  ),
  rename_category: tool(
    'Rename a category.',
    false,
    z.strictObject({ categoryId: id, name }),
  ),
  recolor_category: tool(
    'Change the category color.',
    false,
    z.strictObject({ categoryId: id, color: CategoryColorSchema }),
  ),
  move_category: tool(
    'Move a category to another parent.',
    false,
    z.strictObject({ categoryId: id, parentId: id }),
  ),
  promote_category: tool(
    'Move a category to the top level.',
    false,
    z.strictObject({ categoryId: id }),
  ),
  delete_category: tool(
    'Delete a category and move its writing and completions to the selected destination.',
    false,
    z.strictObject({ categoryId: id, destinationId: id }),
  ),
  move_removed_category_writing: tool(
    'Move writing from a removed category into a surviving category.',
    false,
    z.strictObject({ sourceId: id, destinationId: id }),
  ),
  list_completions: tool(
    "List this Mac’s completions and the connected account's verified history. Defaults to today in this Mac's timezone and all categories. Dates are inclusive. Search is literal. Follow nextCursor until the period is complete.",
    true,
    McpHistoryInputSchema,
  ),
  read_activity_day: tool(
    'Read the connected dashboard’s totals, categories and completed items for a local calendar day.',
    true,
    z.strictObject({ day }),
  ),
  read_dashboard_overview: tool(
    'Read the account dashboard summary shown on Home.',
    true,
    empty,
  ),
  read_activity_heatmap: tool(
    'Read activity by day for the current account, including category breakdowns.',
    true,
    z.strictObject({ days: positiveId.max(365).default(365) }),
  ),
  export_activity_png: tool(
    'Save the dashboard activity card as a PNG on this Mac. A filename alone goes in CoreLive’s Exports folder. Supply an absolute path including the filename to choose another folder. Set overwrite only when requested. Returns the saved absolute path.',
    false,
    z.strictObject({
      day,
      filename: z.string().min(1).optional(),
      overwrite: z.boolean().default(false),
    }),
  ),
  read_skill_tree: tool(
    'Read the connected account’s skill tree, node assignments and edges.',
    true,
    empty,
  ),
  list_unassigned_skill_tasks: tool(
    'List completed tasks eligible for skill assignment.',
    true,
    empty,
  ),
  assign_task_to_skill: tool(
    'Assign an eligible completed task to a skill node.',
    false,
    z.strictObject(assignment),
  ),
  remove_skill_assignment: tool(
    'Remove a completed task from a skill node.',
    false,
    z.strictObject(assignment),
  ),
  read_dashboard_appearance: tool(
    'Read the theme saved for the connected dashboard account. A null theme means the account has not selected one yet.',
    true,
    empty,
  ),
  set_dashboard_appearance: tool(
    'Set the dashboard theme across browsers for this connected account. Choose system to follow each browser’s system appearance.',
    false,
    z.strictObject({ theme: DashboardThemeSchema }),
  ),
  read_settings: tool(
    'Read editor preferences, theme, app version, shortcuts and window settings.',
    true,
    empty,
  ),
  update_editor_preferences: tool(
    'Save the supplied editor display and behavior preferences at their current revision.',
    false,
    z.strictObject({
      expectedRevision: revision,
      patch: editorPatch,
      theme: z.enum(['system', ...THEME_IDS]).optional(),
    }),
  ),
  set_editor_opacity: tool(
    'Set the opacity of the LiveEditor window.',
    false,
    z.strictObject({ opacity: z.number().min(0.3).max(1) }),
  ),
  set_editor_bounds: tool(
    'Move or resize an open LiveEditor window on this Mac.',
    false,
    z.strictObject({
      x: z.int(),
      y: z.int(),
      width: LiveEditorWindowDimensionSchema.int(),
      height: LiveEditorWindowDimensionSchema.int(),
    }),
  ),
  set_editor_always_on_top: tool(
    'Set whether LiveEditor floats above other windows.',
    false,
    z.strictObject(flag),
  ),
  set_editor_on_all_spaces: tool(
    'Set whether LiveEditor appears on every macOS Space.',
    false,
    z.strictObject(flag),
  ),
  set_editor_shortcut: tool(
    'Change a keyboard shortcut used to open LiveEditor. An empty accelerator disables that slot.',
    false,
    z.strictObject({
      slot: z.enum(['primary', 'secondary']),
      accelerator: ShortcutAcceleratorSchema,
    }),
  ),
  set_shortcut_sound_enabled: tool(
    'Turn the editor-opening sound on or off.',
    false,
    z.strictObject(flag),
  ),
  preview_shortcut_sound: tool(
    'Play a preview of an editor-opening sound on the Mac.',
    false,
    z.strictObject({
      selection: z.enum([
        'shuffle',
        ...SHORTCUT_OPEN_SOUND_CUES.map((cue) => cue.id),
      ]),
    }),
  ),
  set_shortcut_sound: tool(
    'Select a cue or shuffle for the editor-opening sound.',
    false,
    z.strictObject({
      selection: z.enum([
        'shuffle',
        ...SHORTCUT_OPEN_SOUND_CUES.map((cue) => cue.id),
      ]),
    }),
  ),
  set_dock_icon_hidden: tool(
    'Set whether the CoreLive icon is hidden in the Dock.',
    false,
    z.strictObject(flag),
  ),
  set_menu_bar_visible: tool(
    'Show or hide the CoreLive menu bar item.',
    false,
    z.strictObject(flag),
  ),
  set_start_at_login: tool(
    'Change the macOS login-item setting for CoreLive.',
    false,
    z.strictObject(flag),
  ),
  reset_settings_window_size: tool(
    'Restore the default size of the Settings window.',
    false,
    empty,
  ),
  open_config_file: tool(
    'Open the CoreLive configuration file with the default editor.',
    false,
    empty,
  ),
  read_account_status: tool(
    'Read CoreLive’s account attachment and pending connection state.',
    true,
    empty,
  ),
  open_sign_in: tool(
    'Open the sign-in window for the user. The result reports that the window opened.',
    false,
    empty,
  ),
  cancel_sign_in: tool(
    'Cancel the active CoreLive sign-in flow.',
    false,
    empty,
  ),
  connect_account: tool(
    'Connect the device workspace to the verified pending account.',
    false,
    empty,
  ),
  defer_account_connection: tool(
    'Choose Not now for the pending account connection.',
    false,
    empty,
  ),
  acknowledge_first_upload: tool(
    'Acknowledge the first-upload notice in account settings.',
    false,
    empty,
  ),
  sign_out: tool(
    'Sign out through CoreLive’s normal save and account cleanup flow.',
    false,
    empty,
  ),
  clear_local_session_again: tool(
    'Retry clearing local login state after an incomplete sign-out.',
    false,
    empty,
  ),
  read_sync_details: tool(
    'Read items needing attention, waiting operations, and synchronization history.',
    true,
    empty,
  ),
  retry_sync: tool('Request another sync attempt for this Mac.', false, empty),
  retry_completion_sync: tool(
    'Retry synchronization for a particular completion.',
    false,
    z.strictObject({ completionId: id }),
  ),
  resolve_completion_conflict: tool(
    'Resolve a known conflicting completion revision.',
    false,
    z.strictObject({
      completionId: id,
      choice: z.enum(['local', 'server']),
      expectedLocalRevision: revision,
      expectedRemoteRevision: revision,
    }),
  ),
  resolve_sync_detail: tool(
    'Apply an offered repair to a specific sync detail.',
    false,
    z.strictObject({
      rowId: z.string().min(1).max(100),
      action: SyncDetailActionSchema,
      name: name.optional(),
    }),
  ),
  list_pending_records: tool(
    'Read the waiting or blocked completion records available for repair.',
    true,
    z.strictObject(pagination),
  ),
  list_recovery_copies: tool(
    'Read recovery copies of device writing.',
    true,
    z.strictObject(pagination),
  ),
  restore_recovery_copy: tool(
    'Restore a recovery copy into a chosen category.',
    false,
    z.strictObject({ copyId: id, destinationId: id }),
  ),
  preview_recovery: tool(
    'Preview the available verified workspace backup.',
    true,
    empty,
  ),
  recover_workspace: tool(
    'Restore the verified workspace backup through CoreLive recovery.',
    false,
    empty,
  ),
  export_workspace: tool(
    'Read the recovery export of this device’s writing from CoreLive.',
    true,
    empty,
  ),
  save_workspace_backup: tool(
    'Save CoreLive writing and recovery data as a JSON file on the Mac.',
    false,
    z.strictObject({
      filename: z.string().min(1),
      overwrite: z.boolean().default(false),
    }),
  ),
  open_live_editor: tool(
    'Request the LiveEditor window when the user asks to open it. The first window may still be loading.',
    false,
    empty,
  ),
  hide_live_editor: tool(
    'Save pending edits and hide LiveEditor.',
    false,
    empty,
  ),
  open_dashboard: tool(
    'Open the account dashboard in the browser.',
    false,
    empty,
  ),
  open_skill_tree: tool(
    'Open the account skill tree in the browser.',
    false,
    empty,
  ),
  open_settings: tool(
    'Request CoreLive Settings. The first window may still be loading.',
    false,
    empty,
  ),
  read_update_status: tool(
    'Check CoreLive’s installed version and current updater state.',
    true,
    empty,
  ),
  check_for_updates: tool(
    'Ask the existing updater to check for an update.',
    false,
    empty,
  ),
  download_update: tool(
    'Start downloading the available CoreLive update.',
    false,
    empty,
  ),
  restart_to_update: tool(
    'Apply the downloaded update through the ordinary save-before-restart check.',
    false,
    empty,
  ),
  open_about: tool('Show the About CoreLive dialog.', false, empty),
  show_keyboard_shortcuts: tool(
    'Show the CoreLive keyboard shortcuts dialog.',
    false,
    empty,
  ),
  open_documentation: tool(
    'Open the CoreLive documentation in the browser.',
    false,
    empty,
  ),
  open_project_page: tool(
    'Open the CoreLive project page in the browser.',
    false,
    empty,
  ),
  open_issue_tracker: tool(
    'Open the CoreLive issue tracker in the browser.',
    false,
    empty,
  ),
  quit_corelive: tool(
    'Quit CoreLive after saving the workspace.',
    false,
    empty,
  ),
  undo_edit: tool(
    'Undo the last text edit in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  redo_edit: tool(
    'Redo the last text edit in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  cut_selection: tool(
    'Cut the current selection in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  copy_selection: tool(
    'Copy the current selection in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  paste_text: tool(
    'Paste into the current selection in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  select_all: tool(
    'Select all text in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  reload_window: tool(
    'Reload the window in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  force_reload_window: tool(
    'Reload the window ignoring cache in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  toggle_developer_tools: tool(
    'Toggle the CoreLive developer tools in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  reset_zoom: tool(
    'Restore the original zoom in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  zoom_in: tool(
    'Increase the zoom in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  zoom_out: tool(
    'Decrease the zoom in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  toggle_fullscreen: tool(
    'Toggle fullscreen in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  minimize_window: tool(
    'Minimize the window in the chosen CoreLive window.',
    false,
    z.strictObject(target),
  ),
  close_window: tool(
    'Close Settings, or save pending writing and hide LiveEditor.',
    false,
    z.strictObject(target),
  ),
  hide_corelive: tool(
    'Hide CoreLive using the application menu.',
    false,
    empty,
  ),
  hide_other_applications: tool(
    'Choose Hide Others from the CoreLive application menu.',
    false,
    empty,
  ),
  show_all_applications: tool(
    'Choose Show All from the CoreLive application menu.',
    false,
    empty,
  ),
  bring_windows_to_front: tool(
    'Bring CoreLive windows to the front.',
    false,
    empty,
  ),
} as const

export type McpToolName = keyof typeof coreLiveTools
export type McpCall = {
  [K in McpToolName]: {
    name: K
    args: z.output<(typeof coreLiveTools)[K]['inputSchema']>
  }
}[McpToolName]

type ActionResult = Record<string, unknown>
type ToolAction<K extends McpToolName> = (
  args: Extract<McpCall, { name: K }>['args'],
) => ActionResult | Promise<ActionResult>
export type McpActions = { [K in McpToolName]?: ToolAction<K> }

/** Calls a registered operation with arguments validated by its own schema.
 * @example const outcome = await dispatchMcpAction(editorActions, call)
 */
export async function dispatchMcpAction(actions: McpActions, call: McpCall) {
  // TypeScript loses the discriminant when indexing a mapped table. Both values come from the same validated call.
  const action = actions[call.name] as ToolAction<McpToolName> | undefined
  return action?.(call.args)
}

/** Validates a tool name and arguments at each process boundary. No caller can address arbitrary IPC.
 * @example parseMcpCall('read_draft', {})
 */
export function parseMcpCall(name: string, input: unknown): McpCall {
  if (!Object.hasOwn(coreLiveTools, name))
    throw new McpActionError(
      'unknown-tool',
      'List CoreLive tools and select a supported operation.',
    )
  const key = name as McpToolName
  const result = coreLiveTools[key].inputSchema.safeParse(input)
  if (!result.success)
    throw new McpActionError(
      'invalid-input',
      'Check the tool input schema and supply valid arguments.',
      'none',
      { fields: result.error.issues.map((issue) => issue.path.join('.')) },
    )
  // Each schema is selected by the same key used for the discriminant.
  return { name: key, args: result.data } as McpCall
}
