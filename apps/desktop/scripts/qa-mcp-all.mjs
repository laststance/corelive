import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

/**
 * End-to-end QA of every advertised CoreLive MCP tool against a packaged app.
 *
 * The driver launches `Contents/Helpers/corelive-mcp` with an isolated
 * `--user-data-dir` profile and speaks the MCP stdio JSON-RPC protocol directly,
 * so no Node dependencies are needed inside a QA Mac. The helper wakes the real
 * app in the background exactly as a registered AI client would.
 *
 * Run it on a machine where the app may open windows, register a temporary
 * login item and open browser tabs — a disposable QA Mac or VM, not the owner's
 * desktop. Usage:
 *
 *   node scripts/qa-mcp-all.mjs /path/to/CoreLive.app [--keep-profile]
 *
 * Exit code is non-zero when any check fails.
 */

const app = resolve(process.argv[2])
const keepProfile = process.argv.includes('--keep-profile')
const helper = join(app, 'Contents/Helpers/corelive-mcp')
const executable = join(app, 'Contents/MacOS/CoreLive')
const profile = mkdtempSync(join(tmpdir(), 'corelive-mcp-all-qa-'))
const report = { app, profile, checks: [], failures: [], covered: new Set() }

/** Appends one named check outcome; every tool call is recorded for coverage. */
function check(tool, label, ok, detail = '') {
  report.covered.add(tool)
  const line = { tool, label, ok, detail }
  report.checks.push(line)
  if (!ok) report.failures.push(line)
  process.stdout.write(
    `${ok ? 'PASS' : 'FAIL'} ${tool} — ${label}${detail ? ' — ' + detail : ''}\n`,
  )
}

/** Minimal MCP stdio client: newline-delimited JSON-RPC, no SDK required. */
class McpStdioClient {
  #child
  #seq = 0
  #pending = new Map()
  #buffer = ''
  constructor(command, args) {
    this.#child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] })
    this.#child.stdout.setEncoding('utf8')
    this.#child.stdout.on('data', (chunk) => this.#read(chunk))
  }
  #read(chunk) {
    this.#buffer += chunk
    for (;;) {
      const end = this.#buffer.indexOf('\n')
      if (end < 0) return
      const line = this.#buffer.slice(0, end).trim()
      this.#buffer = this.#buffer.slice(end + 1)
      if (!line) continue
      const message = JSON.parse(line)
      if (message.id === undefined) continue
      const pending = this.#pending.get(message.id)
      if (!pending) continue
      this.#pending.delete(message.id)
      if (message.error)
        pending.reject(new Error(JSON.stringify(message.error)))
      else pending.resolve(message.result)
    }
  }
  async request(method, params, timeoutMs = 120_000) {
    const id = ++this.#seq
    const reply = new Promise((resolvePromise, rejectPromise) => {
      this.#pending.set(id, { resolve: resolvePromise, reject: rejectPromise })
    })
    this.#child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
    )
    const timeout = delay(timeoutMs).then(() => {
      this.#pending.delete(id)
      throw new Error(method + ' timed out after ' + timeoutMs + 'ms')
    })
    return Promise.race([reply, timeout])
  }
  notify(method, params) {
    this.#child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n',
    )
  }
  async callTool(name, args = {}) {
    return this.request('tools/call', { name, arguments: args })
  }
  close() {
    this.#child.stdin.end()
    this.#child.kill()
  }
}

let client

/** Calls a tool expecting success; returns structuredContent for assertions. */
async function ok(name, args = {}, label = 'returns a result') {
  const result = await client.callTool(name, args)
  check(
    name,
    label,
    result.isError === false,
    JSON.stringify(result.structuredContent)?.slice(0, 300),
  )
  return result.structuredContent ?? {}
}

/** Calls a tool expecting a structured failure, optionally pinned to an error code. */
async function refused(name, args = {}, code, label = 'refuses safely') {
  const result = await client.callTool(name, args)
  const body = result.structuredContent ?? {}
  const good =
    result.isError === true && (code === undefined || body.code === code)
  check(
    name,
    label,
    good,
    `code=${body.code} effect=${body.effect} next=${String(body.nextAction).slice(0, 80)}`,
  )
  return body
}

