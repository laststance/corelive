import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  makeFirstPartyFilter,
  makeSourcePath,
  MERGED_FIRST_PARTY_PREFIXES,
  normalizeSourcePath,
  toRepoRelative,
} from './coverage-source-filter.mjs'

// scripts/ sits one level under the repo root; resolve it independent of cwd.
const REPO_ROOT = path.resolve(import.meta.dirname, '..')

describe('coverage source-path normalization (#127 merge alignment)', () => {
  it('strips the Next `_N_E` webpack prefix so unit and E2E keys merge as one file', () => {
    // Arrange
    const e2ePath = '_N_E/src/app/(main)/home/_components/AddTodoForm.tsx'
    // Act
    const key = normalizeSourcePath(e2ePath)
    // Assert
    expect(key).toBe('src/app/(main)/home/_components/AddTodoForm.tsx')
  })

  it('strips a `webpack://…/./` scheme prefix down to the repo-relative path', () => {
    // Arrange
    const webpackPath = 'webpack://_N_E/./src/lib/utils.ts'
    // Act
    const key = normalizeSourcePath(webpackPath)
    // Assert
    expect(key).toBe('src/lib/utils.ts')
  })

  it('leaves an already-clean key untouched (idempotent for vitest-shaped paths)', () => {
    // Arrange
    const cleanPath = 'src/proxy.ts'
    // Act
    const key = normalizeSourcePath(cleanPath)
    // Assert
    expect(key).toBe('src/proxy.ts')
  })

  it('strips an absolute repo root so istanbul (absolute) keys align with E2E keys', () => {
    // Arrange — vitest emits absolute coverage-final.json keys.
    const absolutePath = path.join(REPO_ROOT, 'electron/main.ts')
    // Act
    const key = toRepoRelative(absolutePath, REPO_ROOT)
    // Assert
    expect(key).toBe('electron/main.ts')
  })

  it('makeSourcePath rewrites an E2E `_N_E` path to the repo-relative merge key', () => {
    // Arrange
    const rewrite = makeSourcePath(REPO_ROOT)
    // Act
    const key = rewrite('_N_E/src/app/page.tsx')
    // Assert
    expect(key).toBe('src/app/page.tsx')
  })
})

describe('first-party coverage filter (#127 keeps corelive code, drops the rest)', () => {
  const isFirstParty = makeFirstPartyFilter(
    REPO_ROOT,
    MERGED_FIRST_PARTY_PREFIXES,
  )

  it('keeps a real first-party src file that exists on disk', () => {
    // Arrange — src/proxy.ts is real corelive code.
    // Act
    const kept = isFirstParty('_N_E/src/proxy.ts')
    // Assert
    expect(kept).toBe(true)
  })

  it('keeps a real electron main-process file under the merged electron prefix', () => {
    // Arrange — electron/main.ts is the booted-app entry the merge must include.
    // Act
    const kept = isFirstParty(path.join(REPO_ROOT, 'electron/main.ts'))
    // Assert
    expect(kept).toBe(true)
  })

  it('drops a third-party `src/…` look-alike that has no file on disk (lucide leak)', () => {
    // Arrange — lucide-react source maps expand to `src/icons/*`, which corelive
    // does not have; a `**/src/**` glob could not tell this from real code.
    // Act
    const kept = isFirstParty('_N_E/src/icons/activity.ts')
    // Assert
    expect(kept).toBe(false)
  })

  it('drops node_modules / dist-electron / .next paths even if they resolve', () => {
    // Act + Assert — none are first-party product source.
    expect(isFirstParty('node_modules/lucide-react/dist/index.js')).toBe(false)
    expect(isFirstParty('dist-electron/main/index.cjs')).toBe(false)
    expect(isFirstParty('.next/static/chunks/main.js')).toBe(false)
  })

  it('drops a test file that DOES exist on disk via the unit exclude set', () => {
    // Arrange — src/proxy.test.ts is real, but specs are not product coverage;
    // the exclude set must drop it so unit + E2E share one file universe.
    // Act
    const kept = isFirstParty('src/proxy.test.ts')
    // Assert
    expect(kept).toBe(false)
  })
})
