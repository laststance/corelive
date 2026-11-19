import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { app } from 'electron'
import { expect, onTestFinished, test, vi } from 'vitest'

import { ConfigManager } from '../ConfigManager'
import {
  buildDeviceWorkspace,
  categoryUuid,
} from '../offline/deviceWorkspaceFixture'
import { workspaceView } from '../offline/workspace-worker-protocol'

import { createAppActions } from './appActions'
import type { EditorRuntime } from './editorActions'
import { runNativeAction, type NativeActionContext } from './nativeActions'
import { registerNativeSetting } from './nativeSettings'
import { parseMcpCall } from './tools'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
    getVersion: () => '1.0.0',
    getLoginItemSettings: () => ({ openAtLogin: false }),
  },
  ipcMain: { handle: vi.fn() },
  Menu: {},
  shell: {},
}))
vi.mock('../logger', () => ({ log: { error: vi.fn() } }))

test.each([
  [
    'hides',
    true,
    async (closing: ReturnType<typeof runNativeAction>): Promise<void> =>
      expect(closing).resolves.toEqual({ status: 'hidden', window: 'editor' }),
  ],
  [
    'refuses to hide',
    false,
    async (closing: ReturnType<typeof runNativeAction>): Promise<void> =>
      expect(closing).rejects.toMatchObject({
        code: 'flush-failed',
        effect: 'none',
      }),
  ],
] as const)(
  'closing LiveEditor %s without releasing a pending reload input barrier',
  async (_outcome, hidden, expectClose) => {
    // Arrange
    const shown = vi.fn()
    const reload = vi.fn()
    const closeLiveEditor = vi.fn(async () => hidden)
    let acknowledge = (): void => {}
    const flushForReload = vi.fn(async () => ({
      saved: await new Promise<boolean>((resolve) => {
        acknowledge = (): void => resolve(true)
      }),
      release: shown,
    }))
    const window = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        getURL: () => 'corelive-editor://app/index.html',
        reload,
      },
    }
    const context = {
      windows: { getLiveEditorWindow: () => window, closeLiveEditor },
    } as unknown as NativeActionContext
    const runtime = {
      controller: { getSnapshot: () => ({ generation: 1 }) },
      ipc: { flushForReload },
    } as unknown as EditorRuntime

    // Act
    const reloading = runNativeAction(context, runtime, {
      name: 'reload_window',
      args: { window: 'editor' },
    })
    const closing = runNativeAction(context, runtime, {
      name: 'close_window',
      args: { window: 'editor' },
    })

    // Assert
    await expectClose(closing)
    expect(closeLiveEditor).toHaveBeenCalledOnce()
    expect(reload).not.toHaveBeenCalled()
    expect(shown).not.toHaveBeenCalled()
    acknowledge()
    await expect(reloading).resolves.toEqual({
      status: 'requested',
      window: 'editor',
    })
    expect(reload).toHaveBeenCalledOnce()
    expect(shown).not.toHaveBeenCalled()
  },
)

test.each(['reload_window', 'force_reload_window'] as const)(
  '%s leaves LiveEditor editable when the renderer does not acknowledge a save',
  async (name) => {
    // Arrange
    const shown = vi.fn()
    const reload = vi.fn()
    const window = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        getURL: () => 'corelive-editor://app/index.html',
        reload,
        reloadIgnoringCache: reload,
      },
    }
    const context = {
      windows: { getLiveEditorWindow: () => window },
    } as unknown as NativeActionContext
    const runtime = {
      controller: { getSnapshot: () => ({ generation: 1 }) },
      ipc: { flushForReload: async () => ({ saved: false, release: shown }) },
    } as unknown as EditorRuntime

    // Act
    const reloading = runNativeAction(context, runtime, {
      name,
      args: { window: 'editor' },
    })

    // Assert
    await expect(reloading).rejects.toMatchObject({
      code: 'flush-failed',
      effect: 'none',
    })
    expect(reload).not.toHaveBeenCalled()
    expect(shown).toHaveBeenCalledOnce()
  },
)

