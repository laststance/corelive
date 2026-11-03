// @vitest-environment node
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { ScreenshotSession, type BrowserRunner } from './qa-fixture-cli'
import { SETTINGS_FIXTURE_STATES } from './qa-fixture-states'

const desktop = resolve(import.meta.dirname, '..')
const root = resolve(desktop, '../..')
const builtSettings = join(desktop, 'dist-electron/renderer/settings.html')
const scratch = mkdtempSync(join(tmpdir(), 'corelive-qa-fixtures-test-'))

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/**
 * Runs a desktop script directly (not through pnpm, which flattens exit codes to 1).
 * @example runDesktopScript('scripts/qa-settings.ts', ['--help'])
 */
function runDesktopScript(
  script: string,
  args: string[],
  env: Record<string, string> = {},
) {
  return spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: desktop,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 120_000,
  })
}

/** Counts leftover editor-fixture temp directories. */
function fixtureTempDirectories(): number {
  return readdirSync(tmpdir()).filter((name) =>
    name.startsWith('corelive-offline-qa-'),
  ).length
}

describe('qa:offline-editor CLI contract', () => {
  test('--help exits 0 with every fixture listed, no build needed and no temp directory created', () => {
    // Arrange
    const before = fixtureTempDirectories()

    // Act
    const result = runDesktopScript(
      'scripts/qa-offline-editor.ts',
      ['--help'],
      {
        QA_FIXTURE_DIST: join(scratch, 'no-build'),
      },
    )

    // Assert
    expect(result.status).toBe(0)
    for (const name of ['local-only', 'signed-out', 'attached', 'recovery'])
      expect(result.stdout).toContain(name)
    expect(result.stdout).toContain('{"fixture","url","pid","data"}')
    expect(fixtureTempDirectories()).toBe(before)
  })

  test('an unknown fixture exits 2 with the FIXTURE_UNKNOWN message and starts nothing', () => {
    // Arrange
    const before = fixtureTempDirectories()

    // Act
    const result = runDesktopScript('scripts/qa-offline-editor.ts', [
      '--fixture',
      'bogus',
    ])

    // Assert
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(
      'qa:offline-editor: unknown fixture "bogus" (FIXTURE_UNKNOWN). Valid: local-only, signed-out, attached, recovery. Fix: pnpm qa:offline-editor --fixture local-only\n',
    )
    expect(fixtureTempDirectories()).toBe(before)
  })

  test('a missing built renderer exits 3 with FIXTURE_BUILD_MISSING and the fix command', () => {
    // Arrange
    const missing = join(scratch, 'no-build')

    // Act
    const result = runDesktopScript(
      'scripts/qa-offline-editor.ts',
      ['--fixture', 'attached'],
      { QA_FIXTURE_DIST: missing },
    )

    // Assert
    expect(result.status).toBe(3)
    expect(result.stderr).toBe(
      `qa:offline-editor: built renderer missing at ${join(missing, 'renderer/index.html')} (FIXTURE_BUILD_MISSING). Fix: pnpm electron:build:ts, then rerun.\n`,
    )
  })
})

describe('qa:settings CLI contract', () => {
  test('--help lists all 14 states from the one shared list', () => {
    // Arrange + Act
    const result = runDesktopScript('scripts/qa-settings.ts', ['--help'], {
      QA_FIXTURE_DIST: join(scratch, 'no-build'),
    })

    // Assert
    expect(result.status).toBe(0)
    expect(SETTINGS_FIXTURE_STATES).toHaveLength(14)
    for (const state of SETTINGS_FIXTURE_STATES)
      expect(result.stdout).toContain(state.name)
  })

  test('a missing built Settings document exits 3 with FIXTURE_BUILD_MISSING', () => {
    // Arrange + Act
    const result = runDesktopScript('scripts/qa-settings.ts', [], {
      QA_FIXTURE_DIST: join(scratch, 'no-build'),
    })

    // Assert
    expect(result.status).toBe(3)
    expect(result.stderr).toContain('(FIXTURE_BUILD_MISSING)')
  })

  test('an unknown flag exits 2 before any side effect', () => {
    // Arrange + Act
    const result = runDesktopScript('scripts/qa-settings.ts', [
      '--fixture',
      'x',
    ])

    // Assert
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('(ARGUMENT_UNKNOWN)')
  })
})