/** Polls a harmless window role until the renderer's bundled document commits;
 * a fresh window can need seconds on a slow host before roles accept it. */
async function waitForWindow(target, label) {
  const deadline = Date.now() + 20_000
  let last = ''
  while (Date.now() < deadline) {
    const result = await client.callTool('reset_zoom', { window: target })
    const code = result.structuredContent?.code
    if (result.isError !== true || code !== 'window-unavailable') {
      check(label, `${target} document is ready`, true)
      return
    }
    last = code
    await delay(300)
  }
  check(label, `${target} document is ready`, false, last)
}

/** Calls a tool whose outcome depends on unavailable preconditions; passes when the
 * reply is well formed — either a success or a structured refusal. */
async function probe(
  name,
  args = {},
  label = 'answers with a well-formed result',
) {
  const result = await client.callTool(name, args)
  const body = result.structuredContent ?? {}
  const good =
    result.isError === true
      ? typeof body.code === 'string' && typeof body.nextAction === 'string'
      : result.isError === false
  check(
    name,
    label,
    good,
    result.isError
      ? `refused: ${body.code}`
      : 'succeeded: ' + JSON.stringify(body).slice(0, 160),
  )
  return body
}

const owners = () =>
  execFileSync('/bin/ps', ['-axww', '-o', 'command='], { encoding: 'utf8' })
    .split('\n')
    .filter(
      (line) =>
        line.startsWith(executable + ' ') &&
        line.includes('--corelive-mcp-background') &&
        line.includes(profile),
    ).length

const EXPECTED_TOOLS = [
  'acknowledge_first_upload',
  'append_unfinished_task',
  'assign_task_to_skill',
  'bring_windows_to_front',
  'cancel_sign_in',
  'check_for_updates',
  'clear_completed_line',
  'clear_local_session_again',
  'close_window',
  'complete_draft_line',
  'connect_account',
  'copy_selection',
  'correct_completion_time',
  'create_category',
  'cut_selection',
  'defer_account_connection',
  'delete_category',
  'download_update',
  'edit_draft',
  'export_activity_png',
  'export_workspace',
  'force_reload_window',
  'get_task_addition_result',
  'hide_corelive',
  'hide_live_editor',
  'hide_other_applications',
  'list_categories',
  'list_completions',
  'list_pending_records',
  'list_recovery_copies',
  'list_undoable_completions',
  'list_unassigned_skill_tasks',
  'minimize_window',
  'move_category',
  'move_removed_category_writing',
  'open_about',
  'open_config_file',
  'open_dashboard',
  'open_documentation',
  'open_issue_tracker',
  'open_live_editor',
  'open_project_page',
  'open_settings',
  'open_sign_in',
  'open_skill_tree',
  'paste_text',
  'preview_recovery',
  'preview_shortcut_sound',
  'promote_category',
  'quit_corelive',
  'read_account_status',
  'read_activity_day',
  'read_activity_heatmap',
  'read_dashboard_appearance',
  'read_dashboard_overview',
  'read_draft',
  'read_settings',
  'read_skill_tree',
  'read_sync_details',
  'read_update_status',
  'record_completed_task',
  'recover_workspace',
  'recolor_category',
  'redo_edit',
  'reload_window',
  'remove_skill_assignment',
  'rename_category',
  'reset_settings_window_size',
  'reset_zoom',
  'resolve_completion_conflict',
  'resolve_sync_detail',
  'restore_recovery_copy',
  'retry_completion_sync',
  'retry_sync',
  'save_workspace_backup',
  'select_all',
  'select_category',
  'set_dashboard_appearance',
  'set_dock_icon_hidden',
  'set_editor_always_on_top',
  'set_editor_bounds',
  'set_editor_on_all_spaces',
  'set_editor_opacity',
  'set_editor_shortcut',
  'set_menu_bar_visible',
  'set_shortcut_sound',
  'set_shortcut_sound_enabled',
  'set_start_at_login',
  'show_all_applications',
  'show_keyboard_shortcuts',
  'sign_out',
  'toggle_developer_tools',
  'toggle_fullscreen',
  'undo_completion',
  'undo_edit',
  'update_editor_preferences',
  'zoom_in',
  'zoom_out',
]

