// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, expect, test } from 'vitest'

let fixtureRoot: string

beforeAll(() => {
  fixtureRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'corelive-qa-browser-')),
  )
  mkdirSync(path.join(fixtureRoot, 'scripts'))
  const cliDirectory = path.join(fixtureRoot, 'node_modules/@playwright/cli')
  mkdirSync(cliDirectory, { recursive: true })
  copyFileSync(
    path.resolve('scripts/qa-browser.mjs'),
    path.join(fixtureRoot, 'scripts/qa-browser.mjs'),
  )
  writeFileSync(
    path.join(cliDirectory, 'package.json'),
    '{"name":"@playwright/cli"}',
  )
  // Capture the subprocess boundary without loading Playwright or opening a browser.
  writeFileSync(
    path.join(cliDirectory, 'playwright-cli.js'),
    `process.stdout.write(JSON.stringify({
      args: process.argv.slice(2),
      overrides: Object.keys(process.env).filter(key => /PWDEBUG|PLAYWRIGHT_MCP_|PLAYWRIGHT_CLI_SESSION|SELENIUM_REMOTE_URL/i.test(key))
    }))`,
  )
})

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }))

/**
 * Runs the real wrapper against an inert CLI so isolation regressions cannot touch the desktop.
 * Called by the argument and environment tests below.
 * @example runQaBrowser(['--json', 'show'])
 */
function runQaBrowser(
  args: string[],
  environment: Record<string, string> = {},
) {
  return spawnSync(
    process.execPath,
    [path.join(fixtureRoot, 'scripts/qa-browser.mjs'), ...args],
    {
      cwd: fixtureRoot,
      env: { ...process.env, ...environment },
      encoding: 'utf8',
      timeout: 5000,
    },
  )
}

test.each([
  ['--json', 'show'],
  ['--json', 'attach', 'chrome'],
  ['--json', 'kill-all'],
  ['--json', 'close-all'],
  ['show'],
  ['tray'],
  ['open', '--headed'],
  ['open', '--config=owner.json'],
  ['open', '--extension'],
  ['close', '--session=owner'],
  ['close', '-sowner'],
  ['--version', '--no-version', 'show'],
  ['--help', '--no-help', 'close-all'],
  ['-h', 'show'],
  ['close', '--s=owner'],
  ['close', '--no-s'],
  ['close', '--no-session'],
])(
  'refuses desktop or foreign-session control before invoking the CLI: %j',
  (...args) => {
    // Arrange + Act
    const result = runQaBrowser(args)

    // Assert
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('one isolated headless session')
  },
)

test('opens the public editor with the owned session and configuration', () => {
  // Arrange + Act
  const result = runQaBrowser([])
  const output: { args: string[] } = JSON.parse(result.stdout)

  // Assert
  expect(result.status).toBe(0)
  expect(output.args[0]).toMatch(/^-s=corelive-headless-[a-f0-9]{10}$/)
  expect(output.args.slice(1)).toEqual([
    'open',
    'http://localhost:4991/write',
    `--config=${path.join(fixtureRoot, '.playwright/cli.config.json')}`,
    '--idle-timeout=300000',
  ])
})

test('removes inherited inspector and remote-browser overrides before spawning the CLI', () => {
  // Arrange
  const environment = {
    PWDEBUG: '1',
    npm_config_pwdebug: '1',
    npm_package_config_pwdebug: '1',
    PLAYWRIGHT_MCP_CDP_ENDPOINT: 'http://127.0.0.1:9222',
    PLAYWRIGHT_CLI_SESSION: 'owner',
    SELENIUM_REMOTE_URL: 'http://127.0.0.1:4444',
  }

  // Act
  const result = runQaBrowser(['snapshot', '--json'], environment)
  const output: { overrides: string[] } = JSON.parse(result.stdout)

  // Assert
  expect(result.status).toBe(0)
  expect(output.overrides).toEqual([])
})
