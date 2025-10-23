/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

// Storybook tests configuration
export default defineConfig({
  plugins: [
    storybookTest({
      configDir: path.join(dirname, '.storybook'),
    }),
  ],
  define: {
    // Define __dirname for modules that expect it in ESM mode
    __dirname: JSON.stringify(dirname),
  },
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
        },
      ],
    },
    setupFiles: ['.storybook/vitest.setup.ts'],
    // テストタイムアウトを延長
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    // 依存関係の事前解決でテストの安定性を向上
    globals: true,
    // ブラウザテスト用の追加設定
    reporters: 'verbose',
  },
  resolve: {
    alias: {
      '@': './src/*',
    },
  },
  optimizeDeps: {
    // 必要な依存関係をすべて含めてテストの安定性を確保
    include: [
      'sb-original/default-loader',
      'sb-original/image-context',
      '@mdx-js/react',
      'markdown-to-jsx',
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@storybook/addon-vitest/vitest-plugin',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'lucide-react',
      '@radix-ui/react-slot',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      'recharts',
      'date-fns',
      'react-day-picker',
      'react-hook-form',
      '@hookform/resolvers',
      'zod',
      'next-themes',
      'sonner',
      'vaul',
      'react-resizable-panels',
      'embla-carousel-react',
      'input-otp',
      'cmdk',
    ],
  },
  esbuild: {
    // ESBuildの設定でテストの安定性を向上
    target: 'es2020',
    // ソースマップを有効化してデバッグを容易に
    sourcemap: true,
  },
})
