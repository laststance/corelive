import fs from 'node:fs'
import path from 'node:path'

import { _electron as electron } from 'playwright'
import type { ElectronApplication } from 'playwright'

const RENDERER_URL = 'http://localhost:3011'
const ELECTRON_MAIN_ENTRY = 'dist-electron/main/index.cjs'
const LOG_DIR = 'test-results'

/** Default timeout (ms) for waiting on renderer URL transitions in specs. */
export const LOAD_TIMEOUT_MS = 30_000

export async function launchElectronForTest(
  specName: string,
): Promise<ElectronApplication> {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const safeSpecName = specName.replace(/\s+/g, '-')
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
      PLAYWRIGHT_REMOTE_DEBUGGING_PORT: '9222',
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
