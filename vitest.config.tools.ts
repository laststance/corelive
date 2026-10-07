import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.{ts,mjs}', 'apps/web/scripts/**/*.test.mjs'],
    testTimeout: 10000,
  },
})
