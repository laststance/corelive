// The desktop app's package.json carries the release version (gstack-version-bump's
// version source), so /ship must count its version-only bump as release metadata.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('/ship treats the desktop version bump as a release stamp, not a behavior change', () => {
  // Arrange
  const policyText = readFileSync(
    path.join(root, '.gstack/ship-policy.json'),
    'utf8',
  )
  // Act
  const policy: unknown = JSON.parse(policyText)
  // Assert
  expect(policy).toEqual({ stamp_files: ['apps/desktop/package.json'] })
})

test('the stamped desktop manifest holds the release version', () => {
  // Arrange
  const manifestText = readFileSync(
    path.join(root, 'apps/desktop/package.json'),
    'utf8',
  )
  // Act
  const manifest: unknown = JSON.parse(manifestText)
  // Assert
  expect(manifest).toMatchObject({
    version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
  })
})
