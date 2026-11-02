// Guards the #215 removal: the web LiveEditor (`/write`, `/live-editor`) and its
// panel preload must not come back through a revert, a copied import or a stale
// build entry. The one-time identifier audit lives in the PR body (S35/DX16).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/** Trees and files deleted by #215; any listed source under them is a violation. */
const REMOVED_PATHS = [
  'apps/web/src/app/write/',
  'apps/web/src/app/live-editor/',
  'apps/web/src/components/live-editor/',
  'apps/web/src/lib/live-editor/',
  'apps/desktop/electron/preload-live-editor.ts',
] as const

/** Import specifiers that would resurrect a deleted module, matched on the specifier text only. */
const REMOVED_IMPORT_PATTERN =
  /(?:^|\/)(?:components|lib)\/live-editor(?:\/|$)|(?:^|\/)app\/(?:write|live-editor)(?:\/|$)/

/** The deleted panel preload's build entry name. */
const REMOVED_BUILD_ENTRY = 'preload-live-editor'

/** Files allowed to mention removed paths, each with the reason it needs to. */
const ALLOWED_REFERENCES: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: 'scripts/web-live-editor-removal.test.ts',
    reason: 'this guard names every removed path it checks',
  },
  {
    path: 'apps/web/src/nextConfigRedirects.test.ts',
    reason: 'asserts the redirects that replaced /write and /live-editor',
  },
]

const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
])

/** git can list tens of thousands of paths; leave room well above the repo size. */
const GIT_OUTPUT_MAX_BYTES = 64 * 1024 * 1024

const FIX_SENTENCE =
  'The web LiveEditor was removed in #215; edit apps/desktop/renderer or packages/live-editor instead, then rerun pnpm test:tools.'

const GIT_LIST_ARGUMENTS = [
  'ls-files',
  '--cached',
  '--others',
  '--exclude-standard',
  '-z',
  '--',
  'apps',
  'packages',
  'scripts',
] as const

type ViolationCode =
  'WEB_LE_REMOVED_PATH' | 'WEB_LE_REMOVED_IMPORT' | 'WEB_LE_BUILD_ENTRY'

interface Violation {
  code: ViolationCode
  file: string
  line: number
  match: string
}

interface GitResult {
  status: number | null
  stdout: string
  stderr: string
}

/**
 * Lists repo-relative source files the guard scans, so staged or unstaged deletions never false-fail (S30).
 * @param runGit - Runs git with the given arguments; injected so the failure contract is testable.
 * @param fileExists - Reports whether a listed path is still on disk.
 * @returns Tracked and untracked, non-ignored files under apps/, packages/ and scripts/ that exist.
 * @throws Error starting with `WEB_LE_GIT_UNAVAILABLE` when git cannot list files.
 * @example
 * listScannedFiles(runRepositoryGit, (file) => existsSync(file)) // => ['apps/web/next.config.js', …]
 */
function listScannedFiles(
  runGit: (args: readonly string[]) => GitResult,
  fileExists: (file: string) => boolean,
): string[] {
  const result = runGit(GIT_LIST_ARGUMENTS)
  // A guard that cannot see the tree must fail loudly, never pass on an empty list.
  if (result.status !== 0) {
    throw new Error(
      [
        'WEB_LE_GIT_UNAVAILABLE',
        `command: git ${GIT_LIST_ARGUMENTS.join(' ')}`,
        `exit code: ${String(result.status)}`,
        `stderr: ${result.stderr.trim()}`,
      ].join('\n'),
    )
  }
  return result.stdout
    .split('\0')
    .filter((file) => file.length > 0 && fileExists(file))
}

/**
 * Finds every resurrected path, import or build entry in the scanned files (DX6 codes).
 * @param files - Repo-relative file list from {@link listScannedFiles}.
 * @param readSource - Reads one repo-relative file as UTF-8.
 * @returns Violations in file order; empty when the removal holds.
 * @example
 * findRemovalViolations(['apps/web/src/app/write/page.tsx'], () => '')
 * // => [{ code: 'WEB_LE_REMOVED_PATH', file: 'apps/web/src/app/write/page.tsx', line: 1, match: 'apps/web/src/app/write/' }]
 */
