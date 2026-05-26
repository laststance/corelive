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
