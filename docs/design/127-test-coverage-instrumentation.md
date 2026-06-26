# Design Doc — #127 Test-coverage instrumentation (Unit + E2E, Web & Electron)

> Design doc for issue **#127** ("Make Unit + E2E (Web & Electron) coverage
> measurable; reference `laststance/gitbox` for the E2E coverage technique").
> The issue's only concrete content is the **gitbox reference** — it is about the
> _mechanism_ for collecting coverage, not a list of lines to cover. So this doc
> scopes the **measurement apparatus** (collect + merge + report + CI gate +
> baseline) as the deliverable. The aspirational "100%" is a **target**, not a
> mechanism; it is answerable only _after_ a baseline exists, so it is recorded
> here as a deferred decision with a recommended default (ratchet-from-baseline),
> not a blocker.
>
> **Grounded by a live spike (this session), not theory.** The one genuinely
> uncertain mechanism — capturing Electron **main-process** coverage — was proven
> viable before writing this plan: injecting `NODE_V8_COVERAGE` into the
> `_electron.launch` env and closing cleanly flushed a coverage file with **23
> script entries** referencing `dist-electron/main/*.cjs` (`index`, `ConfigManager`,
> `constants`, …), and electron-vite emits `.cjs.map` for each (`sourcemap: true`,
> `electron.vite.config.ts:52,82`) so they map back to `electron/*.ts`. Evidence in
> "Spike" below.

## Context

corelive has real test depth already — `pnpm test` runs **734 unit tests** (88
files) and `pnpm test:electron` runs **387** — plus Playwright E2E for web (10
spec files, sharded one-job-per-spec in CI) and Electron (`e2e/electron/*.spec.ts`,
single job). What it does **not** have is a way to _measure_ how much of the
product those tests exercise. `@vitest/coverage-v8` is installed but no `coverage`
script invokes it; the Playwright suites collect zero coverage. So today the honest
answer to "is this code path tested?" is "grep for a test and guess."

That blind spot bit us last week. PR #129 (#125) shipped a Major fix in
`electron/main.ts` whose only harness, `electron/__tests__/main-process.test.mjs`,
turned out to be **shadow reimplementations** — it defines its own `WindowManager`/
`SystemTrayManager`/IPC classes inline and tests _those_, never importing the real
`main.ts`. A coverage report would have shown `main.ts` at ~0% and flagged that the
"387 passing tests" never touch the entry point. Coverage is the instrument that
makes that gap visible instead of a surprise in production.

Issue #127 points at **`laststance/gitbox`** for "how to obtain E2E coverage." That repo
(a web-only Next.js app, no Electron) collects V8 coverage through the Playwright
runner. This plan ports that technique and extends it to the one surface gitbox
never had: the Electron main process.

## Current State (verified)

| Surface          | Test runner                                              | Coverage today  | Notes                                                                                           |
| ---------------- | -------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| Unit (web/src)   | `vitest run` (`vitest.config.ts`)                        | CI-only, broken | CI passes `--coverage` but no config block → vitest DEFAULT reporters (no lcov); see note below |
| Unit (electron)  | `vitest run --config vitest.config.electron.ts`          | none wired      | 387 tests; `validate` does NOT run this config                                                  |
| Unit (storybook) | `vitest run --config vitest.config.storybook.ts`         | none wired      | component render tests                                                                          |
| E2E web          | `playwright test --project=web`                          | **none**        | 10 specs, CI matrix shards 1 job/spec → `merge-reports`                                         |
| E2E electron     | `playwright test --config=playwright.electron.config.ts` | **none**        | single job; `_electron.launch(dist-electron/main/index.cjs)`                                    |

