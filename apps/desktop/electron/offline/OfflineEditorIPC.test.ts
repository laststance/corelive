import { randomUUID } from 'node:crypto'

import type { OfflineEditorSnapshot } from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { afterEach, expect, test, vi } from 'vitest'

import type { WindowManager } from '../WindowManager'

import type { OfflineEditorController } from './OfflineEditorController'
import { OfflineEditorIPC } from './OfflineEditorIPC'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  clipboard: { writeText: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
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
    url: 'https://www.corelive.app/settings',
    origin: 'https://www.corelive.app',
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
    theme: 'warm-cathedral-light',
    settings: UserSettingsStateSchema.parse({}),
  }
  let snapshot: OfflineEditorSnapshot = {
    phase: 'ready',
    generation: 1,
    sync: 'offline',
    workspace: {
      ownerId: 'account-a',
      revision: 0,
      selectedCategoryId: 1,
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
      categoryDeletions: {},
      recoveryCopyCount: 0,
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
    retryPreparation: vi.fn(),
    details: vi.fn(async () => ({ total: 0, records: [] })),
    settingsContext: vi.fn(() => ({ generation: 1, preferences })),
    patchSettings: vi.fn(async () => ({
      ok: true,
      generation: 1,
      revision: 1,
      workspace: snapshot.phase === 'ready' ? snapshot.workspace : null,
    })),
  }
  const windows = {
    openSettings: vi.fn(),
    getLiveEditorWindow: () => editor as unknown as BrowserWindow,
    getSettingsWindow: () => settings as unknown as BrowserWindow,
    getLoginWindow: () => null,
    getWebAppOrigin: () => 'https://corelive.app',
  }
  const ipc = new OfflineEditorIPC(
    windows as unknown as WindowManager,
    controller as unknown as OfflineEditorController,
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
    handler,
    updateSnapshot: (next: OfflineEditorSnapshot): void => {
      snapshot = next
    },
    changeAccount: (): void => {
      snapshot = { phase: 'locked', generation: 2 }
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
  const result = await handler('offline-settings-patch')(
    settingsEvent,
    'account-a',
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
    preferences: { theme: 'warm-cathedral-light' },
  })
  expect(JSON.stringify(result)).not.toContain('PRIVATE DRAFT')
  expect(result).not.toHaveProperty('workspace')
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

test('cancelling an account departure resumes editing without releasing a newer save or another account', async () => {
  // Arrange
  const { ipc, event, editor, handler, changeAccount } = createFixture()

  // Act: cancellation after a completed flush releases the renderer barrier.
  ipc.resumeAfterCancelledTransition(1)

  // Assert
  expect(editor.webContents.send).toHaveBeenCalledWith('offline-editor-shown')
  editor.webContents.send.mockClear()

  // Act: a newer final-save challenge owns the barrier until it finishes.
  const pending = ipc.flush(1)
  const request: unknown = editor.webContents.send.mock.calls[0]?.[1]
  ipc.resumeAfterCancelledTransition(1)

  // Assert
  expect(editor.webContents.send).not.toHaveBeenCalledWith(
    'offline-editor-shown',
  )
  await handler('offline-editor-flush-result')(event, request, false)
  await expect(pending).resolves.toBe(false)
  ipc.resumeAfterCancelledTransition(1)
  expect(editor.webContents.send).toHaveBeenCalledWith('offline-editor-shown')
  editor.webContents.send.mockClear()

  // Act / Assert: a stale cancellation cannot unlock the next account.
  changeAccount()
  ipc.resumeAfterCancelledTransition(1)
  expect(editor.webContents.send).not.toHaveBeenCalled()
})

test.each(['destroyed', 'loading', 'crashed'] as const)(
  'cancelling an account departure does not notify a %s renderer',
  (state) => {
    // Arrange
    const { ipc, editor } = createFixture()
    vi.spyOn(editor.webContents, 'isDestroyed').mockReturnValue(
      state === 'destroyed',
    )
    vi.spyOn(editor.webContents, 'isLoadingMainFrame').mockReturnValue(
      state === 'loading',
    )
    vi.spyOn(editor.webContents, 'isCrashed').mockReturnValue(
      state === 'crashed',
    )

    // Act
    ipc.resumeAfterCancelledTransition(1)

    // Assert
    expect(editor.webContents.send).not.toHaveBeenCalled()
  },
)

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

test('category creation selects only an owned ID verified by the current account refresh', async () => {
  // Arrange
  const fixture = createFixture()
  const snapshot = fixture.controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Missing fixture workspace')

  // Act
  await expect(
    fixture.handler('offline-settings-category-created')(
      fixture.settingsEvent,
      'another-account',
      1,
      42,
    ),
  ).resolves.toBe(false)
  await expect(
    fixture.handler('offline-settings-category-created')(
      fixture.settingsEvent,
      'account-a',
      1,
      42,
    ),
  ).resolves.toBe(true)
  fixture.ipc.publish(snapshot)

  // Assert
  expect(
    fixture.editor.webContents.send.mock.calls.filter(
      ([event]) => event === 'offline-editor-category-created',
    ),
  ).toHaveLength(0)
  fixture.ipc.publish({
    ...snapshot,
    workspace: {
      ...snapshot.workspace,
      categories: [
        {
          id: 42,
          name: 'Created category',
          color: 'blue',
          isDefault: false,
          parentId: null,
          removed: false,
        },
      ],
    },
  })
  expect(fixture.editor.webContents.send).toHaveBeenCalledWith(
    'offline-editor-category-created',
    { generation: 1, categoryId: 42 },
  )
})

test('category management retains the requested create form through Settings hydration and discards an old account request', async () => {
  // Arrange
  const fixture = createFixture()
  const snapshot = fixture.controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Missing fixture workspace')
  fixture.updateSnapshot({ ...snapshot, sync: 'idle' })

  // Act / Assert
  await fixture.handler('offline-editor-manage-categories')(fixture.event, {
    action: 'create',
    initialName: 'Writing ideas',
  })
  await expect(
    fixture.handler('offline-settings-category-request')(fixture.settingsEvent),
  ).resolves.toEqual({
    action: 'create',
    initialName: 'Writing ideas',
    generation: 1,
  })
  await expect(
    fixture.handler('offline-settings-category-request')(fixture.settingsEvent),
  ).resolves.toBeNull()
  await fixture.handler('offline-editor-manage-categories')(fixture.event, {
    action: 'manage',
  })
  fixture.changeAccount()
  await expect(
    fixture.handler('offline-settings-category-request')(fixture.settingsEvent),
  ).resolves.toBeNull()
})
