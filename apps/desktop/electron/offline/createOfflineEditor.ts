import { join } from 'node:path'

import { app, session } from 'electron'

import type { ConfigManager } from '../ConfigManager'
import { log } from '../logger'
import type { WindowManager } from '../WindowManager'

import { createSyncTransport } from './createSyncTransport'
import { endLocalSession } from './localSessionEnd'
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
    // D3 step 4 always targets the default session; no partition exists anywhere (C3).
    endLocalSession: async () =>
      endLocalSession({
        session: session.defaultSession,
        appOrigin: origin,
        log: (line) => log.info(line),
      }),
    log: (line) => log.info(line),
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
    if (controller.getSnapshot().phase === 'ready') controller.retrySync()
  })
  return { controller, ipc }
}
