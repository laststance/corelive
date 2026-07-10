import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'

/**
 * Renderer origin the E2E main process is pointed at via `ELECTRON_RENDERER_URL`.
 * Exported as the single source of truth so specs assert against it instead of
 * re-hardcoding the port (which could silently drift from this launch env).
 */
export const RENDERER_URL = 'http://localhost:4991'
const ELECTRON_MAIN_ENTRY = 'dist-electron/main/index.cjs'
const LOG_DIR = 'test-results'
const REMOTE_DEBUG_PORT = '9222'

/**
 * #127 Phase 2: root for per-launch V8 coverage dirs. Each booted main process
 * flushes its own V8 data here on clean close; `scripts/electron-coverage-report.mjs`
 * source-map-remaps them to `electron/*.ts` for the Phase 3 merge.
 */
const ELECTRON_V8_COVERAGE_ROOT = 'coverage/.electron-v8'
/**
 * Inject `NODE_V8_COVERAGE` only when explicitly collecting (`COVERAGE=1`), so
 * the normal pass/fail Electron suite + CI gate run untouched.
 */
const COVERAGE_ENABLED = process.env.COVERAGE === '1'

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

  // #127 Phase 2: a per-launch V8 coverage dir so the booted main process
  // flushes its own coverage on clean close; collected later by the report
  // script. Created only under COVERAGE=1 to keep the normal suite inert.
  let coverageDir: string | undefined
  if (COVERAGE_ENABLED) {
    fs.mkdirSync(ELECTRON_V8_COVERAGE_ROOT, { recursive: true })
    coverageDir = fs.mkdtempSync(
      path.join(ELECTRON_V8_COVERAGE_ROOT, `${safeSpecName}-`),
    )
  }

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
        // #127 Phase 2: per-launch main-process V8 coverage (COVERAGE=1 only).
        ...(coverageDir ? { NODE_V8_COVERAGE: coverageDir } : {}),
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
 * Detects the renderer page that carries the FULL `electronAPI` bridge.
 *
 * After main-window retirement, that bridge is loaded only by the on-demand
 * Settings window (`WindowManager.createSettingsWindow` → `preload.cjs`); the
 * front-door Floating window exposes just `{ auth, oauth }`. Probe by the
 * bridge itself — not by URL, because a signed-out Settings window sits on
 * `/login?redirect_url=…/settings`, so a `/settings` URL match would miss it.
 *
 * @param page - Electron renderer page to probe.
 * @returns True when the page exposes the full preload API (`app.getVersion`).
 * @example
 * const isBridge = await pageHasFullBridge(page)
 */
