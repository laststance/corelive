// D6 boundary: the desktop-only editor modules moved out of `@corelive/live-editor` into
// `apps/desktop/renderer/editor/`. The web app may import only what stays in the shared package.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Old package subpath -> file basename now living in `apps/desktop/renderer/editor/`. */
const DESKTOP_ONLY_MODULES: Record<string, string> = {
  utils: 'liveEditorUtils',
  surface: 'SharedEditorSurface',
  ember: 'TodayEmber',
  'category-picker': 'SharedCategoryPicker',
  input: 'editorInput',
  store: 'DurableEditorStore',
  'draft-edits': 'draftEdits',
  'draft-input-limit': 'draftInputLimit',
  'window-settings': 'useEditorWindowSettings',
}

/** Subpath prefixes that stay in the shared package (D6 "Stays in the package" + DA10). */
const SHARED_SUBPATHS = [
  'day',
  'ui/',
  // Generic lifecycle-effect hooks shared by the web and the desktop Settings renderer (#216 D5).
  'hooks/',
  'cn',
  'categoryHierarchy',
  'heatmap-intensity',
  'themes',
  'theme-transition',
  'styles/',
]

const IMPORT_PATTERN = /@corelive\/live-editor\/([A-Za-z0-9_\-/.]+)/g

/**
 * Builds the DX10 failure message for a web import of a desktop-only module.
 *
 * Why it exists: a bare "module not found" does not tell a contributor where the code went.
 * Called by {@link findBoundaryViolations}.
 *
 * @param subpath - The imported `@corelive/live-editor/<subpath>`.
 * @returns the message naming the destination, or a generic one for an unknown subpath.
 * @example
 * formatBoundaryViolation('store')
 */
function formatBoundaryViolation(subpath: string): string {
  const destination = DESKTOP_ONLY_MODULES[subpath]
  if (destination === undefined) {
    return `apps/web imports "@corelive/live-editor/${subpath}", which the shared package does not export. Import only the shared UI, theme and day utilities.`
  }
  return `apps/web imports "@corelive/live-editor/${subpath}", which moved to apps/desktop/renderer/editor/${destination} (desktop-only). Import it only from apps/desktop.`
}

/**
 * Lists every source file under a directory, skipping build output.
 *
 * @param dir - Absolute directory.
 * @returns absolute file paths with a TS/JS extension.
 * @example
 * listSourceFiles(path.join(root, 'apps/web/src'))
 */
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next') return []
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return listSourceFiles(full)
    return /\.(?:tsx?|mjs|js)$/.test(name) ? [full] : []
  })
}

/**
 * Finds `apps/web` imports of package subpaths outside the shared allow-list.
 *
 * @returns one `file: message` string per offending import.
 * @example
 * findBoundaryViolations() // => []
 */
function findBoundaryViolations(): string[] {
  const violations: string[] = []
  for (const file of listSourceFiles(path.join(root, 'apps/web/src'))) {
    // Every subpath mention counts (imports, mocks and prose alike), so even a comment cannot name a desktop-only module.
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(IMPORT_PATTERN)) {
      const subpath = match[1] ?? ''
      const shared = SHARED_SUBPATHS.some((allowed) =>
        allowed.endsWith('/')
          ? subpath.startsWith(allowed)
          : subpath === allowed || subpath.startsWith(`${allowed}/`),
      )
      if (!shared) {
        violations.push(
          `${path.relative(root, file)}: ${formatBoundaryViolation(subpath)}`,
        )
      }
    }
  }
  return violations
}

test('apps/web imports only the shared parts of @corelive/live-editor', () => {
  // Arrange / Act
  const violations = findBoundaryViolations()

  // Assert
  expect(violations).toEqual([])
})

test('the package no longer exports any desktop-only editor module', () => {
  // Arrange
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'packages/live-editor/package.json'), 'utf8'),
  ) as { exports: Record<string, string> }

  // Act
  const exported = Object.keys(manifest.exports).filter((key) =>
    Object.keys(DESKTOP_ONLY_MODULES).includes(key.replace(/^\.\//, '')),
  )

  // Assert
  expect(exported).toEqual([])
})

test('the boundary failure for a moved module names its desktop destination', () => {
  // Arrange / Act
  const message = formatBoundaryViolation('store')

  // Assert
  expect(message).toBe(
    'apps/web imports "@corelive/live-editor/store", which moved to apps/desktop/renderer/editor/DurableEditorStore (desktop-only). Import it only from apps/desktop.',
  )
})

test('every desktop-only module destination exists in apps/desktop/renderer/editor', () => {
  // Arrange
  const editorDir = path.join(root, 'apps/desktop/renderer/editor')
  const files = readdirSync(editorDir)

  // Act
  const missing = Object.values(DESKTOP_ONLY_MODULES).filter(
    (base) => !files.some((file) => file.startsWith(`${base}.`)),
  )

  // Assert
  expect(missing).toEqual([])
})