function findRemovalViolations(
  files: readonly string[],
  readSource: (file: string) => string,
): Violation[] {
  const allowedFiles = new Set(ALLOWED_REFERENCES.map((entry) => entry.path))
  const violations: Violation[] = []
  for (const file of files) {
    const removedPath = REMOVED_PATHS.find((removed) =>
      removed.endsWith('/') ? file.startsWith(removed) : file === removed,
    )
    // A file inside a deleted tree is reported once; its contents do not matter.
    if (removedPath) {
      violations.push({
        code: 'WEB_LE_REMOVED_PATH',
        file,
        line: 1,
        match: removedPath,
      })
      continue
    }
    if (allowedFiles.has(file) || !SCANNED_EXTENSIONS.has(path.extname(file)))
      continue
    const lines = readSource(file).split('\n')
    lines.forEach((text, index) => {
      for (const specifier of importSpecifiers(text)) {
        if (REMOVED_IMPORT_PATTERN.test(specifier)) {
          violations.push({
            code: 'WEB_LE_REMOVED_IMPORT',
            file,
            line: index + 1,
            match: specifier,
          })
        }
      }
      if (text.includes(REMOVED_BUILD_ENTRY)) {
        violations.push({
          code: 'WEB_LE_BUILD_ENTRY',
          file,
          line: index + 1,
          match: REMOVED_BUILD_ENTRY,
        })
      }
    })
  }
  return violations
}

/**
 * Extracts module specifiers from one source line (static, side-effect, dynamic and require imports).
 * @param text - One line of source.
 * @returns The quoted specifiers on that line; comments and plain strings are ignored.
 * @example
 * importSpecifiers("import { x } from '@/lib/live-editor/constants'") // => ['@/lib/live-editor/constants']
 */
function importSpecifiers(text: string): string[] {
  const specifierPattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"]+)\1/g
  return [...text.matchAll(specifierPattern)].map((found) => found[2] ?? '')
}

/**
 * Renders one violation as the stable, agent-readable line the guard prints.
 * @param violation - A finding from {@link findRemovalViolations}.
 * @returns `<CODE> <file>:<line> <match> — <fix sentence>`; never file contents.
 * @example
 * formatViolation({ code: 'WEB_LE_BUILD_ENTRY', file: 'a.ts', line: 3, match: 'preload-live-editor' })
 * // => 'WEB_LE_BUILD_ENTRY a.ts:3 preload-live-editor — The web LiveEditor was removed in #215; …'
 */
function formatViolation(violation: Violation): string {
  return `${violation.code} ${violation.file}:${violation.line} ${violation.match} — ${FIX_SENTENCE}`
}

/**
 * Runs git in the repository root for {@link listScannedFiles}.
 * @param args - git arguments.
 * @returns Exit status and captured output.
 * @example runRepositoryGit(['status']) // => { status: 0, stdout: '…', stderr: '' }
 */
function runRepositoryGit(args: readonly string[]): GitResult {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_MAX_BYTES,
  })
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout ?? '',
    stderr: result.error ? result.error.message : (result.stderr ?? ''),
  }
}

describe('the web LiveEditor stays removed', () => {
  test('no deleted path, removed import or panel preload entry exists in apps, packages or scripts', () => {
    // Arrange
    const files = listScannedFiles(runRepositoryGit, (file) =>
      existsSync(path.join(repositoryRoot, file)),
    )

    // Act
    const report = findRemovalViolations(files, (file) =>
      readFileSync(path.join(repositoryRoot, file), 'utf8'),
    )
      .map(formatViolation)
      .join('\n')

    // Assert
    expect(report).toBe('')
  })

  test('the desktop build no longer compiles a LiveEditor panel preload', () => {
    // Arrange
    const viteConfig = readFileSync(
      path.join(repositoryRoot, 'apps/desktop/electron.vite.config.ts'),
      'utf8',
    )

    // Act
    const namesRemovedEntry = viteConfig.includes(REMOVED_BUILD_ENTRY)

    // Assert
    expect(namesRemovedEntry).toBe(false)
  })

  test('every allowed reference names a file that still exists and gives a reason', () => {
    // Arrange + Act
    const invalidEntries = ALLOWED_REFERENCES.filter(
      (entry) =>
        entry.reason.trim().length === 0 ||
        !existsSync(path.join(repositoryRoot, entry.path)),
    )

    // Assert
    expect(invalidEntries).toEqual([])
  })
})

