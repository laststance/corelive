/**
 * @fileoverview Shared Electron launcher for the Playwright E2E suite.
 *
 * Why a shared launcher?
 * - Every spec needs the same environment contract (NODE_ENV=test,
 *   ELECTRON_RENDERER_URL, PLAYWRIGHT_REMOTE_DEBUGGING_PORT,
 *   ELECTRON_E2E_DISABLE_SYSTEM_INTEGRATION). Centralizing prevents drift.
 * - Main-process stdout/stderr must be captured at launch time (NOT in
 *   `afterAll`) because `deferredInit()` can crash before any test body
 *   runs. Streaming `data` events to disk catches early failures that
 *   would otherwise surface only as Playwright timeouts.
 *
 * @module e2e/electron/_helpers/launch
 */

import fs from 'node:fs'
import path from 'node:path'

import { _electron as electron } from 'playwright'
import type { ElectronApplication } from 'playwright'

/**
 * URL the renderer will load during E2E. Hardcoded to localhost so a
 * misconfigured `.env` cannot point E2E at production.
 */
const RENDERER_URL = 'http://localhost:3011'

/**
 * Compiled Electron entry point produced by `electron-vite build`. The
 * `pnpm electron:build:ts` step runs unconditionally before the spec to
 * keep this file in sync with the source.
 */
const ELECTRON_MAIN_ENTRY = 'dist-electron/main/index.cjs'

/**
 * Directory where Playwright already writes traces / screenshots /
 * videos. Putting our main-process logs here lets the existing CI
 * `actions/upload-artifact` step pick them up with no extra config.
 */
const LOG_DIR = 'test-results'

/**
 * Launch the compiled Electron app for an E2E spec.
 *
 * @param specName - Short identifier (e.g. `'startup'`, `'preload'`) used
 *   to namespace the main-process log file. Whitespace is replaced with
 *   `-` so the value lands cleanly in a filename.
 * @returns The Playwright `ElectronApplication` handle. The caller is
 *   responsible for closing it in `afterAll`.
 *
 * @example
 * ```ts
 * let app: ElectronApplication
 * test.beforeAll(async () => { app = await launchElectronForTest('startup') })
 * test.afterAll(async () => { await app?.close() })
 * ```
 */
export async function launchElectronForTest(
  specName: string,
): Promise<ElectronApplication> {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const safeSpecName = specName.replace(/\s+/g, '-')
  const logPath = path.join(LOG_DIR, `electron-main-${safeSpecName}.log`)

  // Truncate any prior run's log so we don't conflate runs.
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
      PLAYWRIGHT_REMOTE_DEBUGGING_PORT: '9222',
      ELECTRON_E2E_DISABLE_SYSTEM_INTEGRATION: 'true',
    },
  })

  // Attach streaming listeners IMMEDIATELY after launch — main-process
  // output can flow during `deferredInit`, before the first window is
  // ready. `appendFileSync` (sync I/O per chunk) is intentional: it
  // survives a hard process exit better than buffered async writes.
  const proc = electronApp.process()
  proc.stdout?.on('data', (chunk) => {
    fs.appendFileSync(logPath, chunk)
  })
  proc.stderr?.on('data', (chunk) => {
    fs.appendFileSync(logPath, chunk)
  })

  return electronApp
}