test('an MCP reload waits until another session finishes its task addition save retry', async () => {
  // Arrange
  const categoryId = categoryUuid(1)
  const ready = {
    phase: 'ready',
    generation: 1,
    workspace: workspaceView(buildDeviceWorkspace()),
  } as const
  let acknowledge = (): void => {}
  const retrySaving = new Promise<boolean>((resolve) => {
    acknowledge = (): void => resolve(true)
  })
  const flush = vi
    .fn<() => Promise<boolean>>()
    .mockResolvedValueOnce(false)
    .mockReturnValueOnce(retrySaving)
  const shown = vi.fn()
  const releaseReload = vi.fn()
  const flushForReload = vi.fn(async () => ({
    saved: false,
    release: releaseReload,
  }))
  const runtime = {
    ipc: { flush, flushForReload, shown },
    controller: {
      mcpAccountBinding: () => null,
      getSnapshot: () => ready,
      readSnapshot: async () => ready,
      appendMcpTask: async () => ({
        categoryId,
        categoryPath: 'General',
        rowId: '00000000-0000-4000-8000-000000000009',
        title: 'Stay in this note',
      }),
    },
  } as unknown as EditorRuntime
  const actions = createAppActions({
    runtime,
    profileDirectory: '/unused-corelive-test-profile',
    native: async (call) =>
      runNativeAction({} as NativeActionContext, runtime, call),
    signOutDevice: async (run) => run(),
  })

  // Act
  const adding = actions.call('adding', 'append_unfinished_task', {
    operationId: '00000000-0000-4000-8000-000000000018',
    title: 'Stay in this note',
  })
  await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(2))
  const reloading = actions.call('reloading', 'reload_window', {})
  await new Promise<void>((resolve) => setImmediate(resolve))

  // Assert
  expect(flushForReload).not.toHaveBeenCalled()
  expect(shown).not.toHaveBeenCalled()
  expect(releaseReload).not.toHaveBeenCalled()
  acknowledge()
  await expect(adding).resolves.toMatchObject({
    isError: false,
    structuredContent: { status: 'saved', title: 'Stay in this note' },
  })
  await expect(reloading).resolves.toMatchObject({
    isError: true,
    structuredContent: { code: 'flush-failed', effect: 'none' },
  })
  expect(shown).toHaveBeenCalledOnce()
  expect(flushForReload).toHaveBeenCalledOnce()
  expect(releaseReload).toHaveBeenCalledOnce()
})

// Value: protects=a refused Dock visibility change reports a possible partial effect;
// fails_when=the MCP route changes a different preference or reports success;
// why_new=Settings tests invoke IPC separately from the MCP caller;
// seam=none; no_claim=the native Settings callback is simulated.
test('a refused Dock visibility change tells the client the setting may already have changed', async () => {
  // Arrange
  const setHidden = vi.fn(async () => false)
  registerNativeSetting('settings:setHideAppIcon', setHidden)

  // Act
  const change = runNativeAction(
    {} as NativeActionContext,
    {} as EditorRuntime,
    {
      name: 'set_dock_icon_hidden',
      args: { enabled: true },
    },
  )

  // Assert
  await expect(change).rejects.toMatchObject({
    code: 'operation-refused',
    effect: 'partial',
  })
  expect(setHidden).toHaveBeenCalledWith(true)
})

test.each([
  [
    'enabling the shortcut sound',
    { name: 'set_shortcut_sound_enabled', args: { enabled: true } },
    'behavior.shortcutOpenSoundEnabled',
    false,
    { enabled: true },
  ],
  [
    'choosing a shortcut sound',
    {
      name: 'set_shortcut_sound',
      args: { selection: 'balanced-deep-thock' },
    },
    'behavior.shortcutOpenSoundSelection',
    'shuffle',
    { selection: 'balanced-deep-thock' },
  ],
] as const)(
  '%s reports a partial change when the new preference cannot be saved',
  async (_label, call, path, previous, shortcutSound) => {
    // Arrange
    const directory = mkdtempSync(join(tmpdir(), 'corelive-mcp-config-'))
    onTestFinished(() => rmSync(directory, { recursive: true }))
    vi.mocked(app.getPath).mockReturnValue(directory)
    const config = new ConfigManager()
    expect(config.set(path, previous)).toBe(true)
    mkdirSync(join(directory, 'config.json.tmp'))
    const context = {
      config,
      windows: {
        getLiveEditorOpacity: () => 1,
        getLiveEditorAlwaysOnTop: () => false,
        getLiveEditorVisibleOnAllWorkspaces: () => false,
        getLiveEditorWindow: () => null,
      },
    } as unknown as NativeActionContext
    const runtime = {
      controller: { getSnapshot: () => ({ phase: 'opening' }) },
    } as unknown as EditorRuntime

    // Act
    const change = runNativeAction(context, runtime, call)

    // Assert
    await expect(change).rejects.toMatchObject({
      code: 'operation-refused',
      effect: 'partial',
    })
    await expect(
      runNativeAction(context, runtime, { name: 'read_settings', args: {} }),
    ).resolves.toMatchObject({ shortcutSound })
    expect(new ConfigManager().get(path)).toBe(previous)
  },
)

