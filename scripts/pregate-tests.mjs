#!/usr/bin/env node
/** Runs pregate's selected files with their owning workspace's Vitest configuration.
 * The gstack runner calls this so app aliases, DOM environments and Electron mocks
 * stay identical to the normal test commands. Paths outside known test roots fail closed.
 * @example node scripts/pregate-tests.mjs apps/desktop/electron/offline/TokenBroker.test.ts
 */
import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const owners = [
  {
    prefix: 'apps/desktop/',
    directory: 'apps/desktop',
    config: 'vitest.config.electron.ts',
  },
  { prefix: 'apps/web/', directory: 'apps/web', config: 'vitest.config.ts' },
  {
    prefix: 'packages/eslint-plugin-dslint/',
    directory: 'packages/eslint-plugin-dslint',
    config: 'vitest.config.ts',
  },
  {
    prefix: 'packages/desktop-contract/',
    directory: 'packages/desktop-contract',
    config: null,
  },
  {
    prefix: 'packages/live-editor/',
    directory: 'packages/live-editor',
    config: null,
  },
  { prefix: 'scripts/', directory: '.', config: 'vitest.config.tools.ts' },
]
const selected = process.argv.slice(2)
if (selected.length === 0) throw new Error('No test files selected')
const groups = new Map()

// Never let a loose root-level selector discover an archived checkout or the wrong app environment.
for (const file of selected) {
  const owner = owners.find((candidate) => file.startsWith(candidate.prefix))
  if (
    !owner ||
    file.split('/').includes('..') ||
    !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
  )
    throw new Error(`Unrecognized test file: ${file}`)
  if (!statSync(path.join(root, file)).isFile())
    throw new Error(`Missing test file: ${file}`)
  const group = groups.get(owner) ?? []
  group.push(
    path.relative(path.join(root, owner.directory), path.join(root, file)),
  )
  groups.set(owner, group)
}

// Each app keeps its declared configuration; every selected file must finish successfully.
for (const [owner, files] of groups) {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      ...(owner.config ? ['--config', owner.config] : []),
      ...files,
    ],
    {
      cwd: path.join(root, owner.directory),
      stdio: 'inherit',
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