async function pageHasFullBridge(page: Page): Promise<boolean> {
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
 * Waits for the window exposing the full `electronAPI` bridge (the Settings
 * window). Call `openSettingsWindow` first — the bridge window is opened on
 * demand, not at launch.
 *
 * @param electronApp - Launched Electron application under test.
 * @returns The Playwright page backed by the full-bridge (Settings) window.
 * @example
 * const settingsWindow = await waitForFullBridgeWindow(electronApp)
 */
export async function waitForFullBridgeWindow(
  electronApp: ElectronApplication,
): Promise<Page> {
  const firstWindow = await electronApp.firstWindow()
  const deadline = Date.now() + LOAD_TIMEOUT_MS

  while (Date.now() < deadline) {
    const windows = [firstWindow, ...electronApp.windows()]
    for (const window of windows) {
      if (await pageHasFullBridge(window)) {
        return window
      }
    }

    await electronApp
      .waitForEvent('window', { timeout: 250 })
      .catch(() => undefined)
  }

  const urls = electronApp.windows().map((window) => window.url())
  throw new Error(
    `Full-bridge (Settings) window was not found. Open URLs: ${urls}`,
  )
}

/**
 * Detects the Floating navigator front-door page by its renderer URL.
 *
 * @param page - Electron renderer page to probe.
 * @returns True when the page is the Floating navigator (`/floating-navigator`).
 * @example
 * const isFloating = await pageIsFloating(page)
 */
async function pageIsFloating(page: Page): Promise<boolean> {
  try {
    await page.waitForLoadState('domcontentloaded', {
      timeout: LOAD_TIMEOUT_MS,
    })
    return /\/floating-navigator/.test(page.url())
  } catch {
    return false
  }
}

/**
 * Waits for the Floating navigator window — the signed-out front door that
 * opens on a fresh launch (`showFloating` default). Generic window-control and
 * startup specs target it because it is always present without opening Settings.
 *
 * @param electronApp - Launched Electron application under test.
 * @returns The Playwright page backed by the Floating BrowserWindow.
 * @example
 * const floating = await waitForFloatingWindow(electronApp)
 */
export async function waitForFloatingWindow(
  electronApp: ElectronApplication,
): Promise<Page> {
  const firstWindow = await electronApp.firstWindow()
  const deadline = Date.now() + LOAD_TIMEOUT_MS

  while (Date.now() < deadline) {
    const windows = [firstWindow, ...electronApp.windows()]
    for (const window of windows) {
      if (await pageIsFloating(window)) {
        return window
      }
    }

    await electronApp
      .waitForEvent('window', { timeout: 250 })
      .catch(() => undefined)
  }

  const urls = electronApp.windows().map((window) => window.url())
  throw new Error(`Floating navigator window was not found. Open URLs: ${urls}`)
}

/**
 * Opens the Settings window via the main-process test hook, then waits for its
 * full-bridge renderer. The Settings window is the only post-retirement surface
 * that loads the complete `electronAPI` preload, so specs exercising privileged
 * IPC (settings / window / brainDump) drive it.
 *
 * The hook (`__coreliveTestOpenSettings`, installed in `main.ts` right after
 * WindowManager is constructed) is platform-independent. We deliberately do NOT
 * click the app-menu "Settings…" item: that menu is macOS-only, but this
 * suite runs on Linux+xvfb in CI where it is never built. The hook is set during
 * `criticalInit`, so retry until it is present after launch.
 *
 * @param electronApp - Launched Electron application under test.
 * @returns The Playwright page backed by the Settings (full-bridge) window.
 * @example
 * const settingsWindow = await openSettingsWindow(electronApp)
 */
export async function openSettingsWindow(
  electronApp: ElectronApplication,
): Promise<Page> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS
  let invoked = false
  while (Date.now() < deadline && !invoked) {
    // Call the test hook in the main process; `openSettings()` is idempotent
    // (focuses an existing Settings window rather than spawning a duplicate).
    invoked = await electronApp.evaluate(() => {
      const openSettings = (
        globalThis as typeof globalThis & {
          __coreliveTestOpenSettings?: () => void
        }
      ).__coreliveTestOpenSettings
      if (typeof openSettings !== 'function') return false
      openSettings()
      return true
    })
    if (!invoked) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  if (!invoked) {
    throw new Error(
      'Settings test hook (__coreliveTestOpenSettings) was never installed — ' +
        'the main process did not reach WindowManager initialisation.',
    )
  }
  return waitForFullBridgeWindow(electronApp)
}

/**
 * Launch Electron, open the Settings window, and return its full-bridge page —
 * the setup every spec that exercises privileged IPC (`settings` / `window` /
 * `brainDump` namespaces) needs. The pre-retirement main window that hosted
 * this bridge is gone; the Settings window is its successor.
 *
 * `startup.spec.ts` and `window-controls.spec.ts` do NOT use this helper —
 * they target the front-door Floating window via `waitForFloatingWindow`.
 */
export async function setupElectronTest(specName: string): Promise<{
  electronApp: ElectronApplication
  settingsWindow: Page
}> {
  const electronApp = await launchElectronForTest(specName)
  // The front-door Floating window opens first; wait for it so the app menu
  // (built in deferredInit) is ready before we click through to Settings.
  await electronApp.firstWindow()
  const settingsWindow = await openSettingsWindow(electronApp)
  await settingsWindow.waitForLoadState('domcontentloaded')
  return { electronApp, settingsWindow }
}
