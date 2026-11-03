import { randomUUID } from 'node:crypto'

import type { OfflineEditorSnapshot } from '@corelive/desktop-contract/offline-workspace-v2'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { afterEach, expect, test, vi } from 'vitest'

import type { WindowManager } from '../WindowManager'

import { categoryUuid } from './deviceWorkspaceFixture'
import type { OfflineEditorController } from './OfflineEditorController'
import { isTrustedAuthSender, OfflineEditorIPC } from './OfflineEditorIPC'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  clipboard: { writeText: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
  shell: { openExternal: vi.fn(async () => undefined) },
}))
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

type Handler = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => Promise<unknown>

/** Creates frame-bound Electron test doubles; no actual window or clipboard is touched.
 * @example const fixture = createFixture()
 */
function createFixture() {
  const frame = {
    url: 'corelive-editor://app/index.html',
    origin: 'corelive-editor://app',
  }
  const settingsFrame = {
    url: 'corelive-editor://app/settings.html',
    origin: 'corelive-editor://app',
  }
  const editor = {
    isDestroyed: () => false,
    webContents: {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
      isCrashed: () => false,
      getURL: () => frame.url,
      send: vi.fn(),
    },
  }
  const settings = {
    isDestroyed: () => false,
    webContents: {
      mainFrame: settingsFrame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
      getURL: () => settingsFrame.url,
      send: vi.fn(),
    },
  }
  const event = {
    sender: editor.webContents,
    senderFrame: frame,
  } as unknown as IpcMainInvokeEvent
  const settingsEvent = {
    sender: settings.webContents,
    senderFrame: settingsFrame,
  } as unknown as IpcMainInvokeEvent
  const preferences = {
    revision: 0,
    theme: 'cathedral-light',
    settings: UserSettingsStateSchema.parse({}),
  }
  let snapshot: OfflineEditorSnapshot = {
    phase: 'ready',
    generation: 1,
    sync: {
      state: 'local-only',
      waitingCount: 0,
      lastSyncedAt: null,
      boundEmail: null,
    },
    workspace: {
      ownerId: 'account-a',
      revision: 0,
      selectedCategoryId: categoryUuid(1),
      categories: [],
      preferences,
      draft: {
        revision: 0,
        rows: [{ id: randomUUID(), text: 'PRIVATE DRAFT' }],
      },
      pendingCount: 0,
      blockedCount: 0,
      recentUndo: [],
      eligibleUndoCount: 0,
      checkpoint: null,
      nextClearAt: null,
      nextUndoAt: null,
      categoryMoves: {},
      binding: null,
      recoveryCopyCount: 0,
      needsALookCount: 0,
      today: {
        day: '2026-10-21',
        timezone: 'UTC',
        total: 0,
        deviceTotal: 0,
        scope: 'device',
        stale: true,
        confirmedAt: null,
        lastAccountTotal: null,
      },
    },
  }
  const controller = {
    getSnapshot: () => snapshot,
    readSnapshot: vi.fn(async () => snapshot),
    canLeaveWithoutRenderer: vi.fn(() => true),
    retrySync: vi.fn(),
    syncDetails: vi.fn(),
    details: vi.fn(async () => ({ total: 0, records: [] })),
    command: vi.fn(async () => ({
      ok: true,
      generation: 1,
      revision: 1,
      workspace: null,
    })),
    accountStatus: vi.fn(() => ({ state: 'never-attached' })),
    connect: vi.fn(async () => true),
    signOut: vi.fn(async () => ({ status: 'signed-out' })),
    notNow: vi.fn(async () => ({ status: 'signed-out' })),
  }
  const windows = {
    openSettings: vi.fn(),
    getLiveEditorWindow: () => editor as unknown as BrowserWindow,
    getSettingsWindow: () => settings as unknown as BrowserWindow,
    getLoginWindow: () => null,
    showLoginWindow: vi.fn(),
    getWebAppOrigin: () => 'https://corelive.app',
  }
  const signOutDevice = vi.fn(async (run: () => Promise<unknown>) => run())
  const ipc = new OfflineEditorIPC(
    windows as unknown as WindowManager,
    controller as unknown as OfflineEditorController,
    { signOutDevice: signOutDevice as never },
  )
  ipc.register()
  const handler = (channel: string): Handler => {
    const registration = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([name]) => name === channel)
    if (!registration) throw new Error('Missing test handler')
    return registration[1] as Handler
  }
  return {
    ipc,
    event,
    settingsEvent,
    frame,
    editor,
    settings,
    controller,
    windows,
    signOutDevice,
    preferences,
    handler,
    updateSnapshot: (next: OfflineEditorSnapshot): void => {
      snapshot = next
    },
    changeAccount: (): void => {
      snapshot = { phase: 'opening', generation: 2 }
    },
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

test('only the current local main frame can read writing; another window, child frame and foreign origin are rejected', async () => {
  // Arrange
  const { event, settingsEvent, frame, handler } = createFixture()
  const read = handler('offline-editor-snapshot')

  // Act / Assert
  await expect(read(event)).resolves.toMatchObject({
    phase: 'ready',
    generation: 1,
  })
  await expect(read(settingsEvent)).rejects.toThrow('Unauthorized editor')
  await expect(
    read({ ...event, senderFrame: { ...frame } } as IpcMainInvokeEvent),
  ).rejects.toThrow('Unauthorized editor')
  frame.origin = 'https://corelive.app'
  await expect(read(event)).rejects.toThrow('Unauthorized editor')
})

test('a late details response from the previous account never crosses the bridge', async () => {
  // Arrange
  const { event, handler, controller, changeAccount } = createFixture()
  let release!: () => void
  controller.details.mockImplementation(
    async () =>
      new Promise((resolve) => {
        release = (): void => resolve({ total: 0, records: [] })
      }),
  )

  // Act
  const response = handler('offline-editor-details')(event, 1, 0, 50)
  changeAccount()
  release()

  // Assert
  await expect(response).rejects.toThrow('Account changed')
})

test.each(['failed', 'account-changed'] as const)(
  'a %s initial snapshot cannot leak old writing or leave later notifications blocked',
  async (outcome) => {
    // Arrange
    const { ipc, event, handler, controller, editor, changeAccount } =
      createFixture()
    const previous = controller.getSnapshot()
    let release!: () => void
    controller.readSnapshot.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      if (outcome === 'failed') throw new Error('Snapshot unavailable')
      return previous
    })

    // Act
    const read = handler('offline-editor-snapshot')(event)
    ipc.publish(previous)
    expect(editor.webContents.send).not.toHaveBeenCalled()
    if (outcome === 'account-changed') changeAccount()
    release()

    // Assert
    await expect(read).rejects.toThrow(
      outcome === 'failed' ? 'Snapshot unavailable' : 'Account changed',
    )
    expect(editor.webContents.send).not.toHaveBeenCalled()
    ipc.publish(controller.getSnapshot())
    expect(editor.webContents.send).toHaveBeenCalledWith(
      'offline-editor-changed',
      controller.getSnapshot(),
    )
  },
)

