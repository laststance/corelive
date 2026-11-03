/**
 * Shared CLI contract of the desktop QA fixtures (#216 DX1, DX2, DX3).
 *
 * Both `pnpm qa:offline-editor` and `pnpm qa:settings` parse their arguments with
 * {@link parseFixtureArgs} before any side effect, report failures through {@link FixtureCliError}
 * and capture `--screenshots` through {@link ScreenshotSession}.
 *
 * @module qa-fixture-cli
 */
import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Stable error codes (DX1-DX3); each maps to one exit status. */
export type FixtureErrorCode =
  | 'ARGUMENT_UNKNOWN'
  | 'FIXTURE_UNKNOWN'
  | 'FIXTURE_BUILD_MISSING'
  | 'FIXTURE_WORKER_FAILED'
  | 'FIXTURE_STATE_TIMEOUT'
  | 'FIXTURE_BROWSER_MISSING'
  | 'FIXTURE_BROWSER_FAILED'

const EXIT_STATUS: Record<FixtureErrorCode, number> = {
  ARGUMENT_UNKNOWN: 2,
  FIXTURE_UNKNOWN: 2,
  FIXTURE_BUILD_MISSING: 3,
  FIXTURE_WORKER_FAILED: 4,
  FIXTURE_STATE_TIMEOUT: 5,
  FIXTURE_BROWSER_MISSING: 6,
  FIXTURE_BROWSER_FAILED: 6,
}

/**
 * A fixture failure with a stable code and exit status.
 *
 * Thrown by argument parsing, the build preflight and the screenshot runner; the entry points
 * catch it, print its message on stderr and exit with {@link FixtureCliError.exitCode}.
 *
 * @example throw new FixtureCliError('FIXTURE_BUILD_MISSING', 'qa:settings: built ...')
 */
export class FixtureCliError extends Error {
  readonly exitCode: number
  constructor(
    readonly code: FixtureErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'FixtureCliError'
    this.exitCode = EXIT_STATUS[code]
  }
}

/** Parsed command line shared by both fixtures. */
export interface FixtureArgs {
  help: boolean
  /** `--fixture <name>` (editor only); undefined when absent. */
  fixture: string | undefined
  /** `--screenshots <dir>`: verify, write the files and exit. */
  screenshots: string | undefined
}

/**
 * Parses `--help`, `--fixture <name>` and `--screenshots <dir>` without side effects.
 *
 * Runs first in each entry point so that a bad argument or `--help` never starts a worker,
 * creates a directory or opens a listener (DX1).
 *
 * @param argv - Arguments after the script name.
 * @param command - Script label for messages, e.g. `qa:settings`.
 * @param options - Whether `--fixture` is accepted.
 * @returns The parsed arguments.
 * @throws {@link FixtureCliError} `ARGUMENT_UNKNOWN` for an unknown flag or a missing value.
 * @example parseFixtureArgs(['--fixture', 'attached'], 'qa:offline-editor', { fixture: true })
 */
export function parseFixtureArgs(
  argv: string[],
  command: string,
  options: { fixture: boolean },
): FixtureArgs {
  const parsed: FixtureArgs = {
    help: false,
    fixture: undefined,
    screenshots: undefined,
  }
  const hint = `Fix: pnpm ${command} --help`
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!
    const [flag, inline] = argument.split(/=(.*)/s, 2) as [string, string?]
    const value = (): string => {
      const next = inline ?? argv[++index]
      // An empty inline value (`--flag=`) counts as missing, like a bare trailing flag.
      if (next === undefined || next === '' || next.startsWith('--'))
        throw new FixtureCliError(
          'ARGUMENT_UNKNOWN',
          `${command}: "${flag}" needs a value (ARGUMENT_UNKNOWN). ${hint}`,
        )
      return next
    }
    if (argument === '--help' || argument === '-h') parsed.help = true
    else if (flag === '--screenshots')
      // pnpm runs the script inside apps/desktop; relative paths mean the caller's directory.
      parsed.screenshots = resolve(
        process.env.INIT_CWD ?? process.cwd(),
        value(),
      )
    else if (flag === '--fixture' && options.fixture) parsed.fixture = value()
    else
      throw new FixtureCliError(
        'ARGUMENT_UNKNOWN',
        `${command}: unknown argument "${argument}" (ARGUMENT_UNKNOWN). ${hint}`,
      )
  }
  return parsed
}

