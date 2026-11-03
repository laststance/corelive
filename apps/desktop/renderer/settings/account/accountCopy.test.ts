import { expect, test } from 'vitest'

import {
  formatRelativeTime,
  keepsPhrase,
  middleTruncate,
  needsALookLabel,
} from './accountCopy'

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)

test('words a check from a few seconds ago as just now', () => {
  // Arrange / Act
  const text = formatRelativeTime(NOW - 10_000, NOW)

  // Assert
  expect(text).toBe('just now')
})

test('words a check from minutes, hours and days ago relatively', () => {
  // Arrange / Act / Assert
  expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5 minutes ago')
  expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 hours ago')
  expect(formatRelativeTime(NOW - 24 * 3_600_000, NOW)).toBe('yesterday')
})

test('counts keeps and changes with the right singular', () => {
  // Arrange / Act / Assert
  expect(keepsPhrase(1)).toBe('1 keep')
  expect(keepsPhrase(3)).toBe('3 keeps')
  expect(needsALookLabel(1)).toBe('1 change needs a look')
  expect(needsALookLabel(2)).toBe('2 changes need a look')
})

test('shortens a long email in the middle and leaves a short one alone', () => {
  // Arrange / Act / Assert
  expect(middleTruncate('a@b.co', 32)).toBe('a@b.co')
  expect(middleTruncate('abcdefghijklmnopqrstuvwxyz', 11)).toBe('abcde…vwxyz')
})