test('Settings receives only preferences after a patch, never the account draft', async () => {
  // Arrange
  const { settingsEvent, handler } = createFixture()

  // Act
  const result = await handler('settings-window-preferences-patch')(
    settingsEvent,
    1,
    {
      type: 'preferences',
      commandId: randomUUID(),
      expectedRevision: 0,
      patch: { showTodayEmber: true },
    },
  )

  // Assert
  expect(result).toMatchObject({
    ok: true,
    generation: 1,
    preferences: { theme: 'cathedral-light' },
  })
  expect(JSON.stringify(result)).not.toContain('PRIVATE DRAFT')
  expect(result).not.toHaveProperty('workspace')
})

test('the Settings snapshot carries preferences, categories and account status but no draft text', async () => {
  // Arrange
  const { settingsEvent, handler } = createFixture()

  // Act
  const snapshot = await handler('settings-window-snapshot')(settingsEvent)

  // Assert
  expect(snapshot).toMatchObject({
    phase: 'ready',
    generation: 1,
    account: { state: 'never-attached' },
  })
  expect(JSON.stringify(snapshot)).not.toContain('PRIVATE DRAFT')
})

test.each([
  ['the editor window', (f: ReturnType<typeof createFixture>) => f.event],
  [
    'a child frame of Settings',
    (f: ReturnType<typeof createFixture>) =>
      ({
        ...f.settingsEvent,
        senderFrame: { ...f.settings.webContents.mainFrame },
      }) as IpcMainInvokeEvent,
  ],
])('Settings capabilities reject %s', async (_name, pick) => {
  // Arrange
  const fixture = createFixture()

  // Act / Assert
  await expect(
    fixture.handler('settings-window-snapshot')(pick(fixture)),
  ).rejects.toThrow('Unauthorized settings')
})

test.each([
  'corelive-editor://app/index.html',
  'corelive-editor://app/settings.html?x=1',
  'https://corelive.app/settings',
])(
  'the Settings window at %s is not trusted with native capabilities',
  async (url) => {
    // Arrange
    const fixture = createFixture()
    fixture.settings.webContents.mainFrame.url = url

    // Act / Assert
    await expect(
      fixture.handler('settings-window-snapshot')(fixture.settingsEvent),
    ).rejects.toThrow('Unauthorized settings')
  },
)

test('a Settings request for a previous generation is rejected before it reaches the workspace', async () => {
  // Arrange
  const fixture = createFixture()

  // Act / Assert
  await expect(
    fixture.handler('settings-window-category-command')(
      fixture.settingsEvent,
      0,
      {
        type: 'categoryRename',
        commandId: randomUUID(),
        categoryId: categoryUuid(1),
        name: 'x',
      },
    ),
  ).rejects.toThrow('Account changed')
  expect(fixture.controller.command).not.toHaveBeenCalled()
})

test('Settings category commands reach the workspace with the current generation', async () => {
  // Arrange
  const fixture = createFixture()
  const command = {
    type: 'categoryRename',
    commandId: randomUUID(),
    categoryId: categoryUuid(1),
    name: 'Reading',
  }

  // Act
  await fixture.handler('settings-window-category-command')(
    fixture.settingsEvent,
    1,
    command,
  )

  // Assert
  expect(fixture.controller.command).toHaveBeenCalledExactlyOnceWith(1, command)
})