try {
  client = new McpStdioClient(helper, ['--user-data-dir=' + profile])
  await client.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'corelive-mcp-all-qa', version: '1' },
  })
  client.notify('notifications/initialized', {})

  // ── A. Discovery ─────────────────────────────────────────────────────────
  const list = await client.request('tools/list', {})
  const names = list.tools.map((tool) => tool.name).sort()
  check(
    'tools/list',
    'advertises the 99-tool catalog',
    names.length === 99,
    `${names.length} tools`,
  )
  for (const expected of EXPECTED_TOOLS)
    check('tools/list', `advertises ${expected}`, names.includes(expected))
  for (const tool of list.tools)
    check(
      'tools/list',
      `${tool.name} publishes an object input schema`,
      tool.inputSchema?.type === 'object',
    )

  // ── B. Device workspace and categories ───────────────────────────────────
  let draft = await ok('read_draft', {}, 'reads the default category')
  const general = draft.categoryId
  check(
    'read_draft',
    'default category is General',
    draft.categoryPath === 'General',
    draft.categoryPath,
  )

  let cats = await ok('list_categories', {}, 'lists categories')
  check(
    'list_categories',
    'fresh workspace has one selected category',
    cats.categories.length === 1 && cats.selectedCategoryId === general,
  )

  const work = (
    await ok(
      'create_category',
      { name: 'QA Work', color: 'violet' },
      'creates a root category',
    )
  ).categoryId
  const child = (
    await ok(
      'create_category',
      { name: 'QA Child', parentId: work },
      'creates a child category',
    )
  ).categoryId
  await ok(
    'rename_category',
    { categoryId: child, name: 'QA Errands' },
    'renames a category',
  )
  await ok(
    'recolor_category',
    { categoryId: child, color: 'rose' },
    'recolors a category',
  )
  await ok('select_category', { categoryId: child }, 'selects a category')
  cats = await ok('list_categories', {}, 're-reads categories')
  const childEntry = cats.categories.find((c) => c.categoryId === child)
  check(
    'list_categories',
    'child path and color update',
    childEntry?.path === 'QA Work / QA Errands' && childEntry?.color === 'rose',
    childEntry?.path + ' ' + childEntry?.color,
  )
  check(
    'list_categories',
    'selection sticks',
    cats.selectedCategoryId === child,
  )

  // ── C. Draft tasks and edits ──────────────────────────────────────────────
  const op1 = randomUUID()
  const added = await ok(
    'append_unfinished_task',
    { categoryId: child, title: 'QA task one', operationId: op1 },
    'appends a task',
  )
  check(
    'append_unfinished_task',
    'saves under the named category',
    added.categoryId === child,
  )
  const row1 = added.rowId
  draft = await ok('read_draft', { categoryId: child }, 'reads the added task')
  check('read_draft', 'task text persists', draft.text.includes('QA task one'))
  const revision1 = draft.revision

  const dup = await ok(
    'append_unfinished_task',
    { categoryId: child, title: 'QA task one', operationId: op1 },
    'replays the same operationId',
  )
  check(
    'append_unfinished_task',
    'replay returns the original row',
    dup.rowId === row1,
  )
  await refused(
    'append_unfinished_task',
    { categoryId: child, title: 'A different title', operationId: op1 },
    'command-conflict',
    'rejects a reused operationId with a new title',
  )

  const receipt = await ok(
    'get_task_addition_result',
    { operationId: op1 },
    'looks up the saved addition',
  )
  check(
    'get_task_addition_result',
    'receipt matches the row',
    receipt.rowId === row1,
  )
  await ok(
    'get_task_addition_result',
    { operationId: op1, original: { categoryId: child, title: 'QA task one' } },
    'verifies the original intent',
  )
  await refused(
    'get_task_addition_result',
    { operationId: randomUUID() },
    'result-unknown',
    'reports an unknown operation as unknown',
  )

  const op2 = randomUUID()
  const added2 = await ok(
    'append_unfinished_task',
    { categoryId: child, title: 'QA task two', operationId: op2 },
    'appends a second task',
  )
  const row2 = added2.rowId
  draft = await ok('read_draft', { categoryId: child }, 'reads both rows')

  await ok(
    'edit_draft',
    {
      categoryId: child,
      baseRevision: draft.revision,
      rows: [
        { id: row1, text: '- [ ] QA task one renamed' },
        { id: row2, text: '- [ ] QA task two' },
      ],
    },
    'saves edited rows',
  )
  draft = await ok('read_draft', { categoryId: child }, 're-reads after edit')
  check(
    'edit_draft',
    'edit persisted',
    draft.text.includes('QA task one renamed'),
  )
  await refused(
    'edit_draft',
    {
      categoryId: child,
      baseRevision: revision1,
      rows: [{ id: row1, text: '- [ ] stale write' }],
    },
    'revision-conflict',
    'rejects a stale base revision',
  )

  // ── D. Completions ────────────────────────────────────────────────────────
  draft = await ok(
    'read_draft',
    { categoryId: child },
    'reads current revision',
  )
  const done1 = await ok(
    'complete_draft_line',
    { categoryId: child, rowId: row1, baseRevision: draft.revision },
    'completes a draft line',
  )
  const completion1 = done1.completionId
  draft = await ok(
    'read_draft',
    { categoryId: child },
    're-reads completed row',
  )
  check(
    'complete_draft_line',
    'row shows completion',
    /\[x\]|✓|completed/i.test(draft.text),
    draft.text.slice(0, 120),
  )

  const done2 = await ok(
    'record_completed_task',
    {
      categoryId: child,
      title: 'QA logged work',
      completedAt: '2026-11-19T12:00:00.000Z',
    },
    'records completed work',
  )
  const completion2 = done2.completionId

  const history = await ok(
    'list_completions',
    { startDate: '2026-11-18', endDate: '2026-11-21' },
    'lists device completions',
  )
  const titles = (history.entries ?? []).map((e) => e.title)
  check(
    'list_completions',
    'device scope and both entries',
    history.scope === 'device' &&
      titles.includes('QA task one renamed') &&
      titles.includes('QA logged work'),
    `${history.scope} ${titles.join('|')}`,
  )
  const searched = await ok(
    'list_completions',
    { startDate: '2026-11-18', endDate: '2026-11-21', search: 'logged' },
    'searches completions literally',
  )
  check(
    'list_completions',
    'search narrows results',
    searched.entries.length === 1 &&
      searched.entries[0].title === 'QA logged work',
  )
  const byCat = await ok(
    'list_completions',
    { startDate: '2026-11-18', endDate: '2026-11-21', categoryId: child },
    'filters by category',
  )
  check(
    'list_completions',
    'category filter keeps both rows',
    byCat.entries.length === 2,
  )

  await ok(
    'correct_completion_time',
    { completionId: completion2, completedAt: '2026-11-19T09:30:00.000Z' },
    'corrects a completion time',
  )
  const undoable = await ok(
    'list_undoable_completions',
    {},
    'lists undoable completions',
  )
  check(
    'list_undoable_completions',
    'recent completion is undoable',
    (undoable.completions ?? []).some((e) => e.id === completion1),
  )

  await ok(
    'undo_completion',
    { completionId: completion1 },
    'undoes a completion',
  )
  draft = await ok('read_draft', { categoryId: child }, 're-reads after undo')
  check(
    'undo_completion',
    'line restored unfinished',
    draft.text.includes('QA task one renamed'),
  )

  draft = await ok(
    'read_draft',
    { categoryId: child },
    'reads revision for re-complete',
  )
  const done3 = await ok(
    'complete_draft_line',
    { categoryId: child, rowId: row1, baseRevision: draft.revision },
    'completes the line again',
  )
  await ok(
    'clear_completed_line',
    { completionId: done3.completionId },
    'clears the finished line',
  )
  draft = await ok('read_draft', { categoryId: child }, 're-reads after clear')
  check(
    'clear_completed_line',
    'line leaves the draft',
    !draft.rows.some((row) => row.id === row1),
  )

  await refused(
    'undo_completion',
    { completionId: randomUUID() },
    undefined,
    'rejects an unknown completion',
  )
  await refused(
    'correct_completion_time',
    { completionId: randomUUID(), completedAt: '2026-11-19T00:00:00.000Z' },
    undefined,
    'rejects correcting an unknown completion',
  )
  await probe(
    'retry_completion_sync',
    { completionId: completion2 },
    'answers a completion sync retry',
  )

  // ── E. Category moves ─────────────────────────────────────────────────────
  const archive = (
    await ok('create_category', { name: 'QA Archive' }, 'creates a second root')
  ).categoryId
  await ok(
    'move_category',
    { categoryId: child, parentId: archive },
    'moves a category under another parent',
  )
  cats = await ok('list_categories', {}, 'verifies the move')
  check(
    'move_category',
    'path follows the new parent',
    cats.categories.find((c) => c.categoryId === child)?.path ===
      'QA Archive / QA Errands',
  )
  await ok(
    'promote_category',
    { categoryId: child },
    'promotes a category to root',
  )
  cats = await ok('list_categories', {}, 'verifies the promotion')
  check(
    'promote_category',
    'path is top level',
    cats.categories.find((c) => c.categoryId === child)?.path === 'QA Errands',
  )

  const temp = (
    await ok(
      'create_category',
      { name: 'QA Temp' },
      'creates a removable category',
    )
  ).categoryId
  await ok(
    'append_unfinished_task',
    { categoryId: temp, title: 'QA temp task', operationId: randomUUID() },
    'writes into the removable category',
  )
  const moved = await ok(
    'move_removed_category_writing',
    { sourceId: temp, destinationId: child },
    'moves writing out of a category',
  )
  check(
    'move_removed_category_writing',
    'writing lands in the destination',
    moved.status === 'saved',
  )
  draft = await ok(
    'read_draft',
    { categoryId: child },
    'reads the moved writing',
  )
  check(
    'move_removed_category_writing',
    'moved task is in the destination draft',
    draft.text.includes('QA temp task'),
  )
  cats = await ok('list_categories', {}, 're-reads after the move')
  check(
    'move_removed_category_writing',
    'source left the active list',
    !cats.categories.some((c) => c.categoryId === temp),
  )
  await ok(
    'delete_category',
    { categoryId: archive, destinationId: child },
    'deletes an empty category',
  )
  cats = await ok('list_categories', {}, 're-reads after deletion')
  check(
    'delete_category',
    'category removed from the active list',
    !cats.categories.some((c) => c.categoryId === archive),
  )
  await refused(
    'rename_category',
    { categoryId: temp, name: 'ghost' },
    'category-unavailable',
    'rejects renaming a removed category',
  )
  await refused(
    'select_category',
    { categoryId: temp },
    'category-unavailable',
    'rejects selecting a removed category',
  )
  await refused(
    'create_category',
    { name: 'x'.repeat(31) },
    'invalid-input',
    'rejects an over-long name',
  )

  // ── F. Draft paging ───────────────────────────────────────────────────────
  const page1 = await ok(
    'read_draft',
    { categoryId: child, textPage: { offset: 0 } },
    'reads the first text page',
  )
  check(
    'read_draft',
    'page carries revision and text',
    typeof page1.revision === 'number' && typeof page1.text === 'string',
  )
  await ok(
    'read_draft',
    {
      categoryId: child,
      textPage: { offset: 0, expectedRevision: page1.revision },
    },
    're-reads with the matching revision',
  )
  await refused(
    'read_draft',
    {
      categoryId: child,
      textPage: { offset: 0, expectedRevision: page1.revision + 1 },
    },
    'revision-conflict',
    'rejects a mismatched page revision',
  )
  await refused(
    'read_draft',
    { categoryId: child, textPage: { offset: 5 } },
    'invalid-input',
    'rejects a continuation without expectedRevision',
  )

  // ── G. Sync details, recovery, backup ─────────────────────────────────────
  await ok('read_sync_details', {}, 'reads sync details')
  await ok('list_pending_records', {}, 'lists pending records')
  await ok('list_recovery_copies', {}, 'lists recovery copies')
  await probe('preview_recovery', {}, 'previews recovery state')
  const exported = await ok('export_workspace', {}, 'exports the workspace')
  check(
    'export_workspace',
    'export contains saved writing',
    exported.format === 'json' && exported.writing.includes('QA task two'),
  )
  const backup = await ok(
    'save_workspace_backup',
    { filename: 'qa-backup.json' },
    'saves a workspace backup',
  )
  check(
    'save_workspace_backup',
    'returns an existing file path',
    typeof backup.path === 'string' && existsSync(backup.path),
    backup.path,
  )
  await refused(
    'save_workspace_backup',
    { filename: 'qa-backup.json' },
    'file-exists',
    'refuses to overwrite without consent',
  )
  await ok(
    'save_workspace_backup',
    { filename: 'qa-backup.json', overwrite: true },
    'overwrites with explicit consent',
  )
  await refused(
    'save_workspace_backup',
    { filename: '../escape.json' },
    'invalid-path',
    'rejects a path-traversal filename',
  )
  await refused(
    'restore_recovery_copy',
    { copyId: randomUUID(), destinationId: child },
    undefined,
    'rejects an unknown recovery copy',
  )
  await refused(
    'resolve_sync_detail',
    { rowId: 'no-such-row', action: 'try-again' },
    undefined,
    'rejects an unknown sync detail',
  )
  await refused(
    'resolve_completion_conflict',
    {
      completionId: completion2,
      choice: 'local',
      expectedLocalRevision: 0,
      expectedRemoteRevision: 0,
    },
    undefined,
    'rejects a conflict that does not exist',
  )
  await ok('retry_sync', {}, 'requests a sync retry')

  // ── H. Settings and native preferences ────────────────────────────────────
  const settings = await ok('read_settings', {}, 'reads settings')
  check(
    'read_settings',
    'reports the packaged version',
    settings.version === '0.32.0',
    settings.version,
  )
  const prefsRevision = settings.preferences?.revision
  await ok(
    'update_editor_preferences',
    { expectedRevision: prefsRevision, patch: { liveEditorFontSizePx: 18 } },
    'updates an editor preference',
  )
  const settings2 = await ok('read_settings', {}, 're-reads settings')
  check(
    'update_editor_preferences',
    'preference persisted',
    settings2.preferences?.settings?.liveEditorFontSize === 18,
  )
  await refused(
    'update_editor_preferences',
    {
      expectedRevision: prefsRevision + 99,
      patch: { liveEditorFontSizePx: 20 },
    },
    'revision-conflict',
    'rejects a stale preferences revision',
  )
  await ok('set_editor_opacity', { opacity: 0.75 }, 'sets editor opacity')
  const settings3 = await ok('read_settings', {}, 're-reads opacity')
  check('set_editor_opacity', 'opacity persisted', settings3.opacity === 0.75)
  await refused(
    'set_editor_opacity',
    { opacity: 0.2 },
    'invalid-input',
    'rejects opacity below the minimum',
  )
  await ok(
    'set_editor_always_on_top',
    { enabled: true },
    'enables always on top',
  )
  check(
    'read_settings',
    'always-on-top persisted',
    (await ok('read_settings', {}, 're-reads always-on-top')).alwaysOnTop ===
      true,
  )
  await ok(
    'set_editor_always_on_top',
    { enabled: false },
    'disables always on top',
  )
  await ok('set_editor_on_all_spaces', { enabled: true }, 'enables all spaces')
  await ok(
    'set_editor_on_all_spaces',
    { enabled: false },
    'disables all spaces',
  )
  await ok(
    'set_editor_shortcut',
    { slot: 'secondary', accelerator: 'Alt+Shift+K' },
    'sets a secondary shortcut',
  )
  const settings4 = await ok('read_settings', {}, 're-reads shortcuts')
  check(
    'set_editor_shortcut',
    'shortcut persisted',
    settings4.shortcuts?.secondary === 'Alt+Shift+K',
  )
  await ok(
    'set_editor_shortcut',
    { slot: 'secondary', accelerator: '' },
    'clears the secondary shortcut',
  )
  await ok(
    'set_shortcut_sound_enabled',
    { enabled: true },
    'enables the open sound',
  )
  await ok(
    'set_shortcut_sound',
    { selection: 'balanced-deep-thock' },
    'selects a sound cue',
  )
  const settings5 = await ok('read_settings', {}, 're-reads the sound choice')
  check(
    'set_shortcut_sound',
    'sound selection persisted',
    settings5.shortcutSound?.selection === 'balanced-deep-thock',
  )
  await ok(
    'preview_shortcut_sound',
    { selection: 'shuffle' },
    'previews a sound',
  )
  await ok('set_dock_icon_hidden', { enabled: true }, 'hides the dock icon')
  await ok('set_dock_icon_hidden', { enabled: false }, 'restores the dock icon')
  await ok(
    'set_menu_bar_visible',
    { enabled: false },
    'hides the menu bar item',
  )
  await ok(
    'set_menu_bar_visible',
    { enabled: true },
    'restores the menu bar item',
  )
  await ok('set_start_at_login', { enabled: true }, 'enables start at login')
  const settings6 = await ok('read_settings', {}, 're-reads login item')
  check(
    'set_start_at_login',
    'login item persisted',
    settings6.startAtLogin === true,
  )
  await ok('set_start_at_login', { enabled: false }, 'disables start at login')
  await ok('reset_settings_window_size', {}, 'resets the settings window size')
  await ok('open_config_file', {}, 'opens the config file')

  // ── I. Windows and menu operations ────────────────────────────────────────
  await ok('open_live_editor', {}, 'opens LiveEditor')
  await waitForWindow('editor', 'open_live_editor')
  const bounded = await ok(
    'set_editor_bounds',
    { x: 120, y: 120, width: 480, height: 320 },
    'moves the editor window',
  )
  check(
    'set_editor_bounds',
    'bounds applied',
    bounded.bounds?.width === 480 && bounded.bounds?.height === 320,
  )
  for (const name of [
    'select_all',
    'copy_selection',
    'paste_text',
    'cut_selection',
    'undo_edit',
    'redo_edit',
    'zoom_in',
    'zoom_out',
    'reset_zoom',
  ])
    await ok(name, { window: 'editor' }, `runs ${name} on the editor`)
  await ok('toggle_developer_tools', { window: 'editor' }, 'opens devtools')
  await ok('toggle_developer_tools', { window: 'editor' }, 'closes devtools')
  await ok('toggle_fullscreen', { window: 'editor' }, 'enters fullscreen')
  await ok('toggle_fullscreen', { window: 'editor' }, 'leaves fullscreen')
  await ok('minimize_window', { window: 'editor' }, 'minimizes the editor')
  await ok('open_live_editor', {}, 'restores the editor window')
  await waitForWindow('editor', 'open_live_editor')
  await ok('reload_window', { window: 'editor' }, 'reloads the editor')
  await waitForWindow('editor', 'reload_window')
  await ok(
    'force_reload_window',
    { window: 'editor' },
    'force-reloads the editor',
  )
  await waitForWindow('editor', 'force_reload_window')
  await ok('open_settings', {}, 'opens Settings')
  await waitForWindow('settings', 'open_settings')
  for (const name of ['select_all', 'zoom_in', 'reset_zoom'])
    await ok(name, { window: 'settings' }, `runs ${name} on Settings`)
  await ok('close_window', { window: 'settings' }, 'closes Settings')
  await ok('close_window', { window: 'editor' }, 'closes the editor')
  await ok('hide_live_editor', {}, 'hides LiveEditor')
  await ok('hide_corelive', {}, 'hides the app')
  await ok('hide_other_applications', {}, 'hides other applications')
  await ok('show_all_applications', {}, 'shows all applications')
  await ok('bring_windows_to_front', {}, 'brings windows to front')
  await ok('open_about', {}, 'opens About')
  await ok('show_keyboard_shortcuts', {}, 'opens keyboard shortcuts')

  // ── J. Browser and updater ────────────────────────────────────────────────
  for (const name of [
    'open_dashboard',
    'open_skill_tree',
    'open_documentation',
    'open_project_page',
    'open_issue_tracker',
  ])
    await ok(name, {}, `runs ${name}`)
  const update = await ok('read_update_status', {}, 'reads update status')
  check(
    'read_update_status',
    'reports the packaged version',
    update.version === '0.32.0',
    update.version,
  )
  // The update feed is unreachable from an unsigned QA build or offline VM, so
  // a structured operation-unavailable refusal is a correct outcome here too.
  await probe('check_for_updates', {}, 'checks for updates or refuses cleanly')
  await refused(
    'download_update',
    {},
    undefined,
    'reports no pending update download',
  )
  await refused(
    'restart_to_update',
    {},
    undefined,
    'refuses to restart without a downloaded update',
  )

  // ── K. Account operations on a device-only workspace ─────────────────────
  const account = await ok('read_account_status', {}, 'reads account status')
  check(
    'read_account_status',
    'fresh profile is unattached',
    account.state === 'never-attached' && account.pendingConnect === null,
    account.state,
  )
  for (const [name, args] of [
    ['read_dashboard_overview', {}],
    ['read_activity_day', { day: '2026-11-20' }],
    ['read_activity_heatmap', { days: 30 }],
    ['export_activity_png', { day: '2026-11-20', filename: 'qa-activity.png' }],
    ['read_dashboard_appearance', {}],
    ['set_dashboard_appearance', { theme: 'system' }],
    ['read_skill_tree', {}],
    ['list_unassigned_skill_tasks', {}],
    ['assign_task_to_skill', { nodeId: 1, todoId: 1 }],
    ['remove_skill_assignment', { nodeId: 1, todoId: 1 }],
  ])
    await refused(name, args, undefined, `requires a connected account`)
  await ok('open_sign_in', {}, 'opens the sign-in window')
  await ok('cancel_sign_in', {}, 'cancels sign-in')
  await refused(
    'connect_account',
    { promptId: randomUUID() },
    'connection-not-pending',
    'rejects an unknown prompt',
  )
  await refused(
    'defer_account_connection',
    { promptId: randomUUID() },
    'connection-not-pending',
    'rejects deferring an unknown prompt',
  )
  await ok(
    'acknowledge_first_upload',
    {},
    'acknowledges the first upload notice',
  )
  await ok('sign_out', {}, 'signs out of an unattached profile')
  await ok('clear_local_session_again', {}, 'clears the session again')

  // ── L. Validation and edge cases ──────────────────────────────────────────
  await refused('no_such_tool', {}, 'unknown-tool', 'rejects an unknown tool')
  await refused(
    'read_draft',
    { bogus: true },
    'invalid-input',
    'rejects unexpected arguments',
  )
  await refused(
    'append_unfinished_task',
    { categoryId: child, title: 'line\nbreak', operationId: randomUUID() },
    'invalid-input',
    'rejects a newline in a title',
  )
  await refused(
    'append_unfinished_task',
    { categoryId: child, title: '', operationId: randomUUID() },
    'invalid-input',
    'rejects an empty title',
  )
  await refused(
    'list_completions',
    { pageSize: 200 },
    'invalid-input',
    'rejects an oversized page',
  )
  await refused(
    'paste_text',
    { window: 'bogus' },
    'invalid-input',
    'rejects an unknown window',
  )
  await refused(
    'read_draft',
    { categoryId: randomUUID() },
    'category-unavailable',
    'rejects an unknown category',
  )

  // ── M. Quit and cold restart ──────────────────────────────────────────────
  await ok('quit_corelive', {}, 'requests app quit')
  const quitDeadline = Date.now() + 20_000
  while (owners() > 0 && Date.now() < quitDeadline) await delay(200)
  check('quit_corelive', 'background owner exited', owners() === 0)
  draft = await ok(
    'read_draft',
    { categoryId: child },
    'wakes the app again on demand',
  )
  check(
    'read_draft',
    'saved writing survives relaunch',
    draft.text.includes('QA task two'),
  )
  await probe(
    'recover_workspace',
    {},
    'restores or declines the verified workspace backup',
  )
  await ok('read_draft', {}, 'workspace still answers after recovery')
  await ok('quit_corelive', {}, 'quits the relaunched app')
} finally {
  client?.close()
  const missing = EXPECTED_TOOLS.filter((name) => !report.covered.has(name))
  for (const name of missing)
    check(name, 'was exercised', false, 'never called')
  process.stdout.write(
    `\nQA summary: ${report.checks.length - report.failures.length}/${report.checks.length} checks passed,` +
      ` ${report.covered.size}/99 tools covered, profile ${profile}\n`,
  )
  // The relaunched owner may still be flushing when the driver exits.
  if (!keepProfile)
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 400,
    })
  if (report.failures.length) {
    process.stdout.write(
      'Failures: ' +
        report.failures.map((f) => f.tool + ' (' + f.label + ')').join(', ') +
        '\n',
    )
    process.exitCode = 1
  }
}