describe('the removal guard explains each violation', () => {
  test('reports a file left inside a deleted tree with its code, location and fix', () => {
    // Arrange
    const files = ['apps/web/src/app/write/page.tsx']

    // Act
    const report = findRemovalViolations(files, () => '').map(formatViolation)

    // Assert
    expect(report).toEqual([
      'WEB_LE_REMOVED_PATH apps/web/src/app/write/page.tsx:1 apps/web/src/app/write/ — The web LiveEditor was removed in #215; edit apps/desktop/renderer or packages/live-editor instead, then rerun pnpm test:tools.',
    ])
  })

  test('reports an import of a deleted module at its line', () => {
    // Arrange
    const sources: Record<string, string> = {
      'apps/web/src/hooks/useDraft.ts':
        "import { useMounted } from '@/hooks/use-mounted'\nimport { NOTE_KEY } from '@/lib/live-editor/constants'\n",
    }

    // Act
    const report = findRemovalViolations(
      Object.keys(sources),
      (file) => sources[file] ?? '',
    ).map(formatViolation)

    // Assert
    expect(report).toEqual([
      'WEB_LE_REMOVED_IMPORT apps/web/src/hooks/useDraft.ts:2 @/lib/live-editor/constants — The web LiveEditor was removed in #215; edit apps/desktop/renderer or packages/live-editor instead, then rerun pnpm test:tools.',
    ])
  })

  test('reports a revived panel preload build entry', () => {
    // Arrange
    const sources: Record<string, string> = {
      'apps/desktop/electron.vite.config.ts':
        "input: {\n  'preload-live-editor': resolve(__dirname, 'electron/preload-live-editor.ts'),\n}\n",
    }

    // Act
    const report = findRemovalViolations(
      Object.keys(sources),
      (file) => sources[file] ?? '',
    ).map(formatViolation)

    // Assert
    expect(report).toEqual([
      'WEB_LE_BUILD_ENTRY apps/desktop/electron.vite.config.ts:2 preload-live-editor — The web LiveEditor was removed in #215; edit apps/desktop/renderer or packages/live-editor instead, then rerun pnpm test:tools.',
    ])
  })

  test('ignores redirect strings, the allowed files and non-source files', () => {
    // Arrange
    const sources: Record<string, string> = {
      'apps/web/next.config.js':
        "{ source: '/live-editor', destination: '/home', permanent: false }\n",
      'apps/web/src/nextConfigRedirects.test.ts':
        "import nextConfig from '../next.config.js' // app/live-editor/ is gone\n",
      'apps/web/public/notes.txt': 'preload-live-editor\n',
    }

    // Act
    const report = findRemovalViolations(
      Object.keys(sources),
      (file) => sources[file] ?? '',
    )

    // Assert
    expect(report).toEqual([])
  })

  test('fails with WEB_LE_GIT_UNAVAILABLE and the git diagnostics when files cannot be listed', () => {
    // Arrange
    const failingGit = (): GitResult => ({
      status: 128,
      stdout: '',
      stderr: 'fatal: not a git repository\n',
    })

    // Act
    const listFiles = (): string[] => listScannedFiles(failingGit, () => true)

    // Assert
    expect(listFiles).toThrow(
      'WEB_LE_GIT_UNAVAILABLE\ncommand: git ls-files --cached --others --exclude-standard -z -- apps packages scripts\nexit code: 128\nstderr: fatal: not a git repository',
    )
  })

  test('drops listed files that are already deleted from disk', () => {
    // Arrange
    const listingGit = (): GitResult => ({
      status: 0,
      stdout: 'apps/web/next.config.js\0apps/web/src/app/write/page.tsx\0',
      stderr: '',
    })

    // Act
    const files = listScannedFiles(
      listingGit,
      (file) => file === 'apps/web/next.config.js',
    )

    // Assert
    expect(files).toEqual(['apps/web/next.config.js'])
  })
})
