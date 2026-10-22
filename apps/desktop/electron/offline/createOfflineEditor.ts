import { join } from 'node:path'

import { app } from 'electron'

import type { ConfigManager } from '../ConfigManager'
import type { WindowManager } from '../WindowManager'

import { createSyncTransport } from './createSyncTransport'
import { OfflineEditorController } from './OfflineEditorController'
import { OfflineEditorIPC } from './OfflineEditorIPC'
import { TokenBroker } from './TokenBroker'

/** Creates the single native workspace owner before any renderer loads.
 * Main calls once; reopening a panel reuses this runtime and its account actors.
 * @example const runtime = createOfflineEditor(windows, config, mainDirectory)
 */
export function createOfflineEditor(
  windows: WindowManager,
  config: ConfigManager,
  mainDirectory: string,
) {
  const origin = windows.getWebAppOrigin()
  const broker = new TokenBroker({
    origin,
    preload: join(mainDirectory, '..', 'preload', 'preload-offline-auth.cjs'),
  })
  const controller: OfflineEditorController = new OfflineEditorController({
    directory: join(app.getPath('userData'), 'offline'),
    workerScript: join(mainDirectory, 'workspace-worker.cjs'),
    broker,
    transport: (token) => createSyncTransport(origin, token),
    legacyNotes: () =>
      config.get<Record<string, string>>('liveEditor.notes', {}),
    requestFlush: async (generation) => ipc.flush(generation),
    onPreparationCancelled: (generation) =>
      ipc.resumeAfterCancelledTransition(generation),
    openSettingsForPreparation: () => {
      windows.createSettingsWindow(true)
    },
    onSnapshot: (snapshot) => ipc.publish(snapshot),
    onSettingsContext: () => ipc.settingsChanged(),
  })
  const ipc: OfflineEditorIPC = new OfflineEditorIPC(windows, controller)
  ipc.register()
  windows.setBeforeEditorHide(async () =>
    ipc.flush(controller.getSnapshot().generation),
  )
  windows.setOnEditorShown(() => {
    ipc.shown()
    if (controller.getSnapshot().phase === 'ready')
      controller.retryPreparation()
  })
  return { controller, ipc }
}
