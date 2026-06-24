import { defineConfig, devices } from '@playwright/test'

import 'dotenv/config'

/**
 * Exempt loopback from any ambient HTTP proxy BEFORE Playwright reads the env.
 *
 * Why this exists (Issue #115): this Mac runs the Bash tool inside a network
 * sandbox (Socket Firewall / `sfw`) that injects `HTTP_PROXY`/`http_proxy=
 * http://127.0.0.1:<dynamic-port>` into every child process to police outbound
 * traffic. Playwright's webServer readiness probe resolves its target through
 * `proxy-from-env` (`getProxyForUrl`), which honors those vars — so the
 * `http://127.0.0.1:4991` probe gets routed through the firewall proxy, which
 * answers **405** (observed BEFORE `next` had even started: only a proxy can
 * 405 a port with no upstream). 405 is >= 400, so the waiter never sees the dev
 * server's real 200 and times out at 120s — `pnpm e2e:web` could not boot
 * locally. (`curl`/bare Node bypassed the proxy → 200, which is why earlier
 * hostname/happy-eyeballs theories looked plausible but were wrong.)
 *
 * Fix: add loopback to NO_PROXY so `getProxyForUrl` returns "" for the probe
 * URL and the waiter connects straight to `next`. EXTERNAL hosts (Clerk,
 * corelive.app) stay absent from NO_PROXY, so they remain proxied and the
 * firewall is still enforced for real outbound traffic. No-op on CI, which sets
 * no proxy at all — there `getProxyForUrl` already returns "" regardless.
 */
// IPv6 loopback is bracketed (`[::1]`, not `::1`): `proxy-from-env` matches
// NO_PROXY entries against the URL's host verbatim, and a URL host keeps its
// brackets, so a bare `::1` entry would never match a `[::1]` probe.
const LOOPBACK_NO_PROXY = 'localhost,127.0.0.1,[::1]'
for (const proxyExemptionKey of ['NO_PROXY', 'no_proxy']) {
  process.env[proxyExemptionKey] = [
    process.env[proxyExemptionKey],
    LOOPBACK_NO_PROXY,
  ]
    .filter(Boolean)
    .join(',')
}

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
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:4991',
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

    /**
     * Electron E2E project — runs `e2e/electron/*.spec.ts`. Each spec
     * launches the compiled Electron main process via Playwright's
     * `_electron.launch` API; there is no Chromium device profile because
     * Electron supplies its own renderer.
     *
     * Auth: v0 specs hit pre-login screens only (no `dependencies: ['setup']`)
     * — Clerk storage-state reuse is a TODO when authenticated specs land.
     *
     * Reporter / runner: `pnpm e2e:electron` invokes
     * `playwright.electron.config.ts` (separate config) so CI can emit a
     * single HTML report without the per-spec blob → merge fan-in that the
     * web suite uses.
     */
    {
      name: 'electron',
      testMatch: /e2e\/electron\/.*\.spec\.ts$/,
    },
  ],

  // One-time hooks
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  webServer: {
    command: 'pnpm start',
    // Probe an IP literal (`127.0.0.1`), not `localhost`: unambiguous IPv4, no
    // dual-stack resolution in the waiter, and it matches the host CI listens
    // on. The loopback-proxy exemption at the top of this file (Issue #115) is
    // what actually lets this probe reach `next` — without it the `sfw` sandbox
    // proxy intercepts the probe and 405s it. `use.baseURL` stays `localhost`
    // (drives Chromium; Clerk dev keys are localhost-scoped).
    url: 'http://127.0.0.1:4991',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
})
