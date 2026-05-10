import { defineConfig } from '@playwright/test'

import baseConfig from './playwright.config'

/**
 * Playwright config for the Electron E2E suite.
 *
 * Why a separate config file?
 * - The base `playwright.config.ts` uses the `blob` reporter on CI so its
 *   per-spec matrix runners can fan into a `merge-reports` job. The
 *   Electron job is single-job (3 specs at v0, breakeven at ~6) and does
 *   not need that fan-in — emitting HTML directly avoids the merge step.
 * - Trying to switch reporters by `--project` flag inside the base config
 *   does not work: Playwright evaluates `reporter` at config load time,
 *   before the CLI's `--project=electron` is parsed.
 * - This config narrows `projects` to the `electron` project only; the
 *   `setup` and `web` projects are excluded so they don't run during a
 *   `pnpm e2e:electron` invocation.
 *
 * The `webServer`, `use`, `globalSetup`, and other top-level options are
 * inherited unchanged from the base config — `_electron.launch()` still
 * needs Next.js running on `localhost:3011`, and the `webServer` block
 * fires globally for every project including this one.
 */
export default defineConfig({
  ...baseConfig,
  projects: baseConfig.projects?.filter(
    (project) => project.name === 'electron',
  ),
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
})
