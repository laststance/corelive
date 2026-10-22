import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Concurrent workspace suites must not clear each other's transformed modules.
    fsModuleCachePath: new URL('./node_modules/.vitest-dslint', import.meta.url)
      .pathname,
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
