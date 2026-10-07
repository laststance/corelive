#!/usr/bin/env node
/** Builds shared assets for both app workspaces before dev/build/package commands.
 * Outputs are cached by source hashes; a checkout-local lock serializes concurrent app builds.
 * @example node scripts/build-assets.mjs
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  rename,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { acquireAssetLock } from './asset-lock.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stateDirectory = path.join(root, '.gstack')
const lock = path.join(stateDirectory, 'assets.lock')
const receipt = path.join(stateDirectory, 'assets.json')
const outputs = [
  'apps/desktop/build/icons',
  'apps/desktop/public',
  'apps/web/public',
]

/** Lists deterministic file hashes so cached outputs cannot hide deleted or stale resources.
 * Called by {@link buildAssets} for source and generated-output checks.
 * @example await hashFiles(['assets/icons'])
 */
async function hashFiles(directories) {
  const hashes = {}
  async function visit(directory) {
    // Missing generated directories invalidate the cache and must be rebuilt.
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    )
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(filename)
      else
        hashes[path.relative(root, filename)] = createHash('sha256')
          .update(await readFile(filename))
          .digest('hex')
    }
  }
  for (const directory of directories) await visit(path.join(root, directory))
  return hashes
}

/** Serializes asset generation while allowing interrupted builds to recover a stale lock.
 * Both app prebuild hooks call this script, so their writes must not overlap.
 * @example await buildAssets()
 */
async function buildAssets() {
  await mkdir(stateDirectory, { recursive: true })
  const release = await acquireAssetLock(lock)
  try {
    const inputs = await hashFiles(['assets'])
    inputs.generator = createHash('sha256')
      .update(await readFile(path.join(root, 'scripts/generate-icons.js')))
      .digest('hex')
    inputs.orchestrator = createHash('sha256')
      .update(await readFile(fileURLToPath(import.meta.url)))
      .digest('hex')
    inputs.lock = createHash('sha256')
      .update(await readFile(new URL('./asset-lock.mjs', import.meta.url)))
      .digest('hex')
    inputs.platform = process.platform
    const previous = JSON.parse(
      await readFile(receipt, 'utf8').catch(() => 'null'),
    )
    if (
      previous &&
      JSON.stringify(previous.inputs) === JSON.stringify(inputs) &&
      JSON.stringify(previous.outputs) ===
        JSON.stringify(await hashFiles(outputs))
    )
      return
    const result = spawnSync(process.execPath, ['scripts/generate-icons.js'], {
      cwd: root,
      stdio: 'inherit',
      timeout: 120_000,
    })
    if (result.error || result.status !== 0)
      throw (
        result.error ?? new Error(`Icon generation failed: ${result.status}`)
      )
    for (const target of ['apps/web/public', 'apps/desktop/public']) {
      await mkdir(path.join(root, target), { recursive: true })
      await cp(
        path.join(root, 'assets/sounds'),
        path.join(root, target, 'sounds'),
        { recursive: true },
      )
    }
    await cp(
      path.join(root, 'apps/web/public/favicon.ico'),
      path.join(root, 'apps/desktop/public/favicon.ico'),
    )
    const required = [
      ...[16, 24, 32, 48, 64, 128, 256, 512, 1024].map(
        (size) => `apps/desktop/build/icons/icon-${size}x${size}.png`,
      ),
      ...[512, 1024].map(
        (size) => `apps/desktop/build/icons/app-icon-${size}x${size}.png`,
      ),
      ...[16, 32, 48, 64, 128, 192, 512].map(
        (size) => `apps/web/public/favicon-${size}x${size}.png`,
      ),
      'apps/web/public/favicon.ico',
      'apps/desktop/public/favicon.ico',
      'apps/desktop/build/icons/icon-manifest.json',
      ...[16, 20, 24, 32].flatMap((size) =>
        ['', '-active', '-notification', '-disabled'].map(
          (state) =>
            `apps/desktop/build/icons/tray/tray-${size}x${size}${state}.png`,
        ),
      ),
      ...[
        'trayTemplate.png',
        'trayTemplate@2x.png',
        'checkTemplate.png',
        'checkTemplate@2x.png',
      ].map((name) => `apps/desktop/build/icons/tray/${name}`),
      ...(process.platform === 'darwin'
        ? ['apps/desktop/build/icons/icon.icns']
        : []),
      ...Object.keys(inputs)
        .filter((name) => name.startsWith('assets/sounds/'))
        .flatMap((name) =>
          ['apps/web/public/', 'apps/desktop/public/'].map(
            (target) => target + name.slice('assets/'.length),
          ),
        ),
    ]
    for (const file of required) {
      // Never cache a partial output set, even if a child exits successfully.
      const info = await stat(path.join(root, file))
      if (!info.isFile() || info.size === 0)
        throw new Error(`Missing generated asset: ${file}`)
    }
    const temporary = `${receipt}.${process.pid}.tmp`
    await writeFile(
      temporary,
      JSON.stringify({ inputs, outputs: await hashFiles(outputs) }),
    )
    await rename(temporary, receipt)
  } finally {
    await release()
  }
}

await buildAssets()
