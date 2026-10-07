#!/usr/bin/env node
/** Rejects misplaced source/lockfiles and app-to-app imports after main sync or migration.
 * The root validation gate runs this before a layout change can be shipped.
 * @example pnpm check:workspace
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8' },
)
  .trim()
  .split('\n')
const errors = []
for (const file of files) {
  // Deleted tracked paths remain in the index until staging; only existing source counts.
  let source
  try {
    source = readFileSync(path.join(root, file), 'utf8')
  } catch {
    continue
  }
  if (/^(src|electron|drizzle|build|public)\//.test(file))
    errors.push(`Old app path: ${file}`)
  if (file.endsWith('pnpm-lock.yaml') && file !== 'pnpm-lock.yaml')
    errors.push(`Nested lockfile: ${file}`)
  if (
    /\.[cm]?[jt]sx?$/.test(file) &&
    file.startsWith('apps/web/') &&
    /(?:@\/electron\/|(?:\.\.\/)+electron\/)/.test(source)
  )
    errors.push(`Native source reference in Web: ${file}`)
  if (
    file.startsWith('packages/desktop-contract/src/') &&
    /(?:from|import\()\s*['"](?:electron|node:|fs['"]|path['"]|(?:\.\.\/)+apps\/)/.test(
      source,
    )
  )
    errors.push(`Unsafe shared import: ${file}`)
}
if (errors.length) throw new Error(errors.join('\n'))
