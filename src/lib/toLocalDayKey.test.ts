import { describe, expect, it } from 'vitest'

import { toLocalDayKey } from './toLocalDayKey'

describe('toLocalDayKey', () => {
  it('buckets a late-evening JST completion onto the next UTC calendar day', () => {
    // Arrange: 15:30 UTC is 00:30 the following day in Tokyo (+09:00).
    const instant = new Date('2026-06-11T15:30:00.000Z')

    // Act
    const dayKey = toLocalDayKey(instant, 'Asia/Tokyo')

    // Assert: the user experiences this as June 12th, not June 11th.
    expect(dayKey).toBe('2026-06-12')
  })

  it('buckets an early-morning UTC completion onto the previous day for a far-west zone', () => {
    // Arrange: 05:00 UTC is 18:00 the previous day in Pago Pago (-11:00).
    const instant = new Date('2026-06-11T05:00:00.000Z')

    // Act
    const dayKey = toLocalDayKey(instant, 'Pacific/Pago_Pago')

    // Assert
    expect(dayKey).toBe('2026-06-10')
  })

  it('buckets onto the next day for the far-east +14 zone (Kiritimati)', () => {
    // Arrange: 11:00 UTC is 01:00 the next day at +14:00.
    const instant = new Date('2026-06-11T11:00:00.000Z')

    // Act
    const dayKey = toLocalDayKey(instant, 'Pacific/Kiritimati')

    // Assert
    expect(dayKey).toBe('2026-06-12')
  })

  it('buckets onto the previous day for the far-west -12 zone (the extreme negative offset)', () => {
    // Arrange: 11:00 UTC is 23:00 the PREVIOUS day at -12:00 — the symmetric
    // counterpart to the +14 Kiritimati case, pinning the widest negative edge.
    const instant = new Date('2026-06-11T11:00:00.000Z')

    // Act — Etc/GMT+12 is IANA's sign-flipped spelling of UTC-12.
    const dayKey = toLocalDayKey(instant, 'Etc/GMT+12')

    // Assert
    expect(dayKey).toBe('2026-06-10')
  })

  it('honors a DST offset when the instant straddles local midnight', () => {
    // Arrange: New York is on EDT (-04:00) in June; 03:30 UTC is 23:30 EDT
    // the previous day, so the local calendar day is still the 7th.
    const instant = new Date('2026-06-08T03:30:00.000Z')

    // Act
    const dayKey = toLocalDayKey(instant, 'America/New_York')

    // Assert
    expect(dayKey).toBe('2026-06-07')
  })

  it('falls back to the UTC calendar day when timeZone is null', () => {
    // Arrange: 23:30 UTC — a null zone must reproduce the original UTC slice.
    const instant = new Date('2026-06-11T23:30:00.000Z')

    // Act
    const dayKey = toLocalDayKey(instant, null)

    // Assert
    expect(dayKey).toBe('2026-06-11')
  })

  it('falls back to the UTC calendar day for an unrecognized IANA zone', () => {
    // Arrange: a garbage header value must degrade to UTC, never throw.
    const instant = new Date('2026-06-11T23:30:00.000Z')

    // Act
    const dayKey = toLocalDayKey(instant, 'Not/AZone')

    // Assert
    expect(dayKey).toBe('2026-06-11')
  })

  it('returns explicit UTC identical to the null fallback', () => {
    // Arrange
    const instant = new Date('2026-01-01T00:00:00.000Z')

    // Act
    const explicitUtc = toLocalDayKey(instant, 'UTC')
    const nullFallback = toLocalDayKey(instant, null)

    // Assert
    expect(explicitUtc).toBe('2026-01-01')
    expect(explicitUtc).toBe(nullFallback)
  })
})
