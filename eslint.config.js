// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format

import { defineConfig } from 'eslint/config'
import tsPrefixer from 'eslint-config-ts-prefixer'
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect'

import dslint from './packages/eslint-plugin-dslint/dist/index.js'

export default defineConfig([
  reactYouMightNotNeedAnEffect.configs.recommended,
  {
    ignores: [
      '.next/**',
      'html/**',
      'storybook-static/**',
      'dist/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'dist-electron/**',
      'public/**',
      '.playwright-electron/**',
      '.playwright-mcp/**',
      'packages/**',
    ],
  },
  ...tsPrefixer,
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Design System Lint - デザイントークン準拠を強制
  {
    plugins: { dslint },
    rules: {
      'dslint/token-only': [
        'warn',
        {
          tokenSource: './tailwind.config.ts',
          ignore: [
            // Tailwind modifiers & pseudo-classes
            'animate-*',
            'group',
            'group-*',
            'peer',
            'peer-*',
            'data-*',
            'container',
            // Typography
            'antialiased',
            'subpixel-antialiased',
            // Basic colors
            'text-white',
            'text-black',
            'bg-white',
            'bg-black',
            'border-white',
            'border-black',
            'text-transparent',
            'bg-transparent',
            // Gradients
            'from-*',
            'via-*',
            'to-*',
            'bg-linear-*',
            'bg-gradient-*',
            // Electron window controls
            'window-drag-region',
            'no-drag',
            'drag-handle',
            // Custom animation CSS classes (defined in animations.css)
            'achievement-*',
            'level-up-*',
            'confetti-*',
            'floating-navigator-*',
            // Tailwind default color palette (temporary - will migrate to tokens)
            'text-red-*',
            'text-blue-*',
            'text-gray-*',
            'text-green-*',
            'text-yellow-*',
            'bg-red-*',
            'bg-blue-*',
            'bg-gray-*',
            'bg-green-*',
            'bg-yellow-*',
            'border-red-*',
            'border-blue-*',
            'border-gray-*',
            'border-green-*',
            'border-t-*',
            'border-r-*',
            'border-b-*',
            'border-l-*',
            // Custom size utilities
            'h-100',
            // Test file patterns
            'custom-*',
          ],
        },
      ],
    },
    // shadcn/ui, Storybook, packages, tests は除外
    ignores: [
      'src/components/ui/**',
      '**/*.stories.tsx',
      '**/*.stories.ts',
      'packages/**',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
  },
])
