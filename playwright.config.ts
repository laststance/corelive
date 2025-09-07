import { defineConfig, devices } from '@playwright/test'

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
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'list',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',
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
      use: {
        // Electron-specific configuration
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        // Use prepared auth state from setup
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'], // Ensure setup runs first for electron tests too
    },
  ],

  // One-time hooks
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  /* Run your local dev server before starting the tests */
  webServer: {
    // Start the dev server for testing
    command: 'NODE_ENV=test pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'test',
    },
  },
})
