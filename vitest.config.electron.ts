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
  },
  esbuild: {
    target: 'node18',
  },
})
