// @ts-check
import fs from 'node:fs'
import path from 'node:path'

/**
 * First-party `src/` subtree prefixes a normalized coverage source path must
 * start with to be considered corelive's own code (web renderer side). The
 * electron merge passes `['src/', 'electron/']` instead.
 */
export const WEB_FIRST_PARTY_PREFIXES = ['src/']

/**
 * First-party prefixes for the merged report (Phase 3): the web renderer `src/`
 * plus the Electron main process `electron/`. Both are corelive-authored.
 */
export const MERGED_FIRST_PARTY_PREFIXES = ['src/', 'electron/']

/**
 * Patterns mirroring the Phase 0 vitest `coverage.exclude` set so unit + E2E
 * coverage describe the SAME first-party universe (tests, stories, type-only
 * files, and ambient declarations are never product code). Kept in one place so
 * the merge (Phase 3) and the web-E2E config (Phase 1) cannot drift apart.
 */
const EXCLUDE_PATTERNS = [
  /\.(test|spec)\.(ts|tsx)$/, // unit/integration specs
  /(^|\/)__tests__\//, // __tests__ dirs
  /\.stories\.(ts|tsx)$/, // Storybook stories
  /^src\/types\//, // type-only modules
  /\.d\.ts$/, // ambient declarations
]

/**
 * Normalizes a source path extracted from a Next/webpack source map to a clean
 * repo-relative key (e.g. `src/app/(main)/home/_components/AddTodoForm.tsx`),
 * byte-identical to the keys vitest v8 emits — so monocart merges the unit and
 * E2E entries for one file instead of double-counting them. Exists because
 * bundled sources arrive prefixed (`webpack://_N_E/./…`, or `_N_E/…` after
 * monocart strips the scheme); idempotent on already-clean paths.
 * @param {string} filePath - Raw source path from the V8 / source-map pipeline.
 * @returns {string} Repo-relative path with the webpack/`_N_E` prefix removed.
 * @example
 * normalizeSourcePath('_N_E/src/app/page.tsx')            // => 'src/app/page.tsx'
 * normalizeSourcePath('webpack://_N_E/./src/lib/cn.ts')   // => 'src/lib/cn.ts'
 * normalizeSourcePath('src/proxy.ts')                     // => 'src/proxy.ts'
 */
export function normalizeSourcePath(filePath) {
  return filePath
    .replace(/^webpack:\/\/[^/]*\/\.?\//, '') // `webpack://_N_E/./` or `webpack:///`
    .replace(/^webpack:\/\//, '') // bare `webpack://` residue
    .replace(/^_N_E\//, '') // Next webpack library prefix after scheme strip
    .replace(/^\.\//, '') // leading `./`
    .replace(/^\//, '') // accidental leading slash
}

/**
 * Reduces any coverage source path to a repo-relative key: strips an absolute
 * repo-root prefix first (vitest's istanbul `coverage-final.json` keys are
 * absolute, e.g. `/…/corelive/electron/main.ts`), THEN applies the webpack/`_N_E`
 * normalize — so istanbul `add()` data and source-map-expanded V8 entries land
 * on the same `electron/main.ts` / `src/…` key and merge once.
 * @param {string} filePath - Source path from any coverage input (abs or virtual).
 * @param {string} repoRoot - Absolute repo root to strip when present as a prefix.
 * @returns {string} Repo-relative, normalized key.
 * @example
 * toRepoRelative('/Users/x/corelive/electron/main.ts', '/Users/x/corelive') // 'electron/main.ts'
 * toRepoRelative('_N_E/src/app/page.tsx', '/Users/x/corelive')              // 'src/app/page.tsx'
 */
export function toRepoRelative(filePath, repoRoot) {
  let candidate = filePath
  if (repoRoot && candidate.startsWith(repoRoot)) {
    candidate = candidate.slice(repoRoot.length).replace(/^\//, '')
  }
  return normalizeSourcePath(candidate)
}

/**
 * Builds a monocart `sourcePath` callback that rewrites every input path to the
 * canonical repo-relative key via {@link toRepoRelative}, so unit (absolute) and
 * E2E (`_N_E/…`) coverage for one file collapse to a single merged entry.
 * @param {string} repoRoot - Absolute repo root.
 * @returns {(filePath: string) => string} monocart sourcePath rewriter.
 * @example
 * makeSourcePath('/Users/x/corelive')('_N_E/src/app/page.tsx') // => 'src/app/page.tsx'
 */
export function makeSourcePath(repoRoot) {
  return (filePath) => toRepoRelative(filePath, repoRoot)
}

/**
 * Builds a monocart `sourceFilter` that keeps ONLY corelive's own source files,
 * using on-disk existence as the discriminator — robust where prefix lists are
 * not, because third-party libs (lucide `src/icons/*`, @tanstack `src/useQuery.ts`,
 * Next `src/providers/*`) ship source maps that expand to bare `src/…` paths
 * indistinguishable from first-party by glob, yet do not exist at that path in
 * this repo. Also drops the Phase 0 exclude categories so the universe matches
 * the unit side exactly.
 * @param {string} repoRoot - Absolute repo root used to resolve existence checks.
 * @param {string[]} [prefixes] - Allowed normalized prefixes (default web `src/`).
 * @returns {(sourcePath: string) => boolean} monocart sourceFilter predicate.
 * @example
 * makeFirstPartyFilter(process.cwd())('_N_E/src/icons/activity.ts') // => false (no such file)
 * makeFirstPartyFilter(process.cwd())('_N_E/src/app/page.tsx')      // => true  (exists)
 */
export function makeFirstPartyFilter(
  repoRoot,
  prefixes = WEB_FIRST_PARTY_PREFIXES,
) {
  return (sourcePath) => {
    const rel = toRepoRelative(sourcePath, repoRoot)
    // Must live under an allowed first-party subtree.
    if (!prefixes.some((prefix) => rel.startsWith(prefix))) return false
    // Drop tests / stories / types / ambient — match the unit exclude set.
    if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(rel))) return false
    // Final discriminator: the file actually exists in THIS repo (kills the
    // third-party `src/…` look-alikes whose only home is node_modules).
    return fs.existsSync(path.join(repoRoot, rel))
  }
}