describe.skipIf(!existsSync(builtSettings))(
  'qa:settings states in a browser',
  () => {
    /**
     * Starts the real fixture, returns its URL and a stopper.
     * @example const server = await startSettingsFixture()
     */
    async function startSettingsFixture() {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'scripts/qa-settings.ts'],
        { cwd: desktop, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      const line = await new Promise<string>((resolveLine, reject) => {
        child.stdout.once('data', (chunk) => resolveLine(String(chunk)))
        child.once('exit', () => reject(new Error('fixture exited early')))
      })
      return {
        first: JSON.parse(line) as {
          url: string
          pid: number
          states: string[]
        },
        stop: () => child.kill('SIGTERM'),
      }
    }

    test('every state name renders its ready text and an unknown one renders the alert and the error object', async () => {
      // Arrange
      const require = createRequire(import.meta.url)
      const playwright = createRequire(
        require.resolve('@playwright/cli/package.json'),
      )('playwright-core') as PlaywrightCore
      const server = await startSettingsFixture()
      const browser = await playwright.chromium.launch({ channel: 'chromium' })
      const page = await browser.newPage()
      const outside: string[] = []
      page.on('request', (request) => {
        if (!request.url().startsWith(server.first.url))
          outside.push(request.url())
      })
      try {
        // Act + Assert: each state shows its ready text
        expect(server.first.states).toHaveLength(14)
        for (const state of SETTINGS_FIXTURE_STATES) {
          await page.goto(`${server.first.url}?state=${state.name}`)
          await page
            .getByText(state.readyText)
            .first()
            .waitFor({ state: 'visible', timeout: 10_000 })
        }

        // Act: an unknown state
        await page.goto(`${server.first.url}?state=nope`)
        const alert = page.getByRole('alert')
        const error = await page.evaluate(
          () =>
            (window as unknown as { __settingsFixture: { error: unknown } })
              .__settingsFixture.error,
        )

        // Assert
        await alert.waitFor({ state: 'visible' })
        expect(await alert.textContent()).toContain(
          'Unknown fixture state "nope". Valid: account-never-attached',
        )
        expect(error).toEqual({
          code: 'FIXTURE_STATE_UNKNOWN',
          valid: server.first.states,
        })
        expect(outside).toEqual([])
      } finally {
        await browser.close()
        server.stop()
      }
    }, 120_000)
  },
)

/** The few playwright-core calls the browser test needs (it is a transitive dependency of the CLI). */
interface PlaywrightCore {
  chromium: {
    launch: (options: { channel: string }) => Promise<{
      newPage: () => Promise<PageLike>
      close: () => Promise<void>
    }>
  }
}
interface LocatorLike {
  first: () => LocatorLike
  waitFor: (options?: { state?: 'visible'; timeout?: number }) => Promise<void>
  textContent: () => Promise<string | null>
}
interface PageLike {
  on: (
    event: 'request',
    listener: (request: { url: () => string }) => void,
  ) => void
  goto: (url: string) => Promise<unknown>
  getByText: (text: string) => LocatorLike
  getByRole: (role: 'alert') => LocatorLike
  evaluate: <T>(callback: () => T) => Promise<T>
}

