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
const signingKeys = new Set([
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_KEYCHAIN_PROFILE',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'GH_TOKEN',
])

/**
 * Keep each dotenv assignment together when setup creates the workspace files.
 * Retains original quoting, comments, and CRLF inside multiline values.
 * @throws When a quoted value is unfinished and cannot be routed safely.
 * @example splitWorkspaceSettings('APPLE_ID=fixture\nPORT=3000\n')
 */
function splitWorkspaceSettings(sourceText) {
  // Match whole dotenv assignments so assignment-like lines inside a quoted value stay together.
  const assignment =
    /^[\t \uFEFF]*(?:export[ \t]+)?([\w.-]+)[ \t]*(?:=[ \t]*|:[ \t]+)(?:'(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`|([^\r\n]*))[ \t]*(?:#[^\r\n]*)?(?:\r?\n|$)/gm
  const signing = []
  const dashboard = sourceText.replace(assignment, (entry, key, unquoted) => {
    // An unmatched delimiter makes the destination of continuation lines ambiguous.
    if (/^["'`]/.test(unquoted?.trimStart() ?? '')) {
      throw new Error('Unterminated quoted value in root .env')
    }
    if (!signingKeys.has(key)) return entry
    signing.push(entry)
    return ''
  })
  return { dashboard, signing: signing.join('') }
}

const { dashboard, signing } = splitWorkspaceSettings(contents ?? '')
if (contents !== null)
  try {
    // Dashboard receives only its configuration; signing credentials stay in the desktop workspace.
    await writeFile(path.join(root, 'apps/web/.env'), dashboard, {
      flag: 'wx',
      mode: 0o600,
    })
  } catch (error) {
    // Existing app settings belong to the developer and must not be overwritten.
    if (error.code !== 'EEXIST') throw error
  }
if (signing.length > 0) {
  try {
    await writeFile(path.join(root, 'apps/desktop/.env'), signing, {
      flag: 'wx',
      mode: 0o600,
    })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}
