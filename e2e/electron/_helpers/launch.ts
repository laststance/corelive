import fs from 'node:fs'
import path from 'node:path'

import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'

const RENDERER_URL = 'http://localhost:3011'
const ELECTRON_MAIN_ENTRY = 'dist-electron/main/index.cjs'
const LOG_DIR = 'test-results'
const REMOTE_DEBUG_PORT = '9222'

/** Default timeout (ms) for waiting on renderer URL transitions in specs. */
export const LOAD_TIMEOUT_MS = 30_000

export async function launchElectronForTest(
  specName: string,
): Promise<ElectronApplication> {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  // `path.basename` strips any directory traversal — current callers all
  // pass hardcoded literals, but a future caller deriving `specName` from
  // dynamic test metadata could otherwise write outside `LOG_DIR`.
  const safeSpecName = path.basename(specName.replace(/\s+/g, '-'))
  const logPath = path.join(LOG_DIR, `electron-main-${safeSpecName}.log`)

  fs.writeFileSync(
    logPath,
    `=== launch env ===\n` +
      `NODE_ENV=test\n` +
      `ELECTRON_RENDERER_URL=${RENDERER_URL}\n` +
      `ELECTRON_E2E_DISABLE_SYSTEM_INTEGRATION=true\n` +
      `=== main-process output (stdout + stderr interleaved) ===\n`,
  )

  const electronApp = await electron.launch({
    args: [ELECTRON_MAIN_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_RENDERER_URL: RENDERER_URL,
      PLAYWRIGHT_REMOTE_DEBUGGING_PORT: REMOTE_DEBUG_PORT,
      ELECTRON_E2E_DISABLE_SYSTEM_INTEGRATION: 'true',
    },
  })

  // Attach listeners immediately — main-process output can flow during
  // `deferredInit` before the first window is ready, and a deferredInit
  // crash would otherwise surface only as a Playwright timeout. Sync I/O
  // per chunk survives a hard process exit better than buffered writes.
  const proc = electronApp.process()
  proc.stdout?.on('data', (chunk) => {
    fs.appendFileSync(logPath, chunk)
  })
  proc.stderr?.on('data', (chunk) => {
    fs.appendFileSync(logPath, chunk)
  })

  return electronApp
}

/**
 * Launch Electron AND wait for the renderer's first window to load — the
 * setup that `preload.spec.ts` and `window-controls.spec.ts` both need.
 * `startup.spec.ts` does NOT use this helper because it tests the load
 * path itself (the `domcontentloaded` wait belongs in the test body, not
 * `beforeAll`).
 */
export async function setupElectronTest(specName: string): Promise<{
  electronApp: ElectronApplication
  mainWindow: Page
}> {
  const electronApp = await launchElectronForTest(specName)
  const mainWindow = await electronApp.firstWindow()
  await mainWindow.waitForLoadState('domcontentloaded')
  return { electronApp, mainWindow }
}
