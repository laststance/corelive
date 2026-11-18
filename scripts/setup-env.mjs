#!/usr/bin/env node
/** Copies existing ignored local configuration to app workspaces without exposing secrets.
 * Run during a checkout's migration or setup; existing app files are preserved.
 * @example pnpm setup:env
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseEnv } from 'node:util'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, '.env')
const dashboardFile = path.join(root, 'apps/web/.env')
const desktopFile = path.join(root, 'apps/desktop/.env')
const dashboardExists = existsSync(dashboardFile)
const desktopExists = existsSync(desktopFile)
if (dashboardExists && desktopExists) process.exit(0)

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
 * @throws When a quoted value is unfinished or Node cannot read the split consistently.
 * @example splitWorkspaceSettings('APPLE_ID=fixture\nPORT=3000\n')
 */
function splitWorkspaceSettings(sourceText) {
  // The root .env follows Node's --env-file format: the first matching quote ends a value,
  // even after a backslash. Only LF starts a new physical line, including after CRLF.
  const record =
    /(?:^|(?<=\n))[\t \uFEFF]*(?:#[^\n]*|(?:export[ \t]+)?([\w.-]+)[ \t]*(?:=[ \t]*|:[ \t]+)(?:(["'`]).*?\2[^\n]*|([^\n]*)))(?:\n|(?![\s\S]))/gs
  const signing = []
  const dashboard = sourceText.replace(
    record,
    (entry, key, _quote, unquoted) => {
      // Next can treat these characters inside a Node comment as assignment boundaries.
      if (key === undefined) return entry.replace(/[\u2028\u2029]/g, ' ')
      // An unmatched delimiter makes the destination of continuation lines ambiguous.
      if (/^["'`]/.test(unquoted?.trimStart() ?? '')) {
        throw new Error('Unterminated quoted value in root .env')
      }
      if (!signingKeys.has(key)) return entry
      signing.push(entry)
      return ''
    },
  )
  const desktop = signing.join('')
  const settings = Object.entries(parseEnv(sourceText))
  for (const [output, signingOnly] of [
    [dashboard, false],
    [desktop, true],
  ]) {
    const expected = Object.fromEntries(
      settings.filter(([key]) => signingKeys.has(key) === signingOnly),
    )
    if (!isDeepStrictEqual({ ...parseEnv(output) }, expected)) {
      throw new Error(
        'Unable to split the root .env safely. Move Dashboard settings to apps/web/.env and signing settings to apps/desktop/.env manually.',
      )
    }
  }
  return { dashboard, signing: desktop }
}

/** Rejects Dashboard text when Node and the installed Next loader disagree on its syntax.
 * Called before creating either app file. The check ignores intentional variable expansion.
 * @throws If the Dashboard dependencies are unavailable or the loaders disagree.
 * @example assertDashboardFormat('PORT=3000\n')
 */
function assertDashboardFormat(contents) {
  const require = createRequire(path.join(root, 'apps/web/package.json'))
  let processEnv
  try {
    const nextRequire = createRequire(require.resolve('next/package.json'))
    processEnv = nextRequire('@next/env').processEnv
  } catch {
    throw new Error(
      'Run pnpm install --frozen-lockfile before creating apps/web/.env with pnpm setup:env.',
    )
  }

  // Use an inert marker outside Next's key grammar to compare literal syntax only.
  let marker = '\uE000'
  while (contents.includes(marker)) marker += '\uE000'
  const literal = contents.replaceAll('$', marker)
  const originalEnv = process.env
  let loaderFailed = false
  let matches = false
  try {
    // Next otherwise lets the current shell's variables mask differences in the file.
    process.env = {}
    const [, parsed] = processEnv(
      [{ path: '.env', contents: literal, env: {} }],
      undefined,
      {
        info: () => undefined,
        error: () => {
          loaderFailed = true
        },
      },
      true,
    )
    matches =
      !loaderFailed && isDeepStrictEqual(parsed, { ...parseEnv(literal) })
  } catch {
    // The loader may include dotenv input in errors. Report only the migration steps.
    matches = false
  } finally {
    process.env = originalEnv
  }
  if (!matches) {
    throw new Error(
      'Node and Next.js read the Dashboard settings differently. In the root .env, use compatible syntax such as an unquoted path ending in a backslash when it contains no spaces or #. You can also move Dashboard settings to apps/web/.env and signing settings to apps/desktop/.env manually.',
    )
  }
}

const { dashboard, signing } = splitWorkspaceSettings(contents ?? '')
if (contents !== null && !dashboardExists) {
  assertDashboardFormat(dashboard)
  await mkdir(path.dirname(dashboardFile), { recursive: true })
  try {
    // Dashboard receives only its configuration; signing credentials stay in the desktop workspace.
    await writeFile(dashboardFile, dashboard, {
      flag: 'wx',
      mode: 0o600,
    })
  } catch (error) {
    // Existing app settings belong to the developer and must not be overwritten.
    if (error.code !== 'EEXIST') throw error
  }
}
if (!desktopExists && signing.length > 0) {
  try {
    await writeFile(desktopFile, signing, {
      flag: 'wx',
      mode: 0o600,
    })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}
