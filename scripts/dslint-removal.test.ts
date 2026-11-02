// Guards the #218 removal: the in-repo eslint-plugin-dslint package must not come back
// through a revert, a copied config or a stale CI step.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the workspace has no eslint-plugin-dslint package to install or build', () => {
  // Arrange — pnpm only treats a directory with a manifest as a workspace package;
  // gitignored dist/ or node_modules/ left by an older checkout are not one.
  const packageDirectory = path.join(root, 'packages/eslint-plugin-dslint')
  // Act
  const manifestExists = existsSync(path.join(packageDirectory, 'package.json'))
  // Assert
  expect(manifestExists).toBe(false)
})

test.each([
  'eslint.config.js',
  'package.json',
  'scripts/pregate-tests.mjs',
  '.gstack/pregate.json',
  '.github/workflows/lint.yml',
  '.github/workflows/fallow.yml',
  '.coderabbit.yaml',
])('%s no longer builds, lints or reviews with dslint', (file) => {
  // Arrange
  const source = readFileSync(path.join(root, file), 'utf8')
  // Act
  const mentionsDslint = /dslint/i.test(source)
  // Assert
  expect(mentionsDslint).toBe(false)
})
