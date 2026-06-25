/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

// Electron tests configuration
export default defineConfig({
  test: {
    name: 'electron',
    environment: 'node',
    globals: true,
    include: [
      'electron/**/*.{spec,test}.{js,jsx,ts,tsx,cjs,mjs}',
      'electron/**/__tests__/**/*.{js,jsx,ts,tsx,cjs,mjs}',
    ],
    exclude: ['electron/node_modules/**'],
    setupFiles: [],
    testTimeout: 10000,
    // Coverage (#127): surfaces booted-app-only files like main.ts at 0% in the
    // baseline (`all: true` includes untested electron sources).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json', 'lcov'],
      reportsDirectory: 'coverage/unit-electron',
      // `include` is the explicit allowlist; in vitest 4 this also pulls in
      // untested files (e.g. main.ts at 0%), which is the old `all: true` behavior.
      include: ['electron/**/*.ts'],
      exclude: [
        'electron/**/*.{test,spec}.{ts,cts,mts}',
        'electron/**/__tests__/**',
        'electron/node_modules/**',
        '**/*.d.ts',
      ],
    },
  },
  esbuild: {
    target: 'node18',
  },
})
