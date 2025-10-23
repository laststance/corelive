// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format

import { defineConfig } from 'eslint/config'
import tsPrefixer from 'eslint-config-ts-prefixer'
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect'
// import storybook from 'eslint-plugin-storybook'

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
    ],
  },
  ...tsPrefixer,
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
])
