import { test as base, expect } from '@playwright/test'
import { addCoverageReport } from 'monocart-reporter'

/**
 * Collect coverage only when explicitly asked (`COVERAGE=1`), so the normal
 * pass/fail web suite + its CI shards run completely untouched.
 */
const COVERAGE_ENABLED = process.env.COVERAGE === '1'

/**
 * Auto-fixture that wraps every web spec to collect V8 JS coverage from the
 * Chromium page and hand it to monocart-reporter (#127 Phase 1, after
 * laststance/gitbox's `e2e/fixtures/coverage.ts`). Gated on `COVERAGE=1` and
 * Chromium only (`page.coverage` is Chromium-only); a no-op otherwise, so it
 * adds nothing to a normal run. Specs opt in by importing `test`/`expect` from
 * here instead of `@playwright/test`. JS only — Next/Tailwind emit no CSS
 * source maps back to `src/`, so CSS coverage maps to nothing first-party and
 * is dropped rather than collected as noise.
 *
 * @example
 * import { test, expect } from './_helpers/coverage'
 */
export const test = base.extend<{ coverageAutoFixture: void }>({
  coverageAutoFixture: [
    async ({ page, browserName }, use) => {
      const collect = COVERAGE_ENABLED && browserName === 'chromium'
      // `resetOnNavigation: false` accumulates across page navigations so a
      // multi-page spec reports the union, not just the final page.
      if (collect) {
        await page.coverage.startJSCoverage({ resetOnNavigation: false })
      }

      await use()

      if (collect) {
        const jsCoverage = await page.coverage.stopJSCoverage()
        await addCoverageReport(jsCoverage, test.info())
      }
    },
    { scope: 'test', auto: true },
  ],
})

export { expect }
