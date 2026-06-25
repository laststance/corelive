/// <reference types="vitest/config" />
import path from 'node:path'

import { defineConfig } from 'vitest/config'

// Unit tests configuration only
export default defineConfig({
  test: {
    name: 'unit',
    environment: 'happy-dom',
    globals: true,
    include: [
      'src/**/*.{spec,test}.{js,jsx,ts,tsx}',
      'src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    ],
    exclude: ['src/types/__tests__', 'src/**/*.stories.{js,jsx,ts,tsx}'],
    setupFiles: ['setupTests.ts'],
    // Coverage (#127): v8 provider, per-surface repo-relative reportsDirectory;
    // `all: true` so untested files (incl. 0% ones) appear in the baseline.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json', 'lcov'],
      reportsDirectory: 'coverage/unit-web',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.stories.{ts,tsx}',
        'src/types/**',
        '**/*.d.ts',
      ],
      all: true,
    },
  },
  resolve: {
    // Mirror tsconfig `paths`: `@/electron/*` -> ./electron/*, `@/*` -> ./src/*.
    // The `@/electron` entry MUST come first so vite's prefix match resolves it
    // before the broader `@` alias (which would otherwise rewrite it to
    // ./src/electron and fail). Renderer code legitimately runtime-imports from
    // electron/ (e.g. isFloatingNavigatorEnvironment, the shared IPC default).
    alias: {
      '@/electron': path.resolve(__dirname, './electron'),
      '@': path.resolve(__dirname, './src'),
    },
  },
})
