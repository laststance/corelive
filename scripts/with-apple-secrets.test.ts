// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

let root: string
let env: NodeJS.ProcessEnv
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'op-launcher-'))
  mkdirSync(path.join(root, 'scripts'))
  mkdirSync(path.join(root, 'bin'))
  copyFileSync(
    'scripts/with-apple-secrets.mjs',
    path.join(root, 'scripts/with-apple-secrets.mjs'),
  )
  writeFileSync(
    path.join(root, '.env.apple.1password'),
    'APPLE_APP_SPECIFIC_PASSWORD="op://Fixture/Build/APPLE_APP_SPECIFIC_PASSWORD"\n',
  )
  writeFileSync(
    path.join(root, 'probe.cjs'),
    "process.stdout.write('direct\\n')",
  )
  // The fake CLI observes reference routing without accessing a real vault.
  writeFileSync(
    path.join(root, 'bin/op'),
    `#!${process.execPath}
if (process.env.OP_TEST_FAIL) process.exit(23)
process.stdout.write(JSON.stringify({ args: process.argv.slice(2), value: process.env.APPLE_APP_SPECIFIC_PASSWORD }))
`,
    { mode: 0o700 },
  )
  env = { PATH: path.join(root, 'bin') + ':' + process.env.PATH }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

test('local commands resolve credentials through op without putting values in arguments', () => {
  // Arrange
  const args = ['scripts/with-apple-secrets.mjs', process.execPath, 'probe.cjs']
  // Act
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  // Assert
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({
    args: ['run', '--', process.execPath, 'probe.cjs'],
    value: 'op://Fixture/Build/APPLE_APP_SPECIFIC_PASSWORD',
  })
})

test('explicit environment values including empty tokens are not replaced by vault defaults', () => {
  // Arrange
  const provided = { APPLE_APP_SPECIFIC_PASSWORD: '' }
  // Act
  const result = spawnSync(
    process.execPath,
    ['scripts/with-apple-secrets.mjs', process.execPath, 'probe.cjs'],
    { cwd: root, env: { ...env, ...provided }, encoding: 'utf8' },
  )
  // Assert
  expect(result.status).toBe(0)
  expect(result.stdout).toBe('direct\n')
})

test.each([{ CI: 'true' }, { VERCEL: '1' }])(
  'hosted builds use injected secrets without a local reference file: %j',
  (hosted) => {
    // Arrange
    rmSync(path.join(root, '.env.apple.1password'))
    // Act
    const result = spawnSync(
      process.execPath,
      ['scripts/with-apple-secrets.mjs', process.execPath, 'probe.cjs'],
      { cwd: root, env: { ...env, ...hosted }, encoding: 'utf8' },
    )
    // Assert
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('direct\n')
  },
)

test('missing local references stop the command before it can fall back to unrelated credentials', () => {
  // Arrange
  rmSync(path.join(root, '.env.apple.1password'))
  // Act
  const result = spawnSync(
    process.execPath,
    ['scripts/with-apple-secrets.mjs', process.execPath, 'probe.cjs'],
    { cwd: root, env, encoding: 'utf8' },
  )
  // Assert
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr).toContain(
    'Configure .env.apple.1password with op:// references',
  )
})

test('a vault failure stops the command and preserves the failure status', () => {
  // Arrange
  env.OP_TEST_FAIL = '1'
  // Act
  const result = spawnSync(
    process.execPath,
    ['scripts/with-apple-secrets.mjs', process.execPath, 'probe.cjs'],
    { cwd: root, env, encoding: 'utf8' },
  )
  // Assert
  expect(result.status).toBe(23)
  expect(result.stdout).toBe('')
})
