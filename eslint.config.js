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
      '_trials/**',
    ],
  },
  ...tsPrefixer,
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Enforce typed IPC wrappers: raw `ipcMain.handle(...)` is forbidden outside
  // the single `typedHandle` implementation. Same goes for raw
  // `webContents.send(...)` — use `typedSend` so the payload tracks `IPCEventChannels`.
  //
  // Why: raw APIs bypass the `IPCChannels` contract and the `IPC_ARG_SCHEMAS`
  // Zod runtime validation, which together are how we enforce that any value
  // crossing the main/renderer boundary is typed + sanitized.
  {
    files: ['electron/**/*.ts', 'electron/**/*.tsx'],
    ignores: [
      'electron/ipc/typedHandle.ts',
      'electron/ipc/typedInvoke.ts',
      'electron/ipc/typedSend.ts',
      'electron/auth-manager.ts', // Dead code — see comment at top of file
      'electron/__tests__/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='ipcMain'][callee.property.name='handle']",
          message:
            'Use typedHandle from electron/ipc/typedHandle.ts instead of raw ipcMain.handle — raw handlers bypass IPCChannels contract + Zod validation.',
        },
        {
          selector:
            "CallExpression[callee.object.name='ipcRenderer'][callee.property.name='invoke']",
          message:
            'Use typedInvoke from electron/ipc/typedInvoke.ts instead of raw ipcRenderer.invoke — raw invokes bypass IPCChannels contract.',
        },
        {
          selector:
            "CallExpression[callee.property.name='send'][callee.object.property.name='webContents']",
          message:
            'Use typedSend from electron/ipc/typedSend.ts instead of raw webContents.send — raw sends bypass IPCEventChannels contract.',
        },
      ],
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
