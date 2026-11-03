// Regression: ISSUE-001 — the signed-out fixture modeled an expired session, so DA15 evidence showed "Sign in to sync completions" after a deliberate sign-out
// Found by /qa on 2026-11-03
// Report: .gstack/qa-reports/run-20261103T033037Z/qa-report-corelive-desktop-2026-11-03.md
import { expect, test } from 'vitest'

import { EDITOR_FIXTURES } from './qa-fixture-states'

test('the signed-out editor fixture waits for the save line only, because a deliberate sign-out never asks to sign in (DA2)', () => {
  // Arrange
  const signedOut = EDITOR_FIXTURES.find(
    (fixture) => fixture.name === 'signed-out',
  )

  // Act
  const readyText = signedOut?.readyText

  // Assert
  expect(readyText).toBe('Saved on this Mac')
})

test('the session-expired editor fixture is the one that shows the DA2 sign-in prompt', () => {
  // Arrange
  const sessionExpired = EDITOR_FIXTURES.find(
    (fixture) => fixture.name === 'session-expired',
  )

  // Act
  const readyText = sessionExpired?.readyText

  // Assert
  expect(readyText).toBe('Sign in to sync completions')
})
