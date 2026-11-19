import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { app } from 'electron'
import { expect, onTestFinished, test, vi } from 'vitest'

import { ConfigManager } from '../ConfigManager'

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

// Value: protects=unsaved writing survives an MCP close request;
// fails_when=close runs after a refused flush or editing stays suspended;
// why_new=controller tests cover flush but do not invoke native window roles;
// seam=none; no_claim=Electron window and renderer are simulated.
test('refusing a close after an unsuccessful save keeps the editor open and resumes editing', async () => {
  // Arrange
  const close = vi.fn()
  const shown = vi.fn()
  const window = {
    close,
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      getURL: () => 'corelive-editor://app/index.html',
    },
  }
  const context = {
    windows: {
      getLiveEditorWindow: () => window,
      closeLiveEditor: async () => false,
    },
  } as unknown as NativeActionContext
  const runtime = {
    ipc: { shown },
  } as unknown as EditorRuntime

  // Act
  const closing = runNativeAction(context, runtime, {
    name: 'close_window',
    args: { window: 'editor' },
  })

  // Assert
  await expect(closing).rejects.toMatchObject({ code: 'flush-failed' })
  expect(close).not.toHaveBeenCalled()
  expect(shown).toHaveBeenCalledOnce()
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
  expect(() => parseMcpCall('set_editor_opacity', { opacity: 0.1 })).toThrow()
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
