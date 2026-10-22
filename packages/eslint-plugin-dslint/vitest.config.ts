import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Concurrent workspace suites must not clear each other's transformed modules.
    fsModuleCachePath: fileURLToPath(
      new URL('./node_modules/.vitest-dslint', import.meta.url),
    ),
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