/**
 * Fails with `FIXTURE_BUILD_MISSING` when a built file is absent (DX1 preflight).
 *
 * @param command - Script label, e.g. `qa:settings`.
 * @param label - What is missing, e.g. `built renderer`.
 * @param path - Absolute path that must exist.
 * @throws {@link FixtureCliError} `FIXTURE_BUILD_MISSING` with the fix command.
 * @example await requireBuiltFile('qa:settings', 'built renderer', join(assets, 'settings.html'))
 */
export async function requireBuiltFile(
  command: string,
  label: string,
  path: string,
): Promise<void> {
  const present = await stat(path).then(
    (entry) => entry.isFile(),
    () => false,
  )
  if (!present)
    throw new FixtureCliError(
      'FIXTURE_BUILD_MISSING',
      `${command}: ${label} missing at ${path} (FIXTURE_BUILD_MISSING). Fix: pnpm electron:build:ts, then rerun.`,
    )
}

/** The three viewports of every DA15 screenshot (DA13). */
const SCREENSHOT_SIZES = [
  { width: 320, height: 300 },
  { width: 360, height: 380 },
  { width: 600, height: 700 },
] as const

/** How long a state may take to show its ready text (DX3). */
const READY_TIMEOUT_MS = 10_000

/** Result of one `pnpm qa:browser` call. */
export interface BrowserResult {
  status: number | null
  stdout: string
  stderr: string
}

/** Runs `pnpm qa:browser <args>`; injectable so tests never open a browser. */
export type BrowserRunner = (args: string[]) => Promise<BrowserResult>

const repositoryRoot = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../..',
)

/**
 * Runs the repo's isolated headless `qa:browser` wrapper (`scripts/qa-browser.mjs`).
 *
 * @param args - Wrapper arguments, e.g. `['resize', '320', '300']`.
 * @returns Its exit status and captured output.
 * @example await runQaBrowser(['close'])
 */
const runQaBrowser: BrowserRunner = async (args) =>
  new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [join(repositoryRoot, 'scripts/qa-browser.mjs'), ...args],
      { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', (error) =>
      resolveRun({ status: null, stdout, stderr: stderr + error.message }),
    )
    child.on('close', (status) => resolveRun({ status, stdout, stderr }))
  })

/** One screenshot recorded in `manifest.json`. */
export interface ManifestEntry {
  state: string
  width: number
  height: number
  file: string
  /** The text that was visible when the shot was taken. */
  readyText: string
}

/** A state that never showed its ready text. */
export interface ScreenshotFailure {
  state: string
  readyText: string
}

const SENTINEL = 'FIXTURE_STATE_READY'
const MISSING_BROWSER =
  /executable doesn't exist|install-browser|playwright install|not installed/i

/**
 * One headless browser session that renders fixture states and records a manifest (DX3).
 *
 * Opens the isolated `qa:browser` session once, waits for each state's ready text, then
 * resizes and screenshots at {@link SCREENSHOT_SIZES}. Called by `--screenshots` in both fixtures.
 *
 * @example
 * const session = new ScreenshotSession({ command: 'qa:settings', directory })
 * await session.open(); await session.capture({ state, url, readyText }); await session.finish()
 */
export class ScreenshotSession {
  readonly entries: ManifestEntry[] = []
  readonly failures: ScreenshotFailure[] = []
  private opened = false

  constructor(
    private readonly options: {
      command: string
      directory: string
      run?: BrowserRunner
      timeoutMs?: number
    },
  ) {}

  private get run(): BrowserRunner {
    return this.options.run ?? runQaBrowser
  }

