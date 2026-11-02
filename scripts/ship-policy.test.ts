// The desktop app's package.json carries the release version (gstack-version-bump's
// version source), so /ship must count its version-only bump as release metadata.
// stamp_files is an exclusive allowlist, so CHANGELOG.md must be listed too or a
// re-stamped CHANGELOG heading reads as a content change to gstack's tree receipt.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('/ship treats the desktop version bump and its CHANGELOG heading as release stamps, not behavior changes', () => {
  // Arrange
  const policyText = readFileSync(
    path.join(root, '.gstack/ship-policy.json'),
    'utf8',
  )
  // Act
  const policy: unknown = JSON.parse(policyText)
  // Assert
  expect(policy).toEqual({
    stamp_files: ['apps/desktop/package.json', 'CHANGELOG.md'],
  })
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