// Value: protects=an unavailable update cannot be reported as downloading;
// fails_when=the download action ignores the updater refusal;
// why_new=updater tests exercise its own API without the MCP result;
// seam=none; no_claim=no update server or Electron session participates.
test('a cold menu bar change waits for tray startup while other settings remain available', async () => {
  // Arrange
  let finishTrayStartup = (): void => {}
  const trayStartup = new Promise<void>((resolve) => {
    finishTrayStartup = resolve
  })
  const changeTray = vi.fn((_visible: boolean) => true)
  const persist = vi.fn((_visible: boolean) => true)
  registerNativeSetting(
    'settings:setShowInMenuBar',
    (show) => changeTray(show) && persist(show),
    trayStartup,
  )
  const changeLogin = vi.fn(() => true)
  registerNativeSetting('settings:setStartAtLogin', changeLogin)
  const context = {} as NativeActionContext
  const runtime = {} as EditorRuntime

  // Act
  const change = runNativeAction(context, runtime, {
    name: 'set_menu_bar_visible',
    args: { enabled: false },
  })
  const login = await runNativeAction(context, runtime, {
    name: 'set_start_at_login',
    args: { enabled: true },
  })

  // Assert
  expect(login).toEqual({ status: 'saved' })
  expect(changeLogin).toHaveBeenCalledWith(true)
  expect(changeTray).not.toHaveBeenCalled()
  expect(persist).not.toHaveBeenCalled()
  finishTrayStartup()
  await expect(change).resolves.toEqual({ status: 'saved' })
  expect(changeTray).toHaveBeenCalledExactlyOnceWith(false)
  expect(persist).toHaveBeenCalledExactlyOnceWith(false)
})

test('requesting a download without an available update reports a refusal', async () => {
  // Arrange
  const context = {
    updater: () => ({ startAvailableDownload: () => false }),
  } as unknown as NativeActionContext

  // Act
  const download = runNativeAction(context, {} as EditorRuntime, {
    name: 'download_update',
    args: {},
  })

  // Assert
  await expect(download).rejects.toMatchObject({
    code: 'update-unavailable',
    effect: 'none',
  })
})

test('update status waits for startup while a separate native action stays available', async () => {
  // Arrange
  let ready = (): void => {}
  const startup = new Promise<void>((resolve) => {
    ready = resolve
  })
  const getUpdateStatus = vi.fn(() => ({
    updateAvailable: true,
    updateDownloaded: false,
    downloadProgress: null,
    isChecking: false,
    message: null,
  }))
  const showLiveEditor = vi.fn()
  const context = {
    windows: { showLiveEditor },
    updater: async () => {
      await startup
      return { getUpdateStatus }
    },
  } as unknown as NativeActionContext
  const runtime = {} as EditorRuntime

  // Act
  const status = runNativeAction(context, runtime, {
    name: 'read_update_status',
    args: {},
  })
  const open = await runNativeAction(context, runtime, {
    name: 'open_live_editor',
    args: {},
  })

  // Assert
  expect(open).toEqual({ status: 'requested' })
  expect(showLiveEditor).toHaveBeenCalledOnce()
  expect(getUpdateStatus).not.toHaveBeenCalled()
  ready()
  await expect(status).resolves.toEqual({
    version: '1.0.0',
    updateAvailable: true,
    updateDownloaded: false,
    downloadProgress: null,
    isChecking: false,
    message: null,
  })
})

