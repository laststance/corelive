#!/usr/bin/env node
/** Resolves the desktop's installed builder independently of hoisted node_modules layout.
 * Root/app package commands invoke it with their original builder flags.
 * @example node ../../scripts/electron-builder.mjs --dir
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../apps/desktop',
)
const require = createRequire(path.join(desktop, 'package.json'))
const cli = path.join(
  path.dirname(require.resolve('electron-builder/package.json')),
  'cli.js',
)
// Builder's app-local probe cannot see a hoisted Electron; use the installed version.
const electronVersion = require('electron/package.json').version
const result = spawnSync(
  process.execPath,
  [
    '--env-file-if-exists=.env',
    cli,
    `--config.electronVersion=${electronVersion}`,
    ...process.argv.slice(2),
  ],
  { cwd: desktop, stdio: 'inherit' },
)
if (result.error) throw result.error
process.exitCode = result.status ?? 1
