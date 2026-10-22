import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Concurrent workspace suites must not clear each other's transformed modules.
    fsModuleCachePath: new URL('./node_modules/.vitest-tools', import.meta.url)
      .pathname,
    environment: 'node',
    include: ['scripts/**/*.test.{ts,mjs}', 'apps/web/scripts/**/*.test.mjs'],
    testTimeout: 10000,
  },
})
