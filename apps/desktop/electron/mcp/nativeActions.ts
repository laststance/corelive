import {
  DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
  SHORTCUT_OPEN_SOUND_CUES,
  isShortcutOpenSoundSelection,
} from '@corelive/desktop-contract/constants'
import { app, Menu, shell } from 'electron'
import type { BrowserWindow } from 'electron'

import type { AutoUpdater } from '../AutoUpdater'
import type { ConfigManager } from '../ConfigManager'
import type { MenuManager } from '../MenuManager'
import {
  isLocalEditorDocument,
  isLocalSettingsDocument,
} from '../offline/localEditorOrigin'
import { ShortcutOpenSoundPlayer } from '../ShortcutOpenSoundPlayer'
import { openDashboardInBrowser } from '../utils/openDashboardInBrowser'
import type { WindowManager } from '../WindowManager'

import type { EditorRuntime } from './editorActions'
import { applyNativeSetting } from './nativeSettings'
import { OWNER_START_TIMEOUT_MS } from './protocol'
import { McpActionError } from './result'
import { dispatchMcpAction, type McpActions, type McpCall } from './tools'

export interface NativeActionContext {
  windows: WindowManager
  config: ConfigManager
  menu: () => MenuManager | null
  updater: () => AutoUpdater | null | Promise<AutoUpdater | null>
  prepareQuit: () => Promise<boolean>
}
const sound = new ShortcutOpenSoundPlayer()

type CoreLiveWindow = 'editor' | 'settings'
type WindowRole = Extract<McpCall, { args: { window: CoreLiveWindow } }>['name']

/** Applies an Electron menu role to one CoreLive document after checking its origin.
 * @example runWindowRole(deps, 'copy_selection', 'editor')
 */
async function runWindowRole(
  deps: NativeActionContext,
  role: WindowRole,
  target: CoreLiveWindow,
) {
  const win =
    target === 'editor'
      ? deps.windows.getLiveEditorWindow()
      : deps.windows.getSettingsWindow()
  if (
    !win ||
    win.isDestroyed() ||
    win.webContents.isDestroyed() ||
    !(target === 'editor' ? isLocalEditorDocument : isLocalSettingsDocument)(
      win.webContents.getURL(),
    )
  )
    throw new McpActionError(
      'window-unavailable',
      'Open the requested CoreLive window first.',
    )
  if (target === 'editor' && role === 'close_window') {
    if (!(await deps.windows.closeLiveEditor()))
      throw new McpActionError(
        'flush-failed',
        'Save pending LiveEditor writing first.',
      )
    return { status: 'hidden', window: target }
  }
  const contents = win.webContents
  const roles: Record<WindowRole, () => void> = {
    undo_edit: () => contents.undo(),
    redo_edit: () => contents.redo(),
    copy_selection: () => contents.copy(),
    cut_selection: () => contents.cut(),
    paste_text: () => contents.paste(),
    select_all: () => contents.selectAll(),
    reload_window: () => contents.reload(),
    force_reload_window: () => contents.reloadIgnoringCache(),
    toggle_developer_tools: () => contents.toggleDevTools(),
    reset_zoom: () => contents.setZoomLevel(0),
    zoom_in: () => contents.setZoomLevel(contents.getZoomLevel() + 1),
    zoom_out: () => contents.setZoomLevel(contents.getZoomLevel() - 1),
    toggle_fullscreen: () => win.setFullScreen(!win.isFullScreen()),
    minimize_window: () => win.minimize(),
    close_window: () => win.close(),
  }
  roles[role]()
  return { status: 'requested', window: target }
}

/** Protects current typing before a menu operation replaces or closes the live document.
 * @example await applyWindowRole(context, runtime, 'reload_window', 'editor')
 */
async function applyWindowRole(
  deps: NativeActionContext,
  runtime: EditorRuntime,
  role: WindowRole,
  window: CoreLiveWindow,
) {
  // WindowManager owns the close handshake and releases input on the next reveal.
  const reloadsEditor =
    window === 'editor' &&
    (role === 'reload_window' || role === 'force_reload_window')
  if (!reloadsEditor) return runWindowRole(deps, role, window)
  const { saved, release } = await runtime.ipc.flushForReload(
    runtime.controller.getSnapshot().generation,
  )
  try {
    if (!saved)
      throw new McpActionError(
        'flush-failed',
        'Save pending LiveEditor writing first.',
      )
    return await runWindowRole(deps, role, window)
  } catch (error) {
    // A reload that could not start leaves the existing renderer in place.
    release()
    throw error
  }
}

/** Uses the same settings, windows, menu, sign-out and update implementations as the Mac app.
 * @example const result = await runNativeAction(deps,runtime,call)
 */