test('an updater still starting after fifteen seconds refuses to download even if it later becomes available', async () => {
  // Arrange
  vi.useFakeTimers()
  onTestFinished((): void => {
    vi.useRealTimers()
  })
  let ready = (): void => {}
  const startup = new Promise<void>((resolve) => {
    ready = resolve
  })
  const startAvailableDownload = vi.fn(() => true)
  const context = {
    updater: async () => {
      await startup
      return { startAvailableDownload }
    },
  } as unknown as NativeActionContext

  // Act
  const download = runNativeAction(context, {} as EditorRuntime, {
    name: 'download_update',
    args: {},
  })
  const refused = expect(download).rejects.toMatchObject({
    code: 'updater-unavailable',
    effect: 'none',
  })
  await vi.advanceTimersByTimeAsync(15_000)
  await refused
  ready()
  await vi.advanceTimersByTimeAsync(0)

  // Assert
  expect(startAvailableDownload).not.toHaveBeenCalled()
})

test.each([
  [
    'disabling the editor on all Spaces',
    'set_editor_on_all_spaces',
    'setLiveEditorVisibleOnAllWorkspaces',
  ],
  [
    'unpinning the editor',
    'set_editor_always_on_top',
    'setLiveEditorAlwaysOnTop',
  ],
] as const)(
  '%s reports partial effect when the panel updates and config saving fails',
  async (_label, name, method) => {
    // Arrange
    const changeWindow = vi.fn(() => ({
      enabled: false,
      persisted: false,
      applied: true,
    }))
    const context = {
      windows: { [method]: changeWindow },
    } as unknown as NativeActionContext

    // Act
    const change = runNativeAction(context, {} as EditorRuntime, {
      name,
      args: { enabled: false },
    })

    // Assert
    await expect(change).rejects.toMatchObject({
      code: 'operation-refused',
      effect: 'partial',
    })
    expect(changeWindow).toHaveBeenCalledWith(false)
  },
)

test.each([
  ['LiveEditor', 'open_live_editor', 'showLiveEditor'],
  ['Settings', 'open_settings', 'openSettings'],
] as const)(
  'opening %s requests its window and reports the request was accepted',
  async (_label, name, method) => {
    // Arrange
    const requestOpen = vi.fn()
    const context = {
      windows: { [method]: requestOpen },
    } as unknown as NativeActionContext

    // Act
    const opening = runNativeAction(context, {} as EditorRuntime, {
      name,
      args: {},
    })

    // Assert
    await expect(opening).resolves.toEqual({ status: 'requested' })
    expect(requestOpen).toHaveBeenCalledOnce()
  },
)

test('saving opacity with no editor window reports a saved preference only', async () => {
  // Arrange
  const context = {
    windows: {
      setLiveEditorOpacity: () => ({
        opacity: 0.3,
        persisted: true,
        applied: false,
      }),
    },
  } as unknown as NativeActionContext

  // Act
  const change = runNativeAction(
    context,
    {} as EditorRuntime,
    parseMcpCall('set_editor_opacity', { opacity: 0.3 }),
  )

  // Assert
  await expect(change).resolves.toEqual({
    status: 'saved',
    opacity: 0.3,
    applied: false,
  })
})

test('MCP rejects window opacity lower than 0.3', () => {
  // Arrange
  const input = { opacity: 0.1 }

  // Act + Assert
  expect(() => parseMcpCall('set_editor_opacity', input)).toThrow(
    expect.objectContaining({ code: 'invalid-input', effect: 'none' }),
  )
})

test.each([
  [
    'changing editor opacity',
    { name: 'set_editor_opacity', args: { opacity: 0.9 } },
    'setLiveEditorOpacity',
  ],
  [
    'resetting the Settings window size',
    { name: 'reset_settings_window_size', args: {} },
    'resetSettingsPopoverSize',
  ],
] as const)(
  '%s reports a partial change when the window updates but the preference cannot be saved',
  async (_label, call, method) => {
    // Arrange
    const context = {
      windows: {
        [method]: () => ({ opacity: 0.9, persisted: false, applied: true }),
      },
    } as unknown as NativeActionContext

    // Act
    const change = runNativeAction(context, {} as EditorRuntime, call)

    // Assert
    await expect(change).rejects.toMatchObject({
      code: 'operation-refused',
      effect: 'partial',
    })
  },
)
