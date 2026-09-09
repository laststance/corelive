import { describe, expect, test } from 'vitest'

import { shiftIsoDate } from './shiftIsoDate'

describe('shiftIsoDate', () => {
  test('adds one day inside the same month', () => {
    expect(shiftIsoDate('2026-05-10', 1)).toBe('2026-05-11')
  })

  test('subtracts one day inside the same month', () => {
    expect(shiftIsoDate('2026-05-10', -1)).toBe('2026-05-09')
  })

  test('returns the same date when the offset is zero', () => {
    expect(shiftIsoDate('2026-05-10', 0)).toBe('2026-05-10')
  })

  test('rolls forward across the end of a 31-day month', () => {
    expect(shiftIsoDate('2026-05-31', 1)).toBe('2026-06-01')
  })

  test('rolls backward across the start of a month', () => {
    expect(shiftIsoDate('2026-06-01', -1)).toBe('2026-05-31')
  })

  test('rolls forward across a year boundary', () => {
    expect(shiftIsoDate('2025-12-31', 1)).toBe('2026-01-01')
  })

  test('rolls backward across a year boundary', () => {
    expect(shiftIsoDate('2026-01-01', -1)).toBe('2025-12-31')
  })

  test('lands on Feb 29 in a leap year', () => {
    expect(shiftIsoDate('2024-02-28', 1)).toBe('2024-02-29')
  })

  test('skips to March 1 in a non-leap year', () => {
    expect(shiftIsoDate('2026-02-28', 1)).toBe('2026-03-01')
  })

  test('crosses the US DST spring-forward date without an off-by-one', () => {
    // 2026-03-08 → 2026-03-09 is the day the US "loses" an hour. UTC math
    // makes this identical to any other day; the off-by-one bug that bites
    // local-Date implementations does not apply here.
    expect(shiftIsoDate('2026-03-08', 1)).toBe('2026-03-09')
  })

  test('handles large offsets symmetrically', () => {
    expect(shiftIsoDate('2026-05-10', 30)).toBe('2026-06-09')
    expect(shiftIsoDate('2026-05-10', -30)).toBe('2026-04-10')
  })
})
