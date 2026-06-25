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

#127 points at **`laststance/gitbox`** for "how to obtain E2E coverage." That repo
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
wire a `test.coverage` block into all three vitest configs and add scripts:

- `coverage:unit` → `vitest run --coverage` (web/src) + `vitest run --config vitest.config.electron.ts --coverage` + storybook config.
- Each config gets a `test.coverage` block: `provider: 'v8'`, `reporter: ['text-summary','json','lcov']`, `reportsDirectory: coverage/unit-<name>`, and an `exclude` list (configs, `*.stories.tsx`, `*.test.*`, `*.spec.*`, generated files, `dist*`). The `json` reporter is the Istanbul `coverage-final.json` that Phase 3 `add()`s into the monocart merge; `lcov` is for human diffing.
- Output per config: `coverage/unit-<web|electron|storybook>/coverage-final.json` (canonical) + `lcov.info`.
- **Repoint the existing Codecov upload (codex #10).** `test.yml` currently uploads `./coverage/lcov.info`, which Phase 0 stops emitting (reportsDirectory moves to `coverage/unit-<name>`). Point the Codecov step at the merged report (Phase 3) or the per-config lcovs so the upload stops silently matching nothing.

This alone answers "what % of `src/` and `electron/` do the 1100+ unit tests
cover?" and surfaces the `main.ts`-at-0% fact immediately.

### Phase 1 — Web E2E coverage (port gitbox)

1. Add devDeps `monocart-reporter@2.11.3` (the Playwright reporter, gitbox-proven) and `monocart-coverage-reports` (its engine — a direct dep so the Phase 2/3 standalone scripts + the `mcr` CLI can use it outside Playwright). Run `pnpm add -D monocart-reporter@2.11.3 monocart-coverage-reports` and record the peer-compat result against `@playwright/test ^1.60.0` in this doc — gitbox pairs it with `^1.61.1`, so 1.60 is the one unverified delta (codex #7). Playwright 1.60's `page.coverage.startJSCoverage/startCSSCoverage` API is present (Chromium-only) and unchanged across 1.60→1.61.
2. New fixture `e2e/web/_helpers/coverage.ts` (mirrors gitbox's `e2e/fixtures/coverage.ts`): an `auto` fixture that, **gated on `process.env.COVERAGE === '1'`** (NOT `CI` — every existing sharded gate job already runs with `CI=true`, so a `CI` gate would fire coverage inside the pass/fail suite too, codex #2) and Chromium projects only, runs `page.coverage.startJSCoverage({resetOnNavigation:false})` + `startCSSCoverage`, then on teardown stops both and calls `addCoverageReport([...js,...css], testInfo)`. The `COVERAGE` gate also prevents the multi-GB `.cache` bloat gitbox documents on normal local/CI runs.
3. The 10 web specs change their import from `@playwright/test` to the fixture: `import { test, expect } from './_helpers/coverage'` (preserve `type Page` from `@playwright/test` where used).
4. **Browser source maps are mandatory and OFF by default (codex #1, Blocker).** corelive runs web E2E against a PRODUCTION build (`pnpm build` + `pnpm start`, `playwright.config.ts:137`) and has no Sentry, so by default `page.coverage` only sees minified `/_next/static/chunks/*.js` and maps to nothing under `src/**`. Add env-gated `productionBrowserSourceMaps: process.env.COVERAGE === '1'` to `next.config.js` and rebuild inside the coverage job; a Phase-1 assertion greps the emitted report for `SF:src/` and fails the job if absent. Normal builds keep the flag off (no `.map` emission → no bundle-size or source-leak surface in prod).
5. A coverage-only Playwright config (gated on `COVERAGE=1`) registers `monocart-reporter` with a coverage block emitting `['raw']` (V8) into `coverage/e2e-web/raw/` for the Phase 3 merge, plus `['lcovonly']` for a standalone human-readable view, scoped via `entryFilter`/`sourceFilter`/`sourcePath` to corelive globs (include `src/app`, `src/components`, `src/lib`, `src/hooks`; exclude server-only routes, `*.config.*`, tests, stories). Point monocart's cache + output at `coverage/.monocart`, cleaned before each run (codex #8). The raw V8 is source-map-remapped + normalized during the Phase 3 merge, not here.
6. **CI: a dedicated, NON-sharded `e2e-web-coverage` job, gated on `COVERAGE=1`.** The existing per-spec matrix shards stay the pass/fail gate, untouched and coverage-free. A separate job runs the full web E2E once with `COVERAGE=1` (+ the source-map build) and emits raw V8 under `coverage/e2e-web/raw/`. Because the fixture and reporter gate on `COVERAGE` not `CI` (codex #2), the gate shards never collect coverage — only this job does. Tradeoff vs gitbox's per-shard+merge: one extra full E2E run, accepted to avoid a fragile cross-shard monocart merge and any gate-suite drift.

### Phase 2 — Electron main-process coverage (spike-confirmed)

1. In `e2e/electron/_helpers/launch.ts`, when **`process.env.COVERAGE === '1'`** (NOT `CI` — the Electron CI job is a pass/fail gate, and turning coverage on there changes its runtime + output volume, codex #6), add `NODE_V8_COVERAGE: <perLaunchDir>` to the `electron.launch` env block. Each launch writes raw V8 JSON for the main process to its own dir.
2. Specs already `await electronApp.close()` — the clean exit that flushes V8 coverage. Audit each spec to ensure no path SIGKILLs the app before close (the spike confirmed a normal close flushes).
3. Post-process (`scripts/electron-coverage-report.mjs`): run `monocart-coverage-reports`' `CoverageReport` over the per-launch `NODE_V8_COVERAGE` dirs with `inputDir: [<dirs>]`, `sourceMap: true` (the spike confirmed each `dist-electron/main/*.cjs` has a sibling `.cjs.map` carrying `sources: ['../../electron/*.ts']` + `sourcesContent: true`, so the remap to `electron/*.ts` is self-contained — codex #3), `entryFilter`/`sourceFilter` keeping only `electron/**`, and `reports: ['raw']` → `coverage/e2e-electron/raw/` for the merge. The script **fails if no `electron/main.ts` entry is present** (codex #6) — asserting the booted-app path was actually measured, not silently empty. Same tool as Phase 1, so the remap/normalize semantics are identical across both E2E sources.
4. Electron **unit** coverage is already delivered by Phase 0 (`vitest.config.electron --coverage`); Phase 2 adds only the booted-app delta (`main.ts`). Do NOT also collect `page.coverage` on the Electron renderer — it loads the same web bundle already measured by Phase 1 (double-count).

### Phase 3 — Merge, report, gate

1. **One engine owns the merge: `monocart-coverage-reports` (codex #5, #9).** `scripts/coverage-merge.mjs` (or the `mcr merge` CLI) constructs one `CoverageReport({ inputDir: ['coverage/e2e-web/raw', 'coverage/e2e-electron/raw'], sourceMap: true, sourcePath, entryFilter, sourceFilter, outputDir: 'coverage/merged', reports: ['v8','lcovonly','json-summary','console-details'] })`, then `.add()`s each Phase-0 vitest `coverage-final.json` (monocart accepts Istanbul input alongside V8) and `.generate()`s. No `lcov-result-merger` / `nyc` / hand-rolled istanbul glue — those eat incompatible formats and double-count; monocart does V8→Istanbul + merge natively.
2. **Path normalization IS the merge config, not a separate gate (codex #4).** `sourceFilter` rejects `**/node_modules/**`, `**/dist-electron/**`, `**/.next/**` and keeps `**/src/**` + `**/electron/**`; `sourcePath` collapses build-prefix variants so the same file from unit / e2e-web / e2e-electron unifies to one repo-relative key. A stray unmatched path shows up in the report's file list (asserted in AC), rather than silently miscounted.
3. CI: upload the merged report (`coverage/merged/`) as an artifact (and optionally a PR-comment summary via monocart's `json-summary`). Add a **threshold gate** whose numbers are set from the measured baseline (see Open Decision).
4. `.gitignore` already ignores `/coverage` — confirm it also covers `coverage/.monocart` and the per-launch raw V8 temp dirs (codex #8).

## Spike (evidence the Phase 2 mechanism works)

Run this session against the real built main bundle:

```
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
`NODE_V8_COVERAGE` + `inputDir` + `sourceMap` path) was Context7-verified against the
tool's README, closing codex #9. No fallback (e.g. giving `main.ts` a hand-written
unit harness) is needed — though that remains the documented alternative if
source-map fidelity proves poor in CI.

## Open Decision (deferred until baseline exists)

**The coverage TARGET.** "100%" in the issue title is a direction, not a spec.
Literal 100% across a Next.js + Electron app forces tests for unreachable error
branches, defensive `default:` arms, and platform-guarded code, which is low-value
busywork. The realistic question — what threshold CI should enforce — **cannot be
answered before Phase 0/1 print the baseline number.**

**Recommended default (so the pipeline is not blocked):** _ratchet-from-baseline_.
Phase 3 sets the CI threshold equal to the measured baseline (per-metric) and fails
the build on any regression; literal 100% is an explicit **non-goal** for v1 and a
documented stretch. This delivers the issue's real value (you can measure coverage
and it can only go up) without weeks of chasing unreachable lines. The user can
override the target once the baseline is on screen — changing the threshold is a
one-line edit, so this decision is cheap to revisit and does not gate the build-out.

## Acceptance Criteria

1. `pnpm coverage:unit` produces Istanbul JSON + lcov for all three vitest configs and a printed text-summary, with `electron/main.ts` showing a real (non-fabricated) number.
2. A `COVERAGE=1` web E2E run (against the source-map build) produces raw V8 under `coverage/e2e-web/raw/` whose merged report lists `src/**` files (not minified `/_next/static/...`), with monocart-reporter coexisting with the existing pass/fail suite (no flake, no shard-merge dependency).
3. A `COVERAGE=1` Electron E2E run produces raw V8 under `coverage/e2e-electron/raw/` whose merged report includes `electron/main.ts` with non-zero covered lines; the post-process step hard-fails if that entry is absent, proving the booted-app path is measured.
4. `pnpm coverage:merge` produces one `coverage/merged/` report (v8 HTML + lcov + json-summary) combining unit + both E2E sources via `monocart-coverage-reports`, with `sourceFilter` keeping only `src/**` + `electron/**` (no `node_modules` / `dist-electron` / `.next` keys in the file list).
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

```
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
