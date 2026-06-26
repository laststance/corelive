#!/usr/bin/env node
/**
 * #127 Phase 2 — Electron main-process coverage report.
 *
 * Why it exists: the 387 electron unit tests never execute `electron/main.ts`
 * (it boots only inside the real app), so unit coverage shows it at 0%. This
 * converts the per-launch `NODE_V8_COVERAGE` dirs written by the booted main
 * process during `COVERAGE=1 pnpm e2e:electron` (see
 * `e2e/electron/_helpers/launch.ts`) into one monocart `raw` report dir,
 * source-map-remapped from `dist-electron/main/*.cjs` back to `electron/*.ts`,
 * ready for the Phase 3 merge.
 *
 * Hard-fails if `electron/main.ts` is absent from the result — that proves the
 * booted-app path was actually measured, not silently empty (codex #6).
 *
 * @example
 *   COVERAGE=1 pnpm e2e:electron      # writes per-launch dirs under coverage/.electron-v8
 *   node scripts/electron-coverage-report.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

import { CoverageReport } from 'monocart-coverage-reports'

/** Root where launch.ts writes one NODE_V8_COVERAGE dir per booted launch. */
const V8_ROOT = 'coverage/.electron-v8'
/** Monocart output dir; the `raw` report lands at `${OUT_DIR}/raw` for Phase 3. */
const OUT_DIR = 'coverage/e2e-electron'
/** Matches `electron/main.ts` regardless of absolute/relative prefix. */
const MAIN_TS = /(^|\/)electron\/main\.ts$/

/**
 * Lists the per-launch V8 coverage subdirectories under `root`.
 * @param root - The coverage root (`coverage/.electron-v8`).
 * @returns Absolute-or-relative paths of each launch's dir; `[]` if root absent.
 */
function listCoverageDirs(root) {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root)
    .map((entry) => path.join(root, entry))
    .filter((entry) => {
      try {
        return fs.statSync(entry).isDirectory()
      } catch {
        return false
      }
    })
}

const dirs = listCoverageDirs(V8_ROOT)
if (dirs.length === 0) {
  console.error(
    `[electron-coverage] No V8 coverage dirs under ${V8_ROOT}/. ` +
      'Run `COVERAGE=1 pnpm e2e:electron` first.',
  )
  process.exit(1)
}

const report = new CoverageReport({
  name: 'CoreLive Electron main-process coverage',
  outputDir: OUT_DIR,
  // Remap bundled dist-electron/main/*.cjs back to electron/*.ts via the sibling
  // .cjs.map (electron-vite emits sourcemap:true at electron.vite.config.ts).
  sourceMap: true,
  // Drop node_modules entries before they are even mapped.
  entryFilter: {
    '**/node_modules/**': false,
    '**/*': true,
  },
  // Keep only first-party electron sources in the final report.
  sourceFilter: {
    '**/node_modules/**': false,
    '**/electron/**': true,
    '**/*': false,
  },
  // `raw` feeds the Phase 3 merge; v8 + console-details are for local inspection.
  reports: ['raw', 'v8', 'console-details'],
})

// `addFromDir` is the correct API for raw NODE_V8_COVERAGE dirs (codex pass-3 #1).
for (const dir of dirs) {
  await report.addFromDir(dir)
}
const results = await report.generate()

const files = results?.files ?? []
const mainFile = files.find((file) => MAIN_TS.test(file.sourcePath))
if (!mainFile) {
  console.error(
    `[electron-coverage] electron/main.ts NOT found among ${files.length} ` +
      'covered files — the booted-app path was not measured. Sample: ' +
      files
        .slice(0, 8)
        .map((file) => file.sourcePath)
        .join(', '),
  )
  process.exit(1)
}

// Present-but-0%-covered means the booted app never executed the entry point —
// treat that as a failure too, not just an absent entry (codex #6, strengthened).
const mainLines = mainFile.summary?.lines
if (!mainLines || mainLines.covered <= 0) {
  console.error(
    '[electron-coverage] electron/main.ts present but 0 lines covered ' +
      `(${JSON.stringify(mainLines)}) — the booted-app path did not execute it.`,
  )
  process.exit(1)
}

process.stdout.write(
  `[electron-coverage] OK — ${dirs.length} launch dir(s), ${files.length} ` +
    `electron files. electron/main.ts: ${mainLines.covered}/${mainLines.total} ` +
    `lines (${mainLines.pct}%)\n`,
)
process.stdout.write(
  `[electron-coverage] raw report → ${OUT_DIR}/raw (for Phase 3 merge)\n`,
)
