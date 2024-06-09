import path from 'node:path'

import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    reporters: ['html'],
    environment: 'happy-dom',
    globals: true,
    include: [
      'src/**/*.{spec,test}.{js,jsx,ts,tsx}',
      'src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    ],
    setupFiles: ['setupTests.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