export async function runNativeAction(
  deps: NativeActionContext,
  runtime: EditorRuntime,
  call: McpCall,
): Promise<Record<string, unknown> | undefined> {
  const { windows, config } = deps
  const { controller } = runtime
  const saved = (
    ok: boolean,
    effect: 'none' | 'unknown' | 'partial' = 'none',
  ) => {
    if (!ok)
      throw new McpActionError(
        'operation-refused',
        'Inspect the current CoreLive setting or status.',
        effect,
      )
    return { status: 'saved' }
  }
  const opened = (ok: boolean) => {
    if (!ok)
      throw new McpActionError(
        'open-failed',
        'Open CoreLive and check the requested destination.',
      )
    return { status: 'opened' }
  }
  const updater = async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), OWNER_START_TIMEOUT_MS)
    })
    try {
      const instance = await Promise.race([deps.updater(), deadline])
      if (!instance)
        throw new McpActionError(
          'updater-unavailable',
          'Wait for CoreLive’s update service or check for updates in the application.',
        )
      return instance
    } finally {
      clearTimeout(timeout)
    }
  }
  const menu = () => {
    const instance = deps.menu()
    if (!instance)
      throw new McpActionError(
        'menu-unavailable',
        'Wait for the CoreLive application menu to load.',
      )
    return instance
  }
  if ('window' in call.args) {
    // Only these catalog entries accept a window target. The renderer origin is independently checked.
    return applyWindowRole(
      deps,
      runtime,
      call.name as WindowRole,
      call.args.window,
    )
  }
  const actions: McpActions = {
    read_settings: () => {
      const snap = controller.getSnapshot()
      return {
        version: app.getVersion(),
        preferences: snap.phase === 'ready' ? snap.workspace.preferences : null,
        opacity: windows.getLiveEditorOpacity(),
        alwaysOnTop: windows.getLiveEditorAlwaysOnTop(),
        onAllSpaces: windows.getLiveEditorVisibleOnAllWorkspaces(),
        editorBounds: windows.getLiveEditorWindow()?.getBounds() ?? null,
        shortcuts: {
          primary: config.get('shortcuts.toggleLiveEditor', ''),
          secondary: config.get('shortcuts.toggleLiveEditorSecondary', ''),
        },
        hideDockIcon: config.get('behavior.hideAppIcon', false),
        menuBarVisible: config.get('behavior.showInMenuBar', true),
        startAtLogin: app.getLoginItemSettings().openAtLogin,
        shortcutSound: {
          enabled: config.get('behavior.shortcutOpenSoundEnabled', false),
          selection: config.get(
            'behavior.shortcutOpenSoundSelection',
            DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
          ),
          choices: ['shuffle', ...SHORTCUT_OPEN_SOUND_CUES.map((c) => c.id)],
        },
      }
    },
    set_editor_shortcut: async (args) =>
      saved(
        await applyNativeSetting(
          args.slot === 'primary'
            ? 'live-editor-config-set-shortcut'
            : 'live-editor-config-set-shortcut-secondary',
          args.accelerator,
        ),
        'unknown',
      ),
    set_editor_on_all_spaces: (args) => {
      const { persisted, applied } =
        windows.setLiveEditorVisibleOnAllWorkspaces(args.enabled)
      return saved(persisted, applied ? 'partial' : 'unknown')
    },
    set_editor_always_on_top: (args) => {
      const { persisted, applied } = windows.setLiveEditorAlwaysOnTop(
        args.enabled,
      )
      return saved(persisted, applied ? 'partial' : 'unknown')
    },
    set_editor_opacity: (args) => {
      const { opacity, persisted, applied } = windows.setLiveEditorOpacity(
        args.opacity,
      )
      return {
        ...saved(persisted, applied ? 'partial' : 'unknown'),
        opacity,
        applied,
      }
    },
    set_editor_bounds: (args) => {
      const win = windows.getLiveEditorWindow()
      if (!win || win.isDestroyed())
        throw new McpActionError('window-unavailable', 'Open LiveEditor first.')
      win.setBounds(args)
      return { status: 'applied', bounds: win.getBounds() }
    },
    set_shortcut_sound_enabled: (args) =>
      saved(
        config.set('behavior.shortcutOpenSoundEnabled', args.enabled),
        'partial',
      ),
    set_shortcut_sound: (args) =>
      saved(
        config.set('behavior.shortcutOpenSoundSelection', args.selection),
        'partial',
      ),
    preview_shortcut_sound: (args) => {
      if (!isShortcutOpenSoundSelection(args.selection))
        throw new McpActionError(
          'invalid-input',
          'Choose a sound listed by read_settings.',
        )
      sound.play(args.selection)
      return { status: 'requested' }
    },
    set_dock_icon_hidden: async (args) =>
      saved(
        await applyNativeSetting('settings:setHideAppIcon', args.enabled),
        'partial',
      ),
    set_menu_bar_visible: async (args) =>
      saved(
        await applyNativeSetting('settings:setShowInMenuBar', args.enabled),
        'partial',
      ),
    set_start_at_login: async (args) =>
      saved(await applyNativeSetting('settings:setStartAtLogin', args.enabled)),
    reset_settings_window_size: () => {
      const { persisted, applied } = windows.resetSettingsPopoverSize()
      return { ...saved(persisted, applied ? 'partial' : 'unknown'), applied }
    },
    open_config_file: async () =>
      opened(await applyNativeSetting('config-open')),
    open_live_editor: () => {
      windows.showLiveEditor()
      return { status: 'requested' }
    },
    hide_live_editor: async () => {
      if (!(await windows.hideLiveEditor()))
        throw new McpActionError(
          'flush-failed',
          'Save pending LiveEditor writing and retry hiding the window.',
        )
      return { status: 'hidden' }
    },
    open_settings: () => {
      windows.openSettings()
      return { status: 'requested' }
    },
    open_dashboard: async () =>
      opened(
        await openDashboardInBrowser(windows.getDashboardOrigin(), '/home'),
      ),
    open_skill_tree: async () =>
      opened(
        await openDashboardInBrowser(
          windows.getDashboardOrigin(),
          '/skill-tree',
        ),
      ),
    read_update_status: async () => ({
      version: app.getVersion(),
      ...(await updater()).getUpdateStatus(),
    }),
    check_for_updates: async () => {
      const instance = await updater()
      await instance.manualCheckForUpdates()
      return { status: 'checked', ...instance.getUpdateStatus() }
    },
    download_update: async () => {
      if (!(await updater()).startAvailableDownload())
        throw new McpActionError(
          'update-unavailable',
          'Check for an available update before downloading.',
        )
      return { status: 'started' }
    },
    restart_to_update: async () => {
      if (!(await (await updater()).quitAndInstall()))
        throw new McpActionError(
          'update-not-applied',
          'Check the downloaded update and save pending writing.',
        )
      return { status: 'restart-requested' }
    },
    open_about: () => {
      // The non-modal About panel is used here; the menu's parentless message
      // box enters a nested modal runloop on macOS and would freeze the bridge.
      app.setAboutPanelOptions({
        applicationName: app.getName(),
        applicationVersion: app.getVersion(),
        version: `Electron ${process.versions.electron}, Node.js ${process.versions.node}`,
        copyright: 'Copyright © 2025 CoreLive',
        credits:
          'Write tasks in LiveEditor, check them off, and see every finished line on your Activity Heatmap.',
      })
      app.showAboutPanel()
      return { status: 'opened' }
    },
    show_keyboard_shortcuts: () => {
      menu().showKeyboardShortcuts(dialogHost(deps))
      return { status: 'opened' }
    },
    open_documentation: async () =>
      openLink('https://github.com/laststance/corelive#readme'),
    open_project_page: async () =>
      openLink('https://github.com/laststance/corelive'),
    open_issue_tracker: async () =>
      openLink('https://github.com/laststance/corelive/issues'),
    quit_corelive: async () => {
      if (!(await deps.prepareQuit()))
        throw new McpActionError(
          'flush-failed',
          'Keep CoreLive open and save pending writing.',
        )
      setImmediate(() => app.quit())
      return { status: 'quit-requested' }
    },
    hide_corelive: () => {
      app.hide()
      return { status: 'hidden' }
    },
    hide_other_applications: () => sendMenuAction('hideOtherApplications:'),
    show_all_applications: () => sendMenuAction('unhideAllApplications:'),
    bring_windows_to_front: () => sendMenuAction('arrangeInFront:'),
  }
  return dispatchMcpAction(actions, call)
}

