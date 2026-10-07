#!/usr/bin/env node
/** Copies existing ignored local configuration to app workspaces without exposing secrets.
 * Run during a checkout's migration or setup; existing app files are preserved.
 * @example pnpm setup:env
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, '.env')
await mkdir(path.join(root, 'apps/web'), { recursive: true })
const contents = await readFile(source, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return null
  throw error
})
const signingKey =
  /^(?:export\s+)?(?:APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID|APPLE_KEYCHAIN_PROFILE|GH_TOKEN)\s*=/
const lines = (contents ?? '').split('\n')
const signing = lines.filter((line) => signingKey.test(line.trimStart()))
if (contents !== null)
  try {
    // Web receives only its configuration; signing credentials stay in the desktop workspace.
    await writeFile(
      path.join(root, 'apps/web/.env'),
      lines.filter((line) => !signingKey.test(line.trimStart())).join('\n'),
      { flag: 'wx', mode: 0o600 },
    )
  } catch (error) {
    // Existing app settings belong to the developer and must not be overwritten.
    if (error.code !== 'EEXIST') throw error
  }
if (signing.length > 0) {
  try {
    await writeFile(
      path.join(root, 'apps/desktop/.env'),
      `${signing.join('\n')}\n`,
      { flag: 'wx', mode: 0o600 },
    )
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}
