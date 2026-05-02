import { defineConfig, devices } from '@playwright/test'

import 'dotenv/config'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: 'e2e',
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Force single-worker execution for both local and CI runs.
   *
   * All web E2E tests share one seeded Clerk user (`test@test.com`) and a
   * single PostgreSQL database. Running multiple workers in parallel causes
   * cross-file data races — e.g. `qa-fixes.spec.ts`'s "Clear all completed"
   * test calls the `clearCompleted` procedure which `deleteMany`s every
   * completed todo for the user, cascading into `NodeAssignment` rows. If
   * this races with `skill-tree.spec.ts`, it silently deletes the todos
   * those tests just seeded.
   *
   * `fullyParallel: false` only guarantees serial execution WITHIN a file;
   * different files can still run on separate workers. `workers: 1` is the
   * only way to serialize across files when they share DB state.
   *
   * EXIT CRITERION: this halves CI throughput across the whole suite and
   * should NOT be permanent. The clean fix is per-worker Clerk users so
   * each worker owns its own Prisma user row, making `clearCompleted`
   * naturally scoped to one worker's data. Tracked as a post-v1 follow-up
   * task ("Post-v1: Restore parallel E2E workers via per-worker Clerk
   * users") — once that lands, flip this back to `workers: undefined`. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    // CI uses the "blob" reporter so each matrix shard (one per spec file in
    // `.github/workflows/e2e.web.yml`) writes a `blob-report/` directory that
    // a downstream `merge-reports` job combines into a single HTML report
    // via `playwright merge-reports`. Locally, "list" gives terminal feedback
    // (Playwright default) without producing artifacts. See
    // https://playwright.dev/docs/test-sharding#merging-reports-from-multiple-shards.
    process.env.CI ? ['blob'] : ['list'],
    // Add Argos reporter.
    //
    // NOTE: when `ARGOS_TOKEN` is wired into `.github/workflows/e2e.web.yml`,
    // the matrix-shard workflow will produce one Argos build per spec file
    // unless `ARGOS_PARALLEL_NONCE` and `ARGOS_PARALLEL_TOTAL` are also set
    // so Argos can collate the screenshots into a single review. See
    // https://argos-ci.com/docs/parallel-testing.
    [
      '@argos-ci/playwright/reporter',
      {
        // Upload to Argos on CI only.
        uploadToArgos: !!process.env.CI,
        token: process.env.ARGOS_TOKEN,
      },
    ],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3011',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Ensure test environment is set */
    extraHTTPHeaders: {
      'x-test-environment': 'true',
    },
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup project - runs authentication setup before all tests
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    {
      name: 'web',
      use: {
        ...devices['Desktop Chrome'],
        // Use prepared auth state from setup
        storageState: 'e2e/.auth/user.json',
      },
      testMatch: /^(?!.*electron).*\.spec\.ts$/,
      dependencies: ['setup'], // Run setup project first
    },
  ],

  // One-time hooks
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3011',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
})