  /**
   * Opens the isolated browser on a blank page.
   *
   * @throws {@link FixtureCliError} `FIXTURE_BROWSER_MISSING` when Chromium is not installed.
   */
  async open(): Promise<void> {
    await mkdir(this.options.directory, { recursive: true })
    const result = await this.run(['open', 'about:blank'])
    const output = `${result.stdout}\n${result.stderr}`
    if (MISSING_BROWSER.test(output))
      throw new FixtureCliError(
        'FIXTURE_BROWSER_MISSING',
        `${this.options.command}: Chromium is not installed (FIXTURE_BROWSER_MISSING). Fix: pnpm exec playwright-cli install-browser chromium`,
      )
    if (result.status !== 0)
      throw new FixtureCliError(
        'FIXTURE_BROWSER_FAILED',
        `${this.options.command}: the headless browser did not open (FIXTURE_BROWSER_FAILED): ${output.trim().slice(0, 300)}`,
      )
    this.opened = true
  }

  /**
   * Loads a state, waits for its ready text and screenshots it at every size.
   *
   * A timeout is recorded in {@link ScreenshotSession.failures}; shots already taken are kept.
   *
   * @param target - State name, URL and the text that proves the state rendered.
   */
  async capture(target: {
    state: string
    url: string
    readyText: string
  }): Promise<void> {
    const timeout = this.options.timeoutMs ?? READY_TIMEOUT_MS
    const code = `async page => { await page.goto(${JSON.stringify(target.url)}); await page.getByText(${JSON.stringify(target.readyText)}).first().waitFor({ state: 'visible', timeout: ${timeout} }); return ${JSON.stringify(SENTINEL)} }`
    const ready = await this.run(['run-code', code])
    const readyOutput = `${ready.stdout}\n${ready.stderr}`
    if (
      ready.status !== 0 ||
      !readyOutput.includes(SENTINEL) ||
      /### Error/.test(readyOutput)
    ) {
      this.failures.push({ state: target.state, readyText: target.readyText })
      return
    }
    for (const { width, height } of SCREENSHOT_SIZES) {
      const file = `${target.state}-${width}x${height}.png`
      await this.run(['resize', String(width), String(height)])
      // A smaller viewport re-flows the page; bring the proven text back into view before the shot.
      await this.run([
        'run-code',
        `async page => { await page.getByText(${JSON.stringify(target.readyText)}).first().scrollIntoViewIfNeeded(); }`,
      ])
      const shot = await this.run([
        'screenshot',
        `--filename=${join(this.options.directory, file)}`,
      ])
      if (shot.status !== 0) {
        this.failures.push({ state: target.state, readyText: target.readyText })
        return
      }
      this.entries.push({
        state: target.state,
        width,
        height,
        file,
        readyText: target.readyText,
      })
    }
  }

  /**
   * Closes the browser, writes `manifest.json` and reports timeouts.
   *
   * @throws {@link FixtureCliError} `FIXTURE_STATE_TIMEOUT` listing failed states (shots are kept).
   */
  async finish(): Promise<void> {
    if (this.opened) await this.run(['close'])
    await writeFile(
      join(this.options.directory, 'manifest.json'),
      `${JSON.stringify({ screenshots: this.entries }, null, 2)}\n`,
    )
    if (this.failures.length > 0) {
      const states = this.failures
        .map((failure) => `"${failure.state}" (needs "${failure.readyText}")`)
        .join(', ')
      throw new FixtureCliError(
        'FIXTURE_STATE_TIMEOUT',
        `${this.options.command}: ${this.failures.length} state(s) did not show their ready text within ${(this.options.timeoutMs ?? READY_TIMEOUT_MS) / 1000} s (FIXTURE_STATE_TIMEOUT): ${states}. ${this.entries.length} screenshot(s) kept in ${this.options.directory}.`,
      )
    }
  }
}

/**
 * Prints a {@link FixtureCliError} (or any error) on stderr and exits with its status.
 *
 * @param error - Whatever the entry point caught.
 * @returns Never; ends the process.
 * @example main().catch(exitWithFixtureError)
 */
export function exitWithFixtureError(error: unknown): never {
  if (error instanceof FixtureCliError) {
    process.stderr.write(`${error.message}\n`)
    process.exit(error.exitCode)
  }
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exit(1)
}
