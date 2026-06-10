// Package-local ESLint flat config. The root eslint.config.js intentionally
// ignores `packages/**` (it consumes this package's BUILT output via
// `./dist/index.js`), so the source is linted here instead, reusing the same
// shared base ruleset (eslint-config-ts-prefixer) the app uses.
import { defineConfig } from 'eslint/config'
import tsPrefixer from 'eslint-config-ts-prefixer'

export default defineConfig([
  { ignores: ['dist/**'] },
  ...tsPrefixer,
  {
    // This workspace package is a CLI + ESLint plugin, not app code:
    // - the `cli/` commands print results to stdout, so console output is the
    //   tool's intended interface, not a stray debug log
    // - rule type definitions use idiomatic inline `import()` type annotations
    rules: {
      'no-console': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
])
