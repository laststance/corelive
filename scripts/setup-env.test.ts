import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseEnv } from 'node:util'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

let root: string
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'corelive-env-'))
  mkdirSync(path.join(root, 'scripts'))
  mkdirSync(path.join(root, 'apps/desktop'), { recursive: true })
  copyFileSync(
    'scripts/setup-env.mjs',
    path.join(root, 'scripts/setup-env.mjs'),
  )
  symlinkSync(
    path.resolve('node_modules'),
    path.join(root, 'node_modules'),
    'junction',
  )
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** Reads the generated file the same way the Dashboard does, in a separate process.
 * @example expect(readDashboardSettings()).toEqual({ PORT: '3000' })
 */
function readDashboardSettings(env: NodeJS.ProcessEnv = {}): unknown {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=commonjs',
      '--eval',
      `
        const { loadEnvConfig } = require('@next/env')
        const inheritedKeys = process.argv.slice(2)
        const { combinedEnv, parsedEnv } = loadEnvConfig(process.argv[1], true)
        const keys = Object.keys(parsedEnv).concat(inheritedKeys)
        process.stdout.write(JSON.stringify(Object.fromEntries(keys.map(key => [key, combinedEnv[key]]))))
      `,
      path.join(root, 'apps/web'),
      ...Object.keys(env),
    ],
    { cwd: root, encoding: 'utf8', env },
  )
  expect(result.status).toBe(0)
  return JSON.parse(result.stdout)
}

