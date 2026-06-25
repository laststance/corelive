import { defineConfig } from '@playwright/test'

import baseConfig from './playwright.config'
import {
  makeFirstPartyFilter,
  makeSourcePath,
} from './scripts/coverage-source-filter.mjs'

// Playwright runs from the repo root; `import.meta.dirname` is this config's
// dir (the repo root) and drives the on-disk first-party existence checks.
const repoRoot = import.meta.dirname

/**
 * #127 Phase 1 — web E2E coverage config.
 *
 * Runs the same web suite as `playwright.config.ts`, but registers
 * monocart-reporter to collect the V8 JS+CSS coverage gathered by the
 * `e2e/web/_helpers/coverage.ts` auto-fixture and emit a `raw` report (for the
 * Phase 3 merge) plus `lcovonly`. Used only by `pnpm coverage:e2e:web` with
 * `COVERAGE=1`; the normal pass/fail gate suite (base config) is untouched, so
 * the per-spec CI shards never pay the coverage cost.
 */
export default defineConfig({
  ...baseConfig,
  // Keep `setup` (auth storageState) + `web`; drop the `electron` project.
  projects: baseConfig.projects?.filter(
    (project) => project.name === 'setup' || project.name === 'web',
  ),
  reporter: [
    ['list'],
    [
      'monocart-reporter',
      {
        name: 'CoreLive Web E2E Coverage',
        outputDir: 'coverage/e2e-web',
        coverage: {
          outputDir: 'coverage/e2e-web',
          // `raw` feeds the Phase 3 merge; `lcovonly` is a standalone view.
          reports: [['raw', { outputDir: 'raw' }], 'lcovonly'],
          // Keep ONLY same-origin Next.js JS chunks. Map-less entries (the
          // cross-origin Clerk CDN bundles, the HTML document) never reach
          // `sourceFilter` — only their own source maps would — so they must be
          // dropped here or they pollute the report as bare URL "sources".
          // Their chunks carry the source maps that expand to `src/…`.
          entryFilter: (entry: { url: string }) =>
            /\/_next\/static\/chunks\/.+\.js(\?|$)/.test(entry.url),
          // Keep ONLY corelive's own sources. A glob like `**/src/**` cannot do
          // this: third-party libs (lucide `src/icons/*`, @tanstack `src/useQuery.ts`,
          // Next `src/providers/*`) expand from source maps to bare `src/…` paths.
          // The shared helper uses on-disk existence as the discriminator and
          // mirrors the Phase 0 unit excludes, so unit + E2E share one universe.
          sourceFilter: makeFirstPartyFilter(repoRoot),
          // Next/webpack sources arrive as `_N_E/./src/...`; normalize to the
          // repo-relative `src/...` key vitest v8 emits, so the merge unions
          // each file instead of double-counting it.
          sourcePath: makeSourcePath(repoRoot),
        },
      },
    ],
  ],
})
