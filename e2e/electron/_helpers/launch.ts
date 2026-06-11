import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'

const RENDERER_URL = 'http://localhost:4991'
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
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `corelive-electron-${safeSpecName}-`),
  )

  fs.writeFileSync(
    logPath,
    `=== launch env ===\n` +
      `NODE_ENV=test\n` +
      `ELECTRON_RENDERER_URL=${RENDERER_URL}\n` +
      `ELECTRON_E2E_USER_DATA_DIR=${userDataDir}\n` +
      `ELECTRON_E2E_DISABLE_SYSTEM_INTEGRATION=true\n` +
      `=== main-process output (stdout + stderr interleaved) ===\n`,
  )

  let electronApp: ElectronApplication
  try {
    electronApp = await electron.launch({
      args: [ELECTRON_MAIN_ENTRY],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_RENDERER_URL: RENDERER_URL,
        PLAYWRIGHT_REMOTE_DEBUGGING_PORT: REMOTE_DEBUG_PORT,
        ELECTRON_E2E_DISABLE_SYSTEM_INTEGRATION: 'true',
        ELECTRON_E2E_USER_DATA_DIR: userDataDir,
      },
    })
  } catch (error) {
    fs.rmSync(userDataDir, { recursive: true, force: true })
    throw error
  }

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
  proc.once('exit', () => {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  return electronApp
}

/**
 * Detects the main renderer page by its preload bridge, not creation order.
 *
 * @param page - Electron renderer page to probe.
 * @returns True when the page exposes the main-window preload API.
 * @example
 * const isMain = await pageHasMainPreload(page)
 */
async function pageHasMainPreload(page: Page): Promise<boolean> {
  try {
    await page.waitForLoadState('domcontentloaded', {
      timeout: LOAD_TIMEOUT_MS,
    })
    return await page.evaluate(() => {
      return Boolean(
        window.electronEnv?.isElectron && window.electronAPI?.app?.getVersion,
      )
    })
  } catch {
    return false
  }
}

/**
 * Waits for the main window even when auxiliary panels are created first.
 *
 * @param electronApp - Launched Electron application under test.
 * @returns The Playwright page backed by the main BrowserWindow.
 * @example
 * const mainWindow = await waitForMainWindow(electronApp)
 */
export async function waitForMainWindow(
  electronApp: ElectronApplication,
): Promise<Page> {
  const firstWindow = await electronApp.firstWindow()
  const deadline = Date.now() + LOAD_TIMEOUT_MS

  while (Date.now() < deadline) {
    const windows = [firstWindow, ...electronApp.windows()]
    for (const window of windows) {
      if (await pageHasMainPreload(window)) {
        return window
      }
    }

    await electronApp
      .waitForEvent('window', { timeout: 250 })
      .catch(() => undefined)
  }

  const urls = electronApp.windows().map((window) => window.url())
  throw new Error(`Main Electron window was not found. Open URLs: ${urls}`)
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
  const mainWindow = await waitForMainWindow(electronApp)
  await mainWindow.waitForLoadState('domcontentloaded')
  return { electronApp, mainWindow }
}
