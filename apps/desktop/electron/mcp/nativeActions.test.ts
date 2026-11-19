import { expect, test, vi } from 'vitest'

import type { EditorRuntime } from './editorActions'
import { runNativeAction, type NativeActionContext } from './nativeActions'
import { registerNativeSetting } from './nativeSettings'

vi.mock('electron', () => ({
  app: {},
  ipcMain: { handle: vi.fn() },
  Menu: {},
  shell: {},
}))
vi.mock('../logger', () => ({ log: {} }))

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
    windows: { getLiveEditorWindow: () => window },
  } as unknown as NativeActionContext
  const runtime = {
    controller: { getSnapshot: () => ({ generation: 1 }) },
    ipc: { flush: async () => false, shown },
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
  ['set_editor_on_all_spaces', 'setLiveEditorVisibleOnAllWorkspaces'],
  ['set_editor_always_on_top', 'setLiveEditorAlwaysOnTop'],
] as const)(
  '%s reports partial effect when the panel updates and config saving fails',
  async (name, method) => {
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
  ['open_live_editor', 'showLiveEditor'],
  ['open_settings', 'openSettings'],
] as const)(
  '%s acknowledges a request while the first document is still loading',
  async (name, method) => {
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
  const change = runNativeAction(context, {} as EditorRuntime, {
    name: 'set_editor_opacity',
    args: { opacity: 0.1 },
  })

  // Assert
  await expect(change).resolves.toEqual({
    status: 'saved',
    opacity: 0.3,
    applied: false,
  })
})

test.each([
  [
    { name: 'set_editor_opacity', args: { opacity: 0.9 } },
    'setLiveEditorOpacity',
  ],
  [
    { name: 'reset_settings_window_size', args: {} },
    'resetSettingsPopoverSize',
  ],
] as const)(
  '%j reports partial when the window changed but the write failed',
  async (call, method) => {
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
