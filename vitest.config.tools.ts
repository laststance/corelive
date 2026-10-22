import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Concurrent workspace suites must not clear each other's transformed modules.
    fsModuleCachePath: fileURLToPath(
      new URL('./node_modules/.vitest-tools', import.meta.url),
    ),
    environment: 'node',
    include: ['scripts/**/*.test.{ts,mjs}', 'apps/web/scripts/**/*.test.mjs'],
    testTimeout: 10000,
  },
})