/** Resolves a visible window that can host a sheet, opening Settings when none is up.
 * A parentless macOS message box runs a nested modal loop that blocks bridge replies,
 * so MCP-triggered dialogs always anchor to a real window.
 * @example menu().showKeyboardShortcuts(dialogHost(deps))
 */
function dialogHost(deps: NativeActionContext): BrowserWindow {
  const usable = (win: BrowserWindow | null): BrowserWindow | null =>
    win && !win.isDestroyed() && win.isVisible() ? win : null
  const existing =
    usable(deps.windows.getLiveEditorWindow()) ??
    usable(deps.windows.getSettingsWindow())
  if (existing) return existing
  deps.windows.openSettings()
  const settings = deps.windows.getSettingsWindow()
  if (settings && !settings.isDestroyed()) return settings
  throw new McpActionError(
    'window-unavailable',
    'Open a CoreLive window first.',
  )
}

/** Opens one of the project links offered by the Mac Help menu.
 * @example await openLink('https://github.com/laststance/corelive')
 */
async function openLink(url: string) {
  await shell.openExternal(url)
  return { status: 'opened' }
}

/** Sends an allowlisted selector supplied by the app menu to AppKit.
 * @example sendMenuAction('arrangeInFront:')
 */
function sendMenuAction(selector: string) {
  Menu.sendActionToFirstResponder(selector)
  return { status: 'requested' }
}
