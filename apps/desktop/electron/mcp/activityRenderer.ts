import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { ExportDayInput } from '@corelive/live-editor/activity-card'
import {
  app,
  WebContentsView,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron'

import {
  ACTIVITY_INPUT_CHANNEL,
  ACTIVITY_OUTPUT_CHANNEL,
} from './activityChannel'

/**
 * Renders one account day in a sandboxed document with no attached native window.
 * The owner sends only the three visible card fields. Its scoped IPC disappears
 * with this view, including on failure, timeout, or a renderer crash.
 * @example const dataUrl = await renderActivityCard(input)
 */
export async function renderActivityCard(
  input: ExportDayInput,
): Promise<string> {
  const dist = join(app.getAppPath(), 'dist-electron')
  const html = join(dist, 'renderer', 'activity.html')
  const expectedUrl = pathToFileURL(html).href
  const view = new WebContentsView({
    webPreferences: {
      // An unattached view needs a compositor for html-to-image's animation-frame callback.
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webSecurity: true,
      partition: 'corelive-activity-card',
      preload: join(dist, 'preload', 'preload-activity.cjs'),
    },
  })
  view.setBounds({ x: 0, y: 0, width: 480, height: 600 })
  const contents = view.webContents
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    event.senderFrame === contents.mainFrame &&
    event.senderFrame?.url === expectedUrl
  // Local file resources only. A programmatic main-process load does not trigger will-navigate.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.on('will-frame-navigate', (event) => event.preventDefault())
  contents.ipc.handle(ACTIVITY_INPUT_CHANNEL, (event) => {
    if (!trusted(event)) throw new Error('Unknown activity document')
    return input
  })
  let timeout: NodeJS.Timeout | undefined
  try {
    return await new Promise<string>((resolve, reject) => {
      const fail = (): void => reject(new Error('Activity capture unavailable'))
      timeout = setTimeout(fail, 30_000)
      contents.once('render-process-gone', fail)
      contents.once('destroyed', fail)
      contents.ipc.on(ACTIVITY_OUTPUT_CHANNEL, (event, payload: unknown) => {
        if (!trusted(event) || typeof payload !== 'string') fail()
        else resolve(payload)
      })
      void contents.loadFile(html).catch(fail)
    })
  } finally {
    clearTimeout(timeout)
    if (!contents.isDestroyed()) contents.close()
  }
}