describe('workspace environment setup', () => {
  test('separates signing settings and preserves a UTF-8 BOM in the original file only', () => {
    // Arrange
    const contents =
      '\uFEFFCLERK_SECRET_KEY=fixture-server-key\nAPPLE_ID=fixture-apple\nWIN_CSC_LINK=fixture-cert\nWIN_CSC_KEY_PASSWORD=fixture-signing-password\nexport GH_TOKEN = fixture-token\n'
    writeFileSync(path.join(root, '.env'), contents)
    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
      encoding: 'utf8',
    })
    // Assert
    expect(result.status).toBe(0)
    expect(readFileSync(path.join(root, 'apps/web/.env'), 'utf8')).toBe(
      'CLERK_SECRET_KEY=fixture-server-key\n',
    )
    expect(readFileSync(path.join(root, 'apps/desktop/.env'), 'utf8')).toBe(
      'APPLE_ID=fixture-apple\nWIN_CSC_LINK=fixture-cert\nWIN_CSC_KEY_PASSWORD=fixture-signing-password\nexport GH_TOKEN = fixture-token\n',
    )
    expect(statSync(path.join(root, 'apps/web/.env')).mode & 0o777).toBe(0o600)
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe(contents)
    expect(result.stdout + result.stderr).toBe('')
  })
  test('preserves both existing app files even when the unused root file is malformed', () => {
    // Arrange
    mkdirSync(path.join(root, 'apps/web'))
    writeFileSync(
      path.join(root, '.env'),
      'CLERK_SECRET_KEY=fixture-new\nAPPLE_ID="fixture-new\n',
    )
    writeFileSync(path.join(root, 'apps/web/.env'), 'WEB_EXISTING=fixture\n')
    writeFileSync(
      path.join(root, 'apps/desktop/.env'),
      'DESKTOP_EXISTING=fixture\n',
    )
    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
    })
    // Assert
    expect(result.status).toBe(0)
    expect(readFileSync(path.join(root, 'apps/web/.env'), 'utf8')).toBe(
      'WEB_EXISTING=fixture\n',
    )
    expect(readFileSync(path.join(root, 'apps/desktop/.env'), 'utf8')).toBe(
      'DESKTOP_EXISTING=fixture\n',
    )
  })
  test('copies missing Desktop settings when an existing Dashboard file needs no migration', () => {
    // Arrange
    mkdirSync(path.join(root, 'apps/web'))
    writeFileSync(path.join(root, 'apps/web/.env'), 'WEB_EXISTING=fixture\n')
    writeFileSync(
      path.join(root, '.env'),
      'DASHBOARD_PATH="fixture-path\\"\nDASHBOARD_MESSAGE="\nfixture message"\nAPPLE_ID=fixture-apple\n',
    )

    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
      encoding: 'utf8',
    })

    // Assert
    expect(result.status).toBe(0)
    expect(readDashboardSettings()).toEqual({ WEB_EXISTING: 'fixture' })
    expect(
      parseEnv(readFileSync(path.join(root, 'apps/desktop/.env'), 'utf8')),
    ).toEqual({
      APPLE_ID: 'fixture-apple',
    })
  })
  test('routes complete quoted values to their workspace across line breaks', () => {
    // Arrange
    writeFileSync(
      path.join(root, '.env'),
      [
        '# Local settings',
        'export WIN_CSC_LINK = "fixture certificate',
        'SECOND_LINE=still part of the certificate',
        'certificate end" # signing',
        "DASHBOARD_MESSAGE='first line",
        'GH_TOKEN=part of the message',
        "last line'",
        'WIN_CSC_KEY_PASSWORD=fixture-password',
        '',
      ].join('\r\n'),
    )

    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
      encoding: 'utf8',
    })

    // Assert
    expect(result.status).toBe(0)
    expect(readFileSync(path.join(root, 'apps/desktop/.env'), 'utf8')).toBe(
      'export WIN_CSC_LINK = "fixture certificate\r\nSECOND_LINE=still part of the certificate\r\ncertificate end" # signing\r\nWIN_CSC_KEY_PASSWORD=fixture-password\r\n',
    )
    expect(readFileSync(path.join(root, 'apps/web/.env'), 'utf8')).toBe(
      "# Local settings\r\nDASHBOARD_MESSAGE='first line\r\nGH_TOKEN=part of the message\r\nlast line'\r\n",
    )
    expect(readDashboardSettings()).toEqual({
      DASHBOARD_MESSAGE: 'first line\nGH_TOKEN=part of the message\nlast line',
    })
    expect(result.stdout + result.stderr).toBe('')
  })
  test('does not create misleading empty app configuration when the root env is absent', () => {
    // Arrange: the isolated checkout has no root .env.
    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
    })
    // Assert
    expect(result.status).toBe(0)
    expect(existsSync(path.join(root, 'apps/web/.env'))).toBe(false)
    expect(existsSync(path.join(root, 'apps/desktop/.env'))).toBe(false)
  })
  test('a trailing backslash keeps the next multiline setting in its own workspace', () => {
    // Arrange
    const contents = [
      'WIN_CSC_KEY_PASSWORD="fixture-password\\"',
      'DASHBOARD_MESSAGE="',
      'fixture message"',
      'DASHBOARD_PATH="fixture-path\\"',
      'WIN_CSC_LINK="',
      'fixture certificate"',
      '',
    ].join('\n')
    writeFileSync(path.join(root, '.env'), contents)

    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
    })

    // Assert
    expect(result.status).toBe(0)
    expect(
      parseEnv(readFileSync(path.join(root, 'apps/desktop/.env'), 'utf8')),
    ).toEqual({
      WIN_CSC_KEY_PASSWORD: 'fixture-password\\',
      WIN_CSC_LINK: '\nfixture certificate',
    })
    expect(
      parseEnv(readFileSync(path.join(root, 'apps/web/.env'), 'utf8')),
    ).toEqual({
      DASHBOARD_MESSAGE: '\nfixture message',
      DASHBOARD_PATH: 'fixture-path\\',
    })
    expect(readDashboardSettings()).toEqual({
      DASHBOARD_MESSAGE: '\nfixture message',
      DASHBOARD_PATH: 'fixture-path\\',
    })
  })
  test.each([
    { lineEnding: 'LF', newline: '\n' },
    { lineEnding: 'CRLF', newline: '\r\n' },
  ])(
    'routes signing entries after Unicode separators in $lineEnding comments',
    ({ newline }) => {
      // Arrange
      const contents = [
        '# Example\u2028EXAMPLE="',
        'WIN_CSC_KEY_PASSWORD="fixture-windows-secret"',
        '# Another example\u2029EXAMPLE="',
        'APPLE_APP_SPECIFIC_PASSWORD="fixture-apple-secret"',
        'DASHBOARD_PORT=3400',
        '',
      ].join(newline)
      writeFileSync(path.join(root, '.env'), contents)

      // Act
      const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
        cwd: root,
        encoding: 'utf8',
      })

      // Assert
      expect(result.status).toBe(0)
      expect(parseEnv(contents)).toEqual({
        WIN_CSC_KEY_PASSWORD: 'fixture-windows-secret',
        APPLE_APP_SPECIFIC_PASSWORD: 'fixture-apple-secret',
        DASHBOARD_PORT: '3400',
      })
      expect(
        parseEnv(readFileSync(path.join(root, 'apps/desktop/.env'), 'utf8')),
      ).toEqual({
        WIN_CSC_KEY_PASSWORD: 'fixture-windows-secret',
        APPLE_APP_SPECIFIC_PASSWORD: 'fixture-apple-secret',
      })
      expect(readDashboardSettings()).toEqual({ DASHBOARD_PORT: '3400' })
      expect(
        readFileSync(path.join(root, 'apps/web/.env'), 'utf8'),
      ).not.toContain('fixture-windows-secret')
      expect(
        readFileSync(path.join(root, 'apps/web/.env'), 'utf8'),
      ).not.toContain('fixture-apple-secret')
      expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe(contents)
    },
  )
  test('refuses adjacent Dashboard values that the Next loader would silently merge', () => {
    // Arrange
    const contents = [
      'DASHBOARD_PATH="fixture-path\\"',
      'WIN_CSC_KEY_PASSWORD=fixture-private',
      'DASHBOARD_MESSAGE="',
      'fixture message"',
      '',
    ].join('\n')
    writeFileSync(path.join(root, '.env'), contents)

    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
      encoding: 'utf8',
    })

    // Assert
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Node and Next.js read the Dashboard settings differently',
    )
    expect(result.stderr).toContain('apps/web/.env')
    expect(result.stderr).toContain('apps/desktop/.env')
    expect(result.stdout + result.stderr).not.toContain('fixture-')
    expect(existsSync(path.join(root, 'apps/web/.env'))).toBe(false)
    expect(existsSync(path.join(root, 'apps/desktop/.env'))).toBe(false)
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe(contents)
  })
  test('preserves compatible trailing backslashes, Next expansion, and process environment priority', () => {
    // Arrange
    const contents = [
      "DASHBOARD_PATH='fixture-path\\'",
      'DASHBOARD_MESSAGE="',
      'fixture message"',
      'DASHBOARD_ALIAS=$DASHBOARD_PATH',
      'DASHBOARD_BRACED=${DASHBOARD_PATH}',
      'DASHBOARD_PORT=3400',
      '',
    ].join('\n')
    writeFileSync(path.join(root, '.env'), contents)

    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
      encoding: 'utf8',
    })

    // Assert
    expect(result.status).toBe(0)
    expect(readFileSync(path.join(root, 'apps/web/.env'), 'utf8')).toBe(
      contents,
    )
    expect(readDashboardSettings({ DASHBOARD_PORT: '3999' })).toEqual({
      DASHBOARD_PATH: 'fixture-path\\',
      DASHBOARD_MESSAGE: '\nfixture message',
      DASHBOARD_ALIAS: 'fixture-path\\',
      DASHBOARD_BRACED: 'fixture-path\\',
      DASHBOARD_PORT: '3999',
    })
  })
  test('keeps both app files uncreated when a quoted signing value is unfinished', () => {
    // Arrange
    writeFileSync(
      path.join(root, '.env'),
      'PORT=3000\nWIN_CSC_LINK="fixture certificate\ncertificate tail\n',
    )

    // Act
    const result = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
      cwd: root,
      encoding: 'utf8',
    })

    // Assert
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unterminated quoted value in root .env')
    expect(result.stderr).not.toContain('fixture certificate')
    expect(existsSync(path.join(root, 'apps/web/.env'))).toBe(false)
    expect(existsSync(path.join(root, 'apps/desktop/.env'))).toBe(false)
  })
})
