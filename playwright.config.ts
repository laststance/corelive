import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BUILD_ID_PATH = join(__dirname, '.next', 'BUILD_ID')

// APP_URL: The base URL for the web app (set via npm scripts or defaults to localhost)
const APP_URL = process.env.APP_URL || 'http://localhost:3011'

if (!existsSync(BUILD_ID_PATH)) {
  execSync('pnpm build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: 'e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Limit workers to 50% CPU cores to prevent resource saturation (community best practice) */
  workers: process.env.CI ? 1 : Math.max(1, Math.floor(cpus().length / 2)),
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    // Use "dot" reporter on CI, "list" otherwise (Playwright default).
    process.env.CI ? ['html'] : ['list'],
    // Add Argos reporter.
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
    baseURL: APP_URL,
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

    // Electron desktop integration tests
    {
      name: 'electron',
      testMatch: /.*electron.*\.spec\.ts/,
      // Run electron tests sequentially to avoid singleton lock conflicts
      workers: 1,
      use: {
        // Electron-specific configuration
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        // Electron tests handle auth via IPC mocking, not web cookies
        // No storageState needed - tests accept both login and authenticated states
      },
      // No dependencies - Electron tests run independently with their own auth handling
    },
  ],

  // One-time hooks
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  webServer: {
    command: 'NODE_ENV=test pnpm start',
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'test',
    },
  },
})