test('opening the dashboard uses the configured server origin and rejects any renderer-supplied address', async () => {
  // Arrange
  const fixture = createFixture()
  const { shell } = await import('electron')
  const open = fixture.handler('settings-window-account-open-dashboard')

  // Act
  await expect(
    open(fixture.settingsEvent, 'https://evil.example'),
  ).rejects.toThrow('IPC validation failed')
  await open(fixture.settingsEvent)

  // Assert
  expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(
    'https://corelive.app/home',
  )
})

test('Settings sign-out and Not now run through the one shared sign-out implementation', async () => {
  // Arrange
  const fixture = createFixture()

  // Act
  await fixture.handler('settings-window-account-sign-out')(
    fixture.settingsEvent,
  )
  await fixture.handler('settings-window-account-not-now')(
    fixture.settingsEvent,
  )

  // Assert
  expect(fixture.signOutDevice).toHaveBeenCalledTimes(2)
  expect(fixture.controller.signOut).toHaveBeenCalledOnce()
  expect(fixture.controller.notNow).toHaveBeenCalledOnce()
})

test('Settings sign-in opens the login window and Connect attaches the pending account', async () => {
  // Arrange
  const fixture = createFixture()

  // Act
  await fixture.handler('settings-window-account-sign-in')(
    fixture.settingsEvent,
  )
  const connected = await fixture.handler('settings-window-account-connect')(
    fixture.settingsEvent,
  )

  // Assert
  expect(fixture.windows.showLoginWindow).toHaveBeenCalledOnce()
  expect(connected).toBe(true)
})

test('only the login window may send authentication notifications, never Settings', () => {
  // Arrange
  const fixture = createFixture()
  const loginFrame = {
    url: 'https://corelive.app/login-shell',
    origin: 'https://corelive.app',
  }
  const login = {
    isDestroyed: () => false,
    webContents: { mainFrame: loginFrame },
  }
  const windows = {
    ...fixture.windows,
    getLoginWindow: () => login,
  } as unknown as WindowManager
  const loginEvent = {
    sender: login.webContents,
    senderFrame: loginFrame,
  } as unknown as IpcMainInvokeEvent

  // Act / Assert
  expect(isTrustedAuthSender(loginEvent, windows)).toBe(true)
  expect(isTrustedAuthSender(fixture.settingsEvent, windows)).toBe(false)
  expect(isTrustedAuthSender(fixture.event, windows)).toBe(false)
})

test('hide and quit share one flush challenge and reject stale or foreign acknowledgements', async () => {
  // Arrange
  const { ipc, event, settingsEvent, editor, handler } = createFixture()

  // Act
  const first = ipc.flush(1)
  const second = ipc.flush(1)
  const request: unknown = editor.webContents.send.mock.calls[0]?.[1]

  // Assert
  expect(editor.webContents.send).toHaveBeenCalledOnce()
  await expect(
    handler('offline-editor-flush-result')(settingsEvent, request, true),
  ).rejects.toThrow('Unauthorized editor')
  await expect(
    handler('offline-editor-flush-result')(
      event,
      { requestId: randomUUID(), generation: 1 },
      true,
    ),
  ).resolves.toBe(false)
  await expect(
    handler('offline-editor-flush-result')(event, request, false),
  ).resolves.toBe(true)
  await expect(first).resolves.toBe(false)
  await expect(second).resolves.toBe(false)
})

test('a missing flush reply cancels an ordinary exit rather than acknowledging lost writing', async () => {
  // Arrange
  vi.useFakeTimers()
  const { ipc } = createFixture()

  // Act
  const flush = ipc.flush(1)
  await vi.advanceTimersByTimeAsync(15000)

  // Assert
  await expect(flush).resolves.toBe(false)
})

test('a crashed editor permits quitting or updating without waiting for an unreachable flush reply', async () => {
  // Arrange
  vi.useFakeTimers()
  const { ipc, editor } = createFixture()
  vi.spyOn(editor.webContents, 'isCrashed').mockReturnValue(true)

  // Act
  const flush = ipc.flush(1)
  try {
    expect(editor.webContents.send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    await vi.advanceTimersByTimeAsync(15000)
  }

  // Assert
  await expect(flush).resolves.toBe(true)
})

test('the Sync details read is served to the editor window of the current generation only', async () => {
  // Arrange
  const { handler, controller, event, settingsEvent } = createFixture()
  controller.syncDetails.mockResolvedValue({
    rows: [],
    history: [],
    migrationSummary: null,
    preservedBackups: [],
    dashboardOnlyCount: 0,
  })

  // Act
  const details = await handler('offline-editor-sync-details')(event, 1)

  // Assert
  expect(details).toMatchObject({ rows: [] })
  await expect(
    handler('offline-editor-sync-details')(settingsEvent, 1),
  ).rejects.toThrow()
  await expect(
    handler('offline-editor-sync-details')(event, 0),
  ).rejects.toThrow()
})
