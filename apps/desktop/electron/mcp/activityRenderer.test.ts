import { fileURLToPath } from 'node:url'

import { expect, test, vi } from 'vitest'

import { renderActivityCard } from './activityRenderer'

type ActivityFrameEvent = { senderFrame: { url: string } }

const contents = vi.hoisted(() => ({
  mainFrame: { url: '' },
  loadURL: vi.fn<(url: string) => Promise<void>>(),
  ipc: {
    handle:
      vi.fn<
        (
          channel: string,
          listener: (event: ActivityFrameEvent) => unknown,
        ) => void
      >(),
    on: vi.fn<
      (
        channel: string,
        listener: (event: ActivityFrameEvent, payload: unknown) => void,
      ) => void
    >(),
  },
  setWindowOpenHandler: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  close: vi.fn(),
  isDestroyed: () => false,
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => '/Applications/CoreLive%20QA.app' },
  WebContentsView: class {
    webContents = {
      ...contents,
      // Electron's loadFile passes path escapes through its legacy file URL formatter.
      loadFile: async (path: string): Promise<void> =>
        contents.loadURL(`file://${path}`),
    }
    setBounds = vi.fn()
  },
}))

test('the bundled activity card can exchange IPC when the app path contains a literal %20', async () => {
  // Arrange
  let delivered: unknown
  contents.loadURL.mockImplementation(async (url) => {
    if (
      fileURLToPath(url) !==
      '/Applications/CoreLive%20QA.app/dist-electron/renderer/activity.html'
    )
      throw new Error('Activity document is missing')
    contents.mainFrame.url = url
    const event = { senderFrame: contents.mainFrame }
    const readCard = contents.ipc.handle.mock.calls.find(
      ([channel]) => channel === 'activity-card-input',
    )?.[1]
    const finish = contents.ipc.on.mock.calls.find(
      ([channel]) => channel === 'activity-card-output',
    )?.[1]
    if (!readCard || !finish) throw new Error('Activity IPC is unavailable')
    delivered = readCard(event)
    finish(event, 'data:image/png;base64,AA==')
  })

  // Act
  const result = await renderActivityCard({
    isoDate: '2026-05-12',
    totalCompleted: 8,
    topCategoryName: 'Writing',
  })

  // Assert
  expect(contents.loadURL).toHaveBeenCalledExactlyOnceWith(
    'file:///Applications/CoreLive%2520QA.app/dist-electron/renderer/activity.html',
  )
  expect(delivered).toEqual({
    isoDate: '2026-05-12',
    totalCompleted: 8,
    topCategoryName: 'Writing',
  })
  expect(result).toBe('data:image/png;base64,AA==')
})
