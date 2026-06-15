import { describe, expect, it } from 'vitest'

import { PreferencesStateSchema } from '@/lib/schemas/preferences'

describe('PreferencesStateSchema', () => {
  it('parses an empty object into the fully-silent default state (fresh install makes no sound)', () => {
    // Act
    const result = PreferencesStateSchema.parse({})

    // Assert — every moment OFF, default timbre + volume, both legacy flags OFF,
    // and the BrainDump editor at its prior look (mono / 14px / theme foreground).
    expect(result).toEqual({
      completionSound: false,
      retainCompletedInList: false,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
      braindumpFontFamily: 'mono',
      braindumpFontSize: 14,
      braindumpTextColor: 'var(--foreground)',
    })
  })

  it('accepts a legacy payload of only the original two booleans, defaulting the new sound fields', () => {
    // Arrange — exactly the shape persisted before the sound palette existed.
    const legacyPayload = { completionSound: true, retainCompletedInList: true }

    // Act
    const result = PreferencesStateSchema.parse(legacyPayload)

    // Assert — the legacy values survive; the new fields fill with defaults.
    expect(result).toEqual({
      completionSound: true,
      retainCompletedInList: true,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
      braindumpFontFamily: 'mono',
      braindumpFontSize: 14,
      braindumpTextColor: 'var(--foreground)',
    })
  })

  it('clamps an out-of-range master volume number into [0,1]', () => {
    // Act
    const tooLoud = PreferencesStateSchema.parse({ soundVolume: 50 })
    const tooQuiet = PreferencesStateSchema.parse({ soundVolume: -3 })

    // Assert
    expect(tooLoud.soundVolume).toBe(1)
    expect(tooQuiet.soundVolume).toBe(0)
  })

  it('rejects a non-number master volume so a malformed sync payload fails wholesale', () => {
    // Act
    const result = PreferencesStateSchema.safeParse({ soundVolume: 'loud' })

    // Assert — the whole payload is rejected, not silently coerced.
    expect(result.success).toBe(false)
  })

  it('self-heals an unknown timbre id to the default instead of rejecting', () => {
    // Act
    const result = PreferencesStateSchema.parse({ soundTimbre: 'banjo' })

    // Assert
    expect(result.soundTimbre).toBe('felt')
  })

  it('fills missing moments with OFF when soundMoments is present but partial', () => {
    // Arrange — only the complete moment supplied.
    const partial = { soundMoments: { complete: true } }

    // Act
    const result = PreferencesStateSchema.parse(partial)

    // Assert — the supplied moment is kept; the rest default to OFF.
    expect(result.soundMoments).toEqual({
      'task-create': false,
      complete: true,
      clear: false,
    })
  })

  it('clamps an out-of-range BrainDump font size into the slider bounds [12,24]', () => {
    // Act
    const tooBig = PreferencesStateSchema.parse({ braindumpFontSize: 99 })
    const tooSmall = PreferencesStateSchema.parse({ braindumpFontSize: 8 })

    // Assert
    expect(tooBig.braindumpFontSize).toBe(24)
    expect(tooSmall.braindumpFontSize).toBe(12)
  })

  it('self-heals a non-finite BrainDump font size to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = PreferencesStateSchema.parse({
      braindumpFontSize: Number.NaN,
    })

    // Assert
    expect(result.braindumpFontSize).toBe(14)
  })

  it('self-heals an unknown BrainDump font family to the default instead of rejecting', () => {
    // Act
    const result = PreferencesStateSchema.parse({
      braindumpFontFamily: 'comic-sans',
    })

    // Assert
    expect(result.braindumpFontFamily).toBe('mono')
  })

  it('keeps a valid BrainDump text color (theme token or hex) and self-heals anything else', () => {
    // Act — a themed preset and a custom hex both pass; an unsupported shape heals.
    const themed = PreferencesStateSchema.parse({
      braindumpTextColor: 'var(--primary)',
    })
    // A digit-bearing theme token (e.g. a future chart-color preset) must pass —
    // the narrow [a-z-] charset would have silently healed it away.
    const digitToken = PreferencesStateSchema.parse({
      braindumpTextColor: 'var(--chart-1)',
    })
    const hex = PreferencesStateSchema.parse({ braindumpTextColor: '#1A2B3C' })
    const bogus = PreferencesStateSchema.parse({
      braindumpTextColor: 'rgba(0,0,0,0.5)',
    })

    // Assert
    expect(themed.braindumpTextColor).toBe('var(--primary)')
    expect(digitToken.braindumpTextColor).toBe('var(--chart-1)')
    expect(hex.braindumpTextColor).toBe('#1A2B3C')
    expect(bogus.braindumpTextColor).toBe('var(--foreground)')
  })

  it('accepts the 3-digit and 8-digit hex shapes the color pattern allows', () => {
    // Act — the pattern admits #rgb (shorthand) and #rrggbbaa (with alpha), not
    // only the 6-digit form the native picker emits.
    const shorthand = PreferencesStateSchema.parse({
      braindumpTextColor: '#abc',
    })
    const withAlpha = PreferencesStateSchema.parse({
      braindumpTextColor: '#1A2B3C80',
    })

    // Assert — both are preserved verbatim, not healed away.
    expect(shorthand.braindumpTextColor).toBe('#abc')
    expect(withAlpha.braindumpTextColor).toBe('#1A2B3C80')
  })
})
