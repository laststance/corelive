// Regression: ISSUE-003 — EA10 dev path overrode an explicit --user-data-dir, so isolated QA instances never started fresh
// Found by /qa on 2026-11-03
// Report: .gstack/qa-reports/run-20261103T033037Z/qa-report-corelive-desktop-2026-11-03.md
import { expect, test, vi } from 'vitest'

import { applyDevUserData } from './devUserData'

test('an unpackaged run launched with --user-data-dir keeps that isolated folder instead of the shared dev folder', () => {
  // Arrange
  const setPath = vi.fn()
  const fakeApp = {
    isPackaged: false,
    getPath: vi.fn(() => '/Users/test/Library/Application Support'),
    setPath,
    commandLine: { hasSwitch: (name: string) => name === 'user-data-dir' },
  }

  // Act
  const devPath = applyDevUserData(fakeApp)

  // Assert
  expect(devPath).toBeNull()
  expect(setPath).not.toHaveBeenCalled()
})
