import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'eslint/config'
import tsPrefixer from 'eslint-config-ts-prefixer'
import reactHooks from 'eslint-plugin-react-hooks'
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect'

const rootDirectory = path.dirname(fileURLToPath(import.meta.url))

const config = [
  reactHooks.configs.flat.recommended,
  reactYouMightNotNeedAnEffect.configs.recommended,
  {
    ignores: [
      '**/.next/**',
      '**/html/**',
      '**/dist/**',
      '**/out/**',
      '**/build/**',
      // Vitest coverage writes generated assets that are outside lint scope.
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/dist-electron/**',
      '**/public/**',
      '**/.playwright-mcp/**',
      '_trials/**',
      // Local release and QA artifacts are not application source.
      'tmp/**',
      '.gstack/**',
    ],
  },
  ...tsPrefixer,
  {
    settings: {
      'import-x/resolver': {
        typescript: {
          project: path.join(rootDirectory, 'apps/web/tsconfig.json'),
        },
      },
    },
  },
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
    files: ['apps/desktop/electron/**/*.ts', 'apps/desktop/electron/**/*.tsx'],
    ignores: [
      'apps/desktop/electron/ipc/typedHandle.ts',
      'apps/desktop/electron/ipc/typedInvoke.ts',
      'apps/desktop/electron/ipc/typedSend.ts',
      'apps/desktop/electron/__tests__/**',
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
]

// All app entry configs share repository-relative rule and ignore semantics.
export default defineConfig(
  config.map((item) => ({ ...item, basePath: rootDirectory })),
)
