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
    exclude: [
      'src/types/__tests__',
      'src/**/*.stories.{js,jsx,ts,tsx}',
      'e2e/**/*.{js,jsx,ts,tsx}',
    ],
    setupFiles: ['setupTests.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
