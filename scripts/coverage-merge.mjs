// @ts-check
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { CoverageReport } from 'monocart-coverage-reports'

import {
  makeFirstPartyFilter,
  makeSourcePath,
  MERGED_FIRST_PARTY_PREFIXES,
} from './coverage-source-filter.mjs'

/**
 * #127 Phase 3 — merge unit + E2E coverage into one report.
 *
 * One engine owns the merge: `monocart-coverage-reports`. Two stages, because
 * monocart cannot V8-merge a file measured by BOTH a V8 source (E2E `page.coverage`
 * / `NODE_V8_COVERAGE`) and an Istanbul source (vitest's `coverage-final.json`):
 * the V8 merge path expects `.functions` on every entry, which the Istanbul side
 * lacks (V8→Istanbul is automatic, Istanbul→V8 is not). So:
 *   Stage 1 — merge the E2E `raw` V8 dirs (`inputDir`) into a single Istanbul
 *             `coverage-final.json` (source-map-remapped, first-party-filtered).
 *   Stage 2 — merge that E2E Istanbul + the two unit Istanbul files, ALL Istanbul,
 *             via `.add()` — one merge path, no shape clash.
 * A shared `sourcePath` rewrites every input to the same repo-relative key
 * (`src/…`, `electron/…`) so a file measured by both unit and E2E merges ONCE;
 * `sourceFilter` keeps only first-party code.
 *
 * Report-only by default (exit 0). Set `COVERAGE_MIN_LINES` / `_STATEMENTS` /
 * `_FUNCTIONS` / `_BRANCHES` (percent floors) to fail on regression in CI.
 */

const repoRoot = process.cwd()

/** @param {string} line - Text to print to stdout (no-console eslint allows this). */
const write = (line) => process.stdout.write(`${line}\n`)

const shared = {
  sourceMap: true,
  // Collapse unit (absolute) + E2E (`_N_E/…`, `dist-electron/…`) paths to one key.
  sourcePath: makeSourcePath(repoRoot),
  // Permissive on entries (electron `.cjs` + web chunks both qualify); the
  // existence-based sourceFilter does the real first-party precision.
  entryFilter: (/** @type {{ url: string }} */ entry) =>
    !entry.url.includes('/node_modules/'),
  sourceFilter: makeFirstPartyFilter(repoRoot, MERGED_FIRST_PARTY_PREFIXES),
}

// E2E inputs are MCR raw report dirs (Phases 1-2). Only merge ones that exist;
// log any skipped so a partial run never silently under-reports (no silent caps).
const E2E_RAW_DIRS = ['coverage/e2e-web/raw', 'coverage/e2e-electron/raw']
const e2eRawDirs = E2E_RAW_DIRS.filter((dir) => {
  const exists = fs.existsSync(path.join(repoRoot, dir))
  if (!exists) write(`⚠️  skipping missing E2E raw dir: ${dir}`)
  return exists
})

// Unit inputs are vitest v8 Istanbul coverage-final.json (Phase 0).
const UNIT_JSON_FILES = [
  'coverage/unit-web/coverage-final.json',
  'coverage/unit-electron/coverage-final.json',
]
const unitJsons = UNIT_JSON_FILES.filter((file) => {
  const exists = fs.existsSync(path.join(repoRoot, file))
  if (!exists) write(`⚠️  skipping missing unit coverage json: ${file}`)
  return exists
})

if (e2eRawDirs.length === 0 && unitJsons.length === 0) {
  write(
    '❌ no coverage inputs found — run coverage:unit + coverage:e2e:* first',
  )
  process.exit(1)
}

/** Istanbul coverage objects to fold into the final all-Istanbul merge. */
const istanbulInputs = []

// Stage 1: E2E V8 raw → one Istanbul coverage-final.json.
if (e2eRawDirs.length > 0) {
  const e2eIstanbulDir = 'coverage/.e2e-istanbul'
  await new CoverageReport({
    ...shared,
    name: 'CoreLive E2E Coverage (intermediate)',
    inputDir: e2eRawDirs,
    outputDir: e2eIstanbulDir,
    // Pin the filename: the istanbul `json` report defaults to `coverage-final.json`
    // (istanbul-reports/lib/json defaults `opts.file`), but state it explicitly so a
    // future monocart/istanbul default change can't silently break the read below.
    reports: [['json', { file: 'coverage-final.json' }]],
  }).generate()
  const e2eFinal = path.join(repoRoot, e2eIstanbulDir, 'coverage-final.json')
  if (fs.existsSync(e2eFinal)) {
    istanbulInputs.push(JSON.parse(fs.readFileSync(e2eFinal, 'utf8')))
  }
}

// Unit Istanbul files join the same all-Istanbul merge.
for (const file of unitJsons) {
  istanbulInputs.push(
    JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8')),
  )
}

// Stage 2: all-Istanbul merge → the published report.
const report = new CoverageReport({
  ...shared,
  name: 'CoreLive Combined Coverage',
  outputDir: 'coverage/merged',
  reports: ['html', 'lcovonly', 'json-summary', 'console-details'],
})
for (const istanbul of istanbulInputs) {
  await report.add(istanbul)
}

const results = await report.generate()

if (!results || !results.summary) {
  write('❌ monocart generate() returned no summary')
  process.exit(1)
}
const { summary } = results

write('')
write(
  `📊 Merged coverage written to coverage/merged (files: ${results.files.length})`,
)

// Optional CI gate: fail when any metric regresses below its env floor. Explicit
// per-metric access (no dynamic indexing) keeps this @ts-check-clean.
//
// ⚠️ Baseline caveat: the ~32% baseline in the design doc was measured LOCALLY
// with the Electron E2E run folded in. CI's merged report is unit + WEB E2E only
// (Electron E2E is macOS-local, never in CI — see design doc As-Built #5), so CI's
// merged percentages are LOWER. Do NOT set COVERAGE_MIN_* to the local baseline or
// CI reds on a phantom regression — derive each floor from a CI run's own number.
const metrics = [
  {
    name: 'lines',
    pct: Number(summary.lines.pct),
    floor: Number(process.env.COVERAGE_MIN_LINES ?? 0),
  },
  {
    name: 'statements',
    pct: Number(summary.statements.pct),
    floor: Number(process.env.COVERAGE_MIN_STATEMENTS ?? 0),
  },
  {
    name: 'functions',
    pct: Number(summary.functions.pct),
    floor: Number(process.env.COVERAGE_MIN_FUNCTIONS ?? 0),
  },
  {
    name: 'branches',
    pct: Number(summary.branches.pct),
    floor: Number(process.env.COVERAGE_MIN_BRANCHES ?? 0),
  },
]
const failures = []
for (const metric of metrics) {
  write(
    `   ${metric.name.padEnd(11)} ${String(metric.pct).padStart(6)}%  (floor ${metric.floor}%)`,
  )
  if (metric.floor > 0 && metric.pct < metric.floor) {
    failures.push(`${metric.name} ${metric.pct}% < ${metric.floor}%`)
  }
}

if (failures.length > 0) {
  write(`\n❌ coverage regressed:\n   ${failures.join('\n   ')}`)
  process.exit(1)
}
write('\n✅ coverage merge complete')