- **Reporter today** (`playwright.config.ts:72-80`): `process.env.CI ? ['blob'] : ['list']`. No coverage reporter.
- **Web specs** import the runner directly: `import { test, expect, type Page } from '@playwright/test'` (e.g. `e2e/web/todo-app.spec.ts:2`). All 10 do.
- **Electron launch** (`e2e/electron/_helpers/launch.ts:46-56`): `electron.launch({ args: [ELECTRON_MAIN_ENTRY], env: {…} })` with a fixed env block — the seam where `NODE_V8_COVERAGE` is injected.
- **Versions:** `@playwright/test ^1.60.0`, `vitest ^4.1.6`. gitbox pairs `monocart-reporter ^2.11.3` with Playwright `^1.61.1`; peer-compat with our `^1.60.0` must be confirmed at install (impl note).
- **Existing CI coverage is effectively a no-op (codex #10).** `.github/workflows/test.yml` runs `pnpm test --run --coverage` and uploads `./coverage/lcov.info` to Codecov — but `package.json`'s `test` is bare `vitest run` and NO vitest config has a `coverage` block, so `--coverage` falls back to vitest's DEFAULT reporters (`text/html/clover/json` — **no lcov**), web/src only (electron + storybook never run with `--coverage`), no exclude list, no threshold. The Codecov step's `files: ./coverage/lcov.info` therefore matches nothing (`fail_ci_if_error: false` masks it). Phase 0 turns this broken path into a real one.

### Coverage-surface decomposition (the load-bearing insight)

"Make Electron coverage 100%" sounds like one big task. It is actually three sub-
surfaces with very different cost, and naming them collapses most of the work:

| Sub-surface                 | Code                                                             | Reached by                                          | Verdict                                                            |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Electron **renderer**       | the same Next.js bundle the web app serves                       | `page.coverage` (Chromium V8)                       | **Redundant with web E2E** — do NOT build a second collection path |
| Main process, unit-tested   | `ShortcutManager.ts`, `uiohookEngine.ts`, `nativeTapLatch.ts`, … | `vitest --config vitest.config.electron --coverage` | Cheap; provider already installed                                  |
| Main process, **`main.ts`** | the entry point (no real unit harness)                           | `NODE_V8_COVERAGE` only                             | The sole payoff of the E2E main-process path                       |

So the expensive mechanism (`NODE_V8_COVERAGE` through the Electron E2E run) earns
its keep on exactly one file class: **`main.ts` and whatever only the booted app
executes.** That makes its value measurable and bounds the work.

## Proposed Change

> **Codex plan-eng-review (gpt-5.5), two passes.** Pass 1: `needs-rethink` (8
> findings). Pass 2 on the revision: `ready-with-changes` (SCORE 7) — all 8 resolved
> except #7 (peer-compat, closed by actually installing in Phase 1), plus two new
> catches now folded: **#9** (is monocart's Istanbul/merge output real?) and **#10**
> (CI already ships a broken coverage path). Tags `(codex #N)` mark each fix.
>
> **#9 drove a design simplification.** Context7 confirms `monocart-coverage-reports`
> (the engine inside `monocart-reporter`) ingests raw V8 **and** `NODE_V8_COVERAGE`
> dirs, applies source maps, normalizes paths (`sourcePath`/`sourceFilter`), and
> merges multiple sources natively. So remap + normalize + merge all run through that
> ONE maintained, V8-native tool (the one gitbox already relies on) — deleting the
> hand-rolled `v8-to-istanbul` / `istanbul-lib-*` glue and resolving #3/#4/#5 by
> construction.

Four phases, each independently shippable. All three collectors are V8-based
(`@vitest/coverage-v8`, Playwright `page.coverage`, `NODE_V8_COVERAGE`). "V8-based"
does NOT make raw outputs merge-compatible on their own **(codex #4)** — they need
source-map remapping and a unified path space first. Rather than hand-roll that, the
two E2E sources export `monocart-coverage-reports`' **`raw`** V8 format and a single
`mcr` merge step applies source maps, unifies paths via `sourcePath`, and filters
via `sourceFilter` (reject `node_modules` / `dist-electron` / `.next`; keep `src/**`

- `electron/**`). Unit coverage stays `@vitest/coverage-v8` (Istanbul
  `coverage-final.json`), `add()`ed into that same merge. One tool owns remap +
  normalize + merge (Phase 3).

### Phase 0 — Unit coverage (lowest risk, do first)

Phase 0 turns the broken CI coverage (Current State, codex #10) into a real one —
wire a `test.coverage` block into the web + electron vitest configs and add scripts
(storybook is browser-mode — best-effort, see AC1):

- `coverage:unit` → `coverage:unit:web` (`vitest run --coverage`) + `coverage:unit:electron` (`vitest run --config vitest.config.electron.ts --coverage`).
- Each config gets a `test.coverage` block: `provider: 'v8'`, `reporter: ['text-summary','json','lcov']`, `reportsDirectory: coverage/unit-<name>`, and an `exclude` list (configs, `*.stories.tsx`, `*.test.*`, `*.spec.*`, generated files, `dist*`). The `json` reporter is the Istanbul `coverage-final.json` that Phase 3 `add()`s into the monocart merge; `lcov` is for human diffing.
- Output per config: `coverage/unit-<web|electron|storybook>/coverage-final.json` (canonical) + `lcov.info`.
- **Repoint the existing Codecov upload (codex #10).** `test.yml` currently uploads `./coverage/lcov.info`, which Phase 0 stops emitting (reportsDirectory moves to `coverage/unit-<name>`). Point the Codecov step at the merged report (Phase 3) or the per-config lcovs so the upload stops silently matching nothing.

This alone answers "what % of `src/` and `electron/` do the 1100+ unit tests
cover?" and surfaces the `main.ts`-at-0% fact immediately.

### Phase 1 — Web E2E coverage (port gitbox)

1. Add devDeps `monocart-reporter@2.11.3` (the Playwright reporter, gitbox-proven) and `monocart-coverage-reports` (its engine — a direct dep so the Phase 2/3 standalone scripts + the `mcr` CLI can use it outside Playwright). Run `pnpm add -D monocart-reporter@2.11.3 monocart-coverage-reports` and record the peer-compat result against `@playwright/test ^1.60.0` in this doc — gitbox pairs it with `^1.61.1`, so 1.60 is the one unverified delta (codex #7). Playwright 1.60's `page.coverage.startJSCoverage/startCSSCoverage` API is present (Chromium-only) and unchanged across 1.60→1.61. **Result (this session): clean install — ZERO monocart peer warnings against `@playwright/test ^1.60.0` (the only unmet peers were pre-existing `eslint`/`valibot`/`typescript`, unrelated); resolved `monocart-reporter@2.11.3` + `monocart-coverage-reports@2.12.12`. codex #7 CLOSED.**
2. New fixture `e2e/web/_helpers/coverage.ts` (mirrors gitbox's `e2e/fixtures/coverage.ts`): an `auto` fixture that, **gated on `process.env.COVERAGE === '1'`** (NOT `CI` — every existing sharded gate job already runs with `CI=true`, so a `CI` gate would fire coverage inside the pass/fail suite too, codex #2) and Chromium projects only, runs `page.coverage.startJSCoverage({resetOnNavigation:false})` + `startCSSCoverage`, then on teardown stops both and calls `addCoverageReport([...js,...css], testInfo)`. The `COVERAGE` gate also prevents the multi-GB `.cache` bloat gitbox documents on normal local/CI runs.
3. The 10 web specs change their import from `@playwright/test` to the fixture: `import { test, expect } from './_helpers/coverage'` (preserve `type Page` from `@playwright/test` where used).
4. **Browser source maps are mandatory and OFF by default (codex #1, Blocker).** corelive runs web E2E against a PRODUCTION build (`pnpm build` + `pnpm start`, `playwright.config.ts:137`) and has no Sentry, so by default `page.coverage` only sees minified `/_next/static/chunks/*.js` and maps to nothing under `src/**`. Add env-gated `productionBrowserSourceMaps: process.env.COVERAGE === '1'` to `next.config.js` and rebuild inside the coverage job; a Phase-1 assertion greps the emitted report for `SF:src/` and fails the job if absent. Normal builds keep the flag off (no `.map` emission → no bundle-size or source-leak surface in prod).
5. A coverage-only Playwright config (gated on `COVERAGE=1`) registers `monocart-reporter` with a coverage block emitting `['raw']` (V8) into `coverage/e2e-web/raw/` for the Phase 3 merge, plus `['lcovonly']` for a standalone human-readable view, scoped via `entryFilter`/`sourceFilter`/`sourcePath` to corelive globs (include `src/app`, `src/components`, `src/lib`, `src/hooks`; exclude server-only routes, `*.config.*`, tests, stories). Point monocart's cache + output at `coverage/.monocart`, cleaned before each run (codex #8). The raw V8 is source-map-remapped + normalized during the Phase 3 merge, not here.
6. **CI: a dedicated, NON-sharded `e2e-web-coverage` job, gated on `COVERAGE=1`.** The existing per-spec matrix shards stay the pass/fail gate, untouched and coverage-free. A separate job runs the full web E2E once with `COVERAGE=1` (+ the source-map build) and emits raw V8 under `coverage/e2e-web/raw/`. Because the fixture and reporter gate on `COVERAGE` not `CI` (codex #2), the gate shards never collect coverage — only this job does. Tradeoff vs gitbox's per-shard+merge: one extra full E2E run, accepted to avoid a fragile cross-shard monocart merge and any gate-suite drift.

### Phase 2 — Electron main-process coverage (spike-confirmed → IMPLEMENTED + QA'd)

> **Verified this session.** `launch.ts` injects `NODE_V8_COVERAGE` (gated on
> `COVERAGE=1`); a faithful booted-electron harness + `scripts/electron-coverage-report.mjs`
> source-map-remapped 23 `dist-electron/main/*.cjs` entries back to `electron/*.ts`
> and reported **`electron/main.ts` at 14.15% lines (228/1611) from a single launch
> with no renderer** — the booted-app coverage that unit tests show as 0%. The real
> suite (multiple specs + real renderer) lifts this further. The script hard-fails
> if `main.ts` is absent or 0-covered.

1. In `e2e/electron/_helpers/launch.ts`, when **`process.env.COVERAGE === '1'`** (NOT `CI` — the Electron CI job is a pass/fail gate, and turning coverage on there changes its runtime + output volume, codex #6), add `NODE_V8_COVERAGE: <perLaunchDir>` to the `electron.launch` env block. Each launch writes raw V8 JSON for the main process to its own dir.
2. Specs already `await electronApp.close()` — the clean exit that flushes V8 coverage. Audit each spec to ensure no path SIGKILLs the app before close (the spike confirmed a normal close flushes).
3. Post-process (`scripts/electron-coverage-report.mjs`): `const mcr = new CoverageReport({ sourceMap: true, entryFilter, sourceFilter, reports: ['raw'], outputDir: 'coverage/e2e-electron' }); await Promise.all(perLaunchDirs.map((d) => mcr.addFromDir(d))); await mcr.generate();`. **`addFromDir()` is the correct API for raw `NODE_V8_COVERAGE` dirs** (codex pass-3 #1) — `inputDir` is for re-reading MCR's own `raw` report dirs (that's Phase 3, a different input shape). `sourceMap: true` remaps each `dist-electron/main/*.cjs` to `electron/*.ts` via its sibling `.cjs.map` (the spike confirmed `sources: ['../../electron/*.ts']` + `sourcesContent: true`, so the remap is self-contained — codex #3); `entryFilter`/`sourceFilter` keep only `electron/**`; `reports: ['raw']` writes `coverage/e2e-electron/raw/` for the Phase 3 merge. The script **fails if no `electron/main.ts` entry is present** (codex #6) — asserting the booted-app path was actually measured, not silently empty.
4. Electron **unit** coverage is already delivered by Phase 0 (`vitest.config.electron --coverage`); Phase 2 adds only the booted-app delta (`main.ts`). Do NOT also collect `page.coverage` on the Electron renderer — it loads the same web bundle already measured by Phase 1 (double-count).

### Phase 3 — Merge, report, gate

1. **One engine owns the merge: `monocart-coverage-reports` (codex #5, #9).** `scripts/coverage-merge.mjs` (or the `mcr merge` CLI): `const mcr = new CoverageReport({ inputDir: ['coverage/e2e-web/raw', 'coverage/e2e-electron/raw'], sourceMap: true, sourcePath, entryFilter, sourceFilter, outputDir: 'coverage/merged', reports: ['v8','lcovonly','json-summary','console-details'] })`, then fold in the Phase-0 unit data — `for (const f of unitJsons) { await mcr.add(JSON.parse(readFileSync(f, 'utf8'))) }` — and `await mcr.generate()`. Here `inputDir` IS correct: these are MCR `raw` report dirs from Phases 1-2 (contrast Phase 2's `addFromDir` for Node V8 dirs — codex pass-3 #1). `.add()` accepts a V8 array OR an Istanbul `coverage-final.json` object, and `sourcePath(filePath, info)` is the documented signature (codex pass-3 #2). No `lcov-result-merger` / `nyc` / hand-rolled istanbul glue — those eat incompatible formats and double-count; monocart does V8→Istanbul + merge natively.
2. **Path normalization IS the merge config, not a separate gate (codex #4).** `sourceFilter` rejects `**/node_modules/**`, `**/dist-electron/**`, `**/.next/**` and keeps `**/src/**` + `**/electron/**`; `sourcePath` collapses build-prefix variants so the same file from unit / e2e-web / e2e-electron unifies to one repo-relative key. A stray unmatched path shows up in the report's file list (asserted in AC), rather than silently miscounted.
3. CI: upload the merged report (`coverage/merged/`) as an artifact (and optionally a PR-comment summary via monocart's `json-summary`). Add a **threshold gate** whose numbers are set from the measured baseline (see Open Decision).
4. `.gitignore` already ignores `/coverage` — confirm it also covers `coverage/.monocart` and the per-launch raw V8 temp dirs (codex #8).

## Spike (evidence the Phase 2 mechanism works)

Run this session against the real built main bundle:

```text
[spike] main entry exists: true
[spike] main sourcemap exists: true            # dist-electron/main/index.cjs.map (124 KB)
[spike] firstWindow resolved
[spike] app closed cleanly
[spike] coverage files written: 1
[spike] total script entries across files: 487
[spike] entries referencing main bundle: 23    # index.cjs, ConfigManager.cjs, constants.cjs, ...
[spike] RESULT: VIABLE — main-process coverage captured
```

`NODE_V8_COVERAGE` is honored by Electron's main process; a clean `app.close()`
flushes; electron-vite's per-module `.cjs.map` makes it source-mappable. That this
raw V8 + `.cjs.map` feeds straight into `monocart-coverage-reports` (its documented
`NODE_V8_COVERAGE` → `addFromDir` + `sourceMap` path) was Context7-verified against
the tool's README, closing codex #9. No fallback (e.g. giving `main.ts` a hand-written
unit harness) is needed — though that remains the documented alternative if
source-map fidelity proves poor in CI.

## Open Decision — TARGET threshold (Phase 0 baseline now MEASURED)

**The coverage TARGET.** "100%" in the issue title is a direction, not a spec.
Literal 100% across a Next.js + Electron app forces tests for unreachable error
branches, defensive `default:` arms, and platform-guarded code, which is low-value
busywork. The realistic question is what threshold CI should enforce.

**Phase 0 baseline (measured this session via `pnpm coverage:unit`):**

| Surface          | Statements | Lines  | Notable                                   |
| ---------------- | ---------- | ------ | ----------------------------------------- |
| Unit web (`src`) | 37.28%     | 37.62% | 734 tests                                 |
| Unit electron    | 25.87%     | 25.78% | **`main.ts` 0% (0/842)** ← Phase 2 target |

The `main.ts`-at-0% premise from the #129 context is now confirmed with data: the
387 electron unit tests never execute the 842-line entry point (next worst real
files: `MenuManager` 30%, `SystemTrayManager` 32%). Phases 1-3 lift the number once
E2E + booted-app coverage merge in; these unit figures are the floor the ratchet
starts from.

**Recommended default (so the pipeline is not blocked):** _ratchet-from-baseline_.
Phase 3 sets the CI threshold equal to the measured baseline (per-metric) and fails
the build on any regression; literal 100% is an explicit **non-goal** for v1 and a
documented stretch. This delivers the issue's real value (you can measure coverage
and it can only go up) without weeks of chasing unreachable lines. The user can
override the target once the baseline is on screen — changing the threshold is a
one-line edit, so this decision is cheap to revisit and does not gate the build-out.

## Acceptance Criteria

1. `pnpm coverage:unit` produces Istanbul JSON + lcov for the web + electron vitest configs and a printed text-summary, with `electron/main.ts` showing a real (non-fabricated) number. **DONE + measured this session** (Open Decision baseline). Storybook (browser-mode) coverage is best-effort — its component surface overlaps web unit + web E2E, so it is not a v1 gate.
2. A `COVERAGE=1` web E2E run (against the source-map build) produces raw V8 under `coverage/e2e-web/raw/` whose merged report lists `src/**` files (not minified `/_next/static/...`), with monocart-reporter coexisting with the existing pass/fail suite (no flake, no shard-merge dependency).
3. A `COVERAGE=1` Electron E2E run produces raw V8 under `coverage/e2e-electron/raw/` whose merged report includes `electron/main.ts` with non-zero covered lines; the post-process step hard-fails if that entry is absent, proving the booted-app path is measured.
4. `pnpm coverage:merge` produces one `coverage/merged/` report (v8 HTML + lcov + json-summary) combining unit + both E2E sources via `monocart-coverage-reports`, with `sourceFilter` keeping only `src/**` + `electron/**` (no `node_modules` / `dist-electron` / `.next` keys in the file list). **After `sourcePath` unification, `electron/main.ts` and any manager file shared between electron-unit and booted-app coverage each appear EXACTLY ONCE** — merged by normalized path, not double-listed as `electron/*` vs `dist-electron/main/*` (codex pass-3 #3).
5. A CI job publishes the merged summary as an artifact and enforces the agreed threshold (baseline-ratchet by default); the existing sharded web E2E and electron E2E gates are unchanged and still green.
6. Default runs without `COVERAGE=1` do NOT write coverage caches (no multi-GB `.cache` growth) and do NOT emit production source maps; documented in CLAUDE.md.
7. `coverage/` is git-ignored. No production code behavior changes.

## Testing Plan

| Layer       | What                                                                                                                                              | Count |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Unit        | `electron-coverage-report.mjs`: monocart `CoverageReport` over a fixture `NODE_V8_COVERAGE` dir yields a `main.ts` entry & hard-fails when absent | +2-3  |
| Unit        | coverage fixture gating (`COVERAGE=1` collects, unset skips)                                                                                      | +1-2  |
| Unit        | merge `sourceFilter` excludes `node_modules` / `dist-electron` / `.next`, keeps `src` + `electron`                                                | +1    |
| Integration | `pnpm coverage:unit` exits 0 and writes the three Istanbul JSON files                                                                             | +1    |
| E2E (meta)  | one electron spec under `COVERAGE=1` yields a non-empty `main.ts` entry                                                                           | +1    |

The instrument is itself code, so it gets tested — but the "tests" here are mostly
asserting the report files exist and contain expected source paths, not re-deriving
coverage math (that's monocart/v8's job).

## Files Reference

| File                                         | Change                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                               | add devDeps `monocart-reporter@2.11.3` + `monocart-coverage-reports`; add `coverage:unit`/`coverage:e2e`/`coverage:merge` scripts |
| `vitest.config.ts`                           | add `test.coverage` (v8, json + lcov, exclude list)                                                                               |
| `vitest.config.electron.ts`                  | add `test.coverage`                                                                                                               |
| `vitest.config.storybook.ts`                 | add `test.coverage`                                                                                                               |
| `next.config.js`                             | env-gated `productionBrowserSourceMaps: process.env.COVERAGE === '1'` (codex #1)                                                  |
| `playwright.config.ts` (+ coverage variant)  | monocart-reporter behind a `COVERAGE=1` branch (emits `raw` V8 + lcovonly)                                                        |
| `e2e/web/_helpers/coverage.ts` (new)         | auto-fixture porting gitbox's `page.coverage` collector (gated on `COVERAGE=1`)                                                   |
| `e2e/web/*.spec.ts` (10 files)               | import `{ test, expect }` from the fixture                                                                                        |
| `e2e/electron/_helpers/launch.ts:46-56`      | inject `NODE_V8_COVERAGE` into the launch env under `COVERAGE=1`                                                                  |
| `scripts/electron-coverage-report.mjs` (new) | monocart `CoverageReport` over `NODE_V8_COVERAGE` dirs → `raw` (sourceMap-remapped to `electron/*.ts`); fails if no `main.ts`     |
| `scripts/coverage-merge.mjs` (new)           | monocart `CoverageReport` merge (`inputDir` raw + `.add()` unit istanbul) → `coverage/merged/`                                    |
| `.github/workflows/*`                        | new non-sharded `e2e-web-coverage` job (`COVERAGE=1`) + merge/threshold step; repoint Codecov `files:` (codex #10)                |
| `.gitignore`                                 | already ignores `/coverage`; confirm `coverage/.monocart` + raw temp dirs covered                                                 |
| `CLAUDE.md`                                  | document `pnpm coverage:*` + the `COVERAGE=1`-gated local behavior                                                                |

## Effort Estimate

- Phase 0 unit: ~1h (config blocks + scripts + run).
- Phase 1 web E2E: ~3h (dep, fixture, 10 import edits, monocart config, CI job).
- Phase 2 electron: ~3h (launch.ts env, post-process script + source-map merge, spec close-path audit).
- Phase 3 merge/gate/CI: ~2h.
- Tests for the instrument + docs: ~2h. Total ~11h (CC-compressed: a few iterations).

## Out of Scope

- **Driving coverage up by writing product tests.** This issue delivers the meter; raising the number is follow-up work (and gated on the target decision).
- **Coverage of the Electron renderer as a distinct surface** — it is the web app; web E2E covers it.
- **A coverage SaaS (Codecov/Coveralls) integration** — artifact + PR-comment summary is enough for v1; a hosted service can come later.
- **Any `v*` release tag** — orthogonal to this work and separately gated.

## Rollback

Pure additive tooling. Rollback = revert the PR: scripts, configs, the fixture, the
launch-env line, and the CI job all disappear; the existing sharded E2E gates and
unit suites are untouched throughout, so nothing user-facing or release-blocking
depends on this. The `COVERAGE=1` gating means even a half-applied state is inert
on normal local + CI runs.

## Dependency Graph / Sequencing

```text
Phase 0 (unit) ──┐
                 ├─> Phase 3 (merge + report + CI threshold)
Phase 1 (web) ───┤
Phase 2 (elec) ──┘
```

Phase 0 first (cheapest, instantly reveals the `main.ts` gap and the baseline).
Phases 1 and 2 are independent of each other. Phase 3 needs at least Phase 0 to
produce a meaningful merged number; it can land incrementally as 1 and 2 arrive.

## Related

- #125 / PR #129 — the `main.ts` shadow-harness gap that motivated AC#1's "real number" clause.
- `laststance/gitbox` — `playwright.config.ts` + `e2e/fixtures/coverage.ts` (the ported technique).

## As-Built Notes (what shipped, and where it deviates from the spec above)

The plan above was written before implementation; these are the corrections the
build surfaced. Where they conflict, **this section is authoritative.**

1. **The merge is TWO-STAGE Istanbul, not a single V8 merge.** monocart cannot
   V8-merge a file measured by BOTH a V8 source (E2E `page.coverage` /
   `NODE_V8_COVERAGE`) and an Istanbul source (vitest's `coverage-final.json`):
   the V8 merge path iterates `scriptCov.functions`, which Istanbul-shaped entries
   lack (V8→Istanbul conversion is automatic; Istanbul→V8 is not — Istanbul has no
   raw script coverage). Empirically this throws `scriptCov.functions is not
iterable`. So `scripts/coverage-merge.mjs` does: **Stage 1** — merge the E2E
   `raw` V8 dirs (`inputDir`) into one Istanbul `coverage-final.json`; **Stage 2** —
   `.add()` that E2E Istanbul + the two unit Istanbul files (ALL Istanbul) and
   generate. Reports are `html` (Istanbul) + `lcovonly` + `json-summary` +
   `console-details` (not the v8 HTML the plan named — stage 2 has no V8 data).
   Verified: `electron/main.ts` appears exactly once; zero `dist-electron` /
   `_next` / `node_modules` keys (AC#4).

2. **First-party filtering is on-disk existence, not globs (`scripts/coverage-source-filter.mjs`).**
   A `**/src/**` glob cannot isolate corelive code: third-party libs ship source
   maps that expand to bare `src/…` paths — lucide-react alone leaks **1703**
   `src/icons/*` entries, plus @tanstack (`src/useQuery.ts`, `src/client/*`) and
   Next (`src/providers/*`). The filter normalizes each path (strips `_N_E/`,
   `webpack://`, and an absolute repo-root prefix → the same key vitest emits) and
   keeps it only if the file exists under `src/`/`electron/` AND is not a
   test/story/type (mirroring the Phase 0 unit excludes, so unit + E2E describe one
   universe). The `src/providers` collision (corelive HAS it; Next's internal
   `src/providers/*` does not exist at that path) is why existence beats a
   prefix-exclude list. Unit-tested in `scripts/coverage-source-filter.test.mjs`.

3. **Web E2E entryFilter = same-origin Next chunks only; CSS coverage dropped.**
   Map-less entries (cross-origin Clerk CDN bundles, the HTML document) never reach
   `sourceFilter`, so they are dropped at `entryFilter` instead. CSS coverage was
   removed from the fixture: Next/Tailwind emit no CSS source maps back to `src/`,
   so it mapped to nothing first-party — pure noise.

4. **Playwright bumped `1.60.0`→`1.61.1`.** `monocart-reporter@2.11.3` is
   realm-coupled to Playwright and threw "two different versions of
   `@playwright/test`" during collection on 1.60.0 (gitbox pairs it with `^1.61.1`).
   The bump cleared it; full web + electron E2E suites re-validated green on 1.61.1.

5. **CI scope split (`coverage.yml`): unit + web E2E on Linux; electron E2E stays
   local/macOS.** A dedicated non-sharded job runs `coverage:unit` + `coverage:e2e:web`
   - `coverage:merge` and uploads ONE merged report to Codecov (flag `merged`) +
     an artifact. The merge gracefully skips the absent `coverage/e2e-electron/raw`
     on Linux — Electron is a macOS-native product and Linux+xvfb does not exercise
     its Cocoa paths, so booted-app `main.ts` coverage is measured LOCALLY via
     `pnpm coverage:e2e:electron` (electron _unit_ coverage IS in CI). **codex #10**
     is fixed by consolidation: `test.yml`'s broken `./coverage/lcov.info` upload is
     removed (not repointed) so `coverage.yml` is the single Codecov source.

6. **Threshold is report-only by default.** `coverage-merge.mjs` exits 0 regardless
   of the number unless `COVERAGE_MIN_LINES`/`_STATEMENTS`/`_FUNCTIONS`/`_BRANCHES`
   are set (CI ratchet = a one-line env edit, deferred per the Open Decision).

### Commands (as-built)

| Command                      | Does                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `pnpm coverage:unit`         | vitest v8 coverage for web + electron → `coverage/unit-*/`                        |
| `pnpm coverage:e2e:web`      | `COVERAGE=1` source-map build + full web suite → `coverage/e2e-web/raw/`          |
| `pnpm coverage:e2e:electron` | `COVERAGE=1` electron suite (booted-app `main.ts`) → `coverage/e2e-electron/raw/` |
| `pnpm coverage:merge`        | two-stage Istanbul merge of all of the above → `coverage/merged/`                 |
| `pnpm coverage:all`          | the four above in sequence                                                        |

`COVERAGE` is unset on normal runs: no source maps, no `page.coverage`, no
`NODE_V8_COVERAGE` — the gating suites and dev/build are untouched (AC#6).

### Measured merged baseline

Full `pnpm coverage:all` on macOS (unit web+electron, web E2E ×10 specs, electron
E2E booted-app), 289 first-party files:

| Metric     | Merged % |
| ---------- | -------- |
| Lines      | 32.42%   |
| Statements | 32.41%   |
| Functions  | 27.99%   |
| Branches   | 27.30%   |

These are the numbers a CI ratchet would floor against (set `COVERAGE_MIN_*` on the
`coverage:merge` step). The figure is the union: a line covered by unit OR any E2E
surface counts once. `electron/main.ts`, measured only by the booted-app E2E, appears
exactly once at its real (non-zero) number — the #129 shadow-harness premise, now
data-backed.
