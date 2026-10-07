// @vitest-environment node
import { afterEach, describe, expect, test } from 'vitest'

import { parseUtcTimestamp } from './parseUtcTimestamp'

const originalTimeZone = process.env.TZ

afterEach(() => {
  // Restore the runner's zone so other tests in this worker are unaffected.
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe('parseUtcTimestamp', () => {
  test('reads a timestamp(3) string from a raw query row as a UTC instant', () => {
    // Arrange
    const rawRowValue = '2026-06-03 14:30:00.123'

    // Act
    const instant = parseUtcTimestamp(rawRowValue)

    // Assert
    expect(instant.toISOString()).toBe('2026-06-03T14:30:00.123Z')
  })

  test('reads a whole-second value that has no fractional part', () => {
    // Arrange
    const rawRowValue = '2026-06-03 14:30:00'

    // Act
    const instant = parseUtcTimestamp(rawRowValue)

    // Assert
    expect(instant.toISOString()).toBe('2026-06-03T14:30:00.000Z')
  })

  test('returns the same instant on a JST machine as on a UTC machine, so journal rows do not shift by 9 hours', () => {
    // Arrange — switch the process to Asia/Tokyo and prove the switch took effect.
    process.env.TZ = 'Asia/Tokyo'
    expect(new Date(2026, 5, 3, 14, 30).getTimezoneOffset()).toBe(-540)

    // Act
    const instant = parseUtcTimestamp('2026-06-03 14:30:00.123')

    // Assert
    expect(instant.toISOString()).toBe('2026-06-03T14:30:00.123Z')
  })

  test('throws on text that is not a timestamp instead of returning an Invalid Date', () => {
    // Arrange
    const notATimestamp = 'yesterday-ish'

    // Act & Assert
    expect(() => parseUtcTimestamp(notATimestamp)).toThrow(
      'Unparseable timestamp: yesterday-ish',
    )
  })
})