describe('--screenshots', () => {
  /** A scripted `qa:browser` stand-in that records calls and answers run-code like Playwright. */
  function scriptedBrowser(options: { neverReady?: string[] }) {
    const calls: string[][] = []
    const run: BrowserRunner = async (args) => {
      calls.push(args)
      const code = args[0] === 'run-code' ? (args[1] ?? '') : ''
      const isReadyCheck = code.includes('FIXTURE_STATE_READY')
      const blocked = (options.neverReady ?? []).some((text) =>
        code.includes(JSON.stringify(text)),
      )
      return {
        status: 0,
        stdout: isReadyCheck && !blocked ? '"FIXTURE_STATE_READY"' : '',
        stderr: '',
      }
    }
    return { calls, run }
  }

  test('writes one manifest entry per size with the asserted ready text', async () => {
    // Arrange
    const directory = join(scratch, 'shots-ok')
    const browser = scriptedBrowser({})
    const session = new ScreenshotSession({
      command: 'qa:offline-editor',
      directory,
      run: browser.run,
    })

    // Act
    await session.open()
    await session.capture({
      state: 'local-only',
      url: 'http://127.0.0.1:1/',
      readyText: 'Saved on this Mac',
    })
    await session.finish()

    // Assert
    expect(
      JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')),
    ).toEqual({
      screenshots: [
        {
          state: 'local-only',
          width: 320,
          height: 300,
          file: 'local-only-320x300.png',
          readyText: 'Saved on this Mac',
        },
        {
          state: 'local-only',
          width: 360,
          height: 380,
          file: 'local-only-360x380.png',
          readyText: 'Saved on this Mac',
        },
        {
          state: 'local-only',
          width: 600,
          height: 700,
          file: 'local-only-600x700.png',
          readyText: 'Saved on this Mac',
        },
      ],
    })
    expect(browser.calls.at(-1)).toEqual(['close'])
  })

  test('a state whose ready text never appears exits 5 with FIXTURE_STATE_TIMEOUT and keeps the shots already taken', async () => {
    // Arrange
    const directory = join(scratch, 'shots-timeout')
    const browser = scriptedBrowser({
      neverReady: ['Sign in to sync completions'],
    })
    const session = new ScreenshotSession({
      command: 'qa:offline-editor',
      directory,
      run: browser.run,
      timeoutMs: 50,
    })

    // Act
    await session.open()
    await session.capture({
      state: 'local-only',
      url: 'u',
      readyText: 'Saved on this Mac',
    })
    await session.capture({
      state: 'signed-out',
      url: 'u',
      readyText: 'Sign in to sync completions',
    })
    const failure = await session.finish().catch((error: unknown) => error)

    // Assert
    expect(failure).toMatchObject({
      code: 'FIXTURE_STATE_TIMEOUT',
      exitCode: 5,
    })
    expect(String(failure)).toContain(
      '"signed-out" (needs "Sign in to sync completions")',
    )
    expect(
      JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
        .screenshots,
    ).toHaveLength(3)
  })

  test('a missing Chromium exits 6 with the install command', async () => {
    // Arrange
    const session = new ScreenshotSession({
      command: 'qa:settings',
      directory: join(scratch, 'shots-nobrowser'),
      run: async () => ({
        status: 1,
        stdout: '',
        stderr: "browserType.launch: Executable doesn't exist at /x",
      }),
    })

    // Act
    const failure = await session.open().catch((error: unknown) => error)

    // Assert
    expect(failure).toMatchObject({
      code: 'FIXTURE_BROWSER_MISSING',
      exitCode: 6,
    })
    expect(String(failure)).toContain(
      'pnpm exec playwright-cli install-browser chromium',
    )
  })
})

describe('qa:web CLI contract (DX4)', () => {
  test('--help exits 0 and names the JSON first line', () => {
    // Arrange + Act
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/qa-web.ts', '--help'],
      { cwd: join(root, 'apps/web'), encoding: 'utf8', timeout: 60_000 },
    )

    // Assert
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('{"url","pid","views"}')
  })
})

describe('benchmark:offline', () => {
  test('a forced slow run exits 1 with the BENCH_GATE_FAILED line', () => {
    // Arrange + Act
    const result = runDesktopScript('scripts/benchmark-offline-workspace.ts', [
      '--completions',
      '20',
      '--max-p95-ms',
      '0',
    ])

    // Assert
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(
      /^benchmark:offline: keep-commit p95 attached [\d.]+ ms, local-only [\d.]+ ms > 0 ms at 20 completions \(BENCH_GATE_FAILED\)\. Fix: rerun once on an idle Mac;/,
    )
  }, 120_000)

  test('--help exits 0 and --json prints the contract object', () => {
    // Arrange + Act
    const help = runDesktopScript('scripts/benchmark-offline-workspace.ts', [
      '--help',
    ])
    const json = runDesktopScript('scripts/benchmark-offline-workspace.ts', [
      '--json',
      '--completions',
      '20',
    ])
    const output = JSON.parse(json.stdout)

    // Assert
    expect(help.status).toBe(0)
    expect(json.status).toBe(0)
    expect(Object.keys(output.machine)).toEqual([
      'cpu',
      'cores',
      'memoryGb',
      'os',
      'node',
    ])
    expect(
      output.runs.map(
        (run: { profile: string; operation: string }) =>
          `${run.profile}/${run.operation}`,
      ),
    ).toEqual([
      'attached/keep',
      'attached/autosave',
      'attached/cold-parse',
      'local-only/keep',
      'local-only/autosave',
      'local-only/cold-parse',
    ])
    expect(output.gate).toBeNull()
  }, 120_000)
})
