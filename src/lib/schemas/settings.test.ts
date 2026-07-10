import { describe, expect, it } from 'vitest'

import { UserSettingsStateSchema } from '@/lib/schemas/settings'

describe('UserSettingsStateSchema', () => {
  it('parses an empty object into the fully-silent default state (fresh install makes no sound)', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — every moment OFF, default timbre + volume, both legacy flags OFF,
    // the BrainDump editor at its prior look (mono / 14px / theme foreground),
    // and clear-on-complete OFF (finished lines stay put by default).
    expect(result).toEqual({
      completionSound: false,
      retainCompletedInList: false,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
      braindumpFontFamily: 'mono',
      braindumpFontSize: 14,
      braindumpTextColor: 'var(--foreground)',
      braindumpClearOnComplete: false,
      braindumpClearDelayMs: 500,
      braindumpToastDurationMs: 5000,
    })
  })

  it('accepts a legacy payload of only the original two booleans, defaulting the new sound fields', () => {
    // Arrange — exactly the shape persisted before the sound palette existed.
    const legacyPayload = { completionSound: true, retainCompletedInList: true }

    // Act
    const result = UserSettingsStateSchema.parse(legacyPayload)

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
      braindumpClearOnComplete: false,
      braindumpClearDelayMs: 500,
      braindumpToastDurationMs: 5000,
    })
  })

  it('keeps an explicit BrainDump clear-on-complete opt-in and defaults it OFF when absent', () => {
    // Act — an explicit true is preserved; a payload omitting it defaults to OFF.
    const optedIn = UserSettingsStateSchema.parse({
      braindumpClearOnComplete: true,
    })
    const omitted = UserSettingsStateSchema.parse({})

    // Assert
    expect(optedIn.braindumpClearOnComplete).toBe(true)
    expect(omitted.braindumpClearOnComplete).toBe(false)
  })

  it('defaults the BrainDump clear delay to a gentle 500 ms when absent', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — a brief linger, not the abrupt 0 ms instant clear.
    expect(result.braindumpClearDelayMs).toBe(500)
  })

  it('clamps an out-of-range BrainDump clear delay into the bounds [0,5000]', () => {
    // Act — the ceiling is the 5 s undo window so a line never outlasts its Undo.
    const tooLong = UserSettingsStateSchema.parse({
      braindumpClearDelayMs: 99000,
    })
    const negative = UserSettingsStateSchema.parse({
      braindumpClearDelayMs: -200,
    })

    // Assert
    expect(tooLong.braindumpClearDelayMs).toBe(5000)
    expect(negative.braindumpClearDelayMs).toBe(0)
  })

  it('self-heals a non-finite BrainDump clear delay to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      braindumpClearDelayMs: Number.NaN,
    })

    // Assert
    expect(result.braindumpClearDelayMs).toBe(500)
  })

  it('defaults the BrainDump completion-toast duration to 5000 ms when absent', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — the same 5 s window the toast used before it was configurable.
    expect(result.braindumpToastDurationMs).toBe(5000)
  })

  it('clamps an out-of-range BrainDump toast duration into the bounds [2000,10000]', () => {
    // Act — above the 10 s ceiling clamps down, below the 2 s floor clamps up.
    const tooLong = UserSettingsStateSchema.parse({
      braindumpToastDurationMs: 99000,
    })
    const tooShort = UserSettingsStateSchema.parse({
      braindumpToastDurationMs: 500,
    })

    // Assert
    expect(tooLong.braindumpToastDurationMs).toBe(10000)
    expect(tooShort.braindumpToastDurationMs).toBe(2000)
  })

  it('self-heals a non-finite BrainDump toast duration to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      braindumpToastDurationMs: Number.NaN,
    })

    // Assert
    expect(result.braindumpToastDurationMs).toBe(5000)
  })

  it('clamps an out-of-range master volume number into [0,1]', () => {
    // Act
    const tooLoud = UserSettingsStateSchema.parse({ soundVolume: 50 })
    const tooQuiet = UserSettingsStateSchema.parse({ soundVolume: -3 })

    // Assert
    expect(tooLoud.soundVolume).toBe(1)
    expect(tooQuiet.soundVolume).toBe(0)
  })

  it('rejects a non-number master volume so a malformed sync payload fails wholesale', () => {
    // Act
    const result = UserSettingsStateSchema.safeParse({ soundVolume: 'loud' })

    // Assert — the whole payload is rejected, not silently coerced.
    expect(result.success).toBe(false)
  })

  it('self-heals an unknown timbre id to the default instead of rejecting', () => {
    // Act
    const result = UserSettingsStateSchema.parse({ soundTimbre: 'banjo' })

    // Assert
    expect(result.soundTimbre).toBe('felt')
  })

  it('fills missing moments with OFF when soundMoments is present but partial', () => {
    // Arrange — only the complete moment supplied.
    const partial = { soundMoments: { complete: true } }

    // Act
    const result = UserSettingsStateSchema.parse(partial)

    // Assert — the supplied moment is kept; the rest default to OFF.
    expect(result.soundMoments).toEqual({
      'task-create': false,
      complete: true,
      clear: false,
    })
  })

  it('clamps an out-of-range BrainDump font size into the slider bounds [12,24]', () => {
    // Act
    const tooBig = UserSettingsStateSchema.parse({ braindumpFontSize: 99 })
    const tooSmall = UserSettingsStateSchema.parse({ braindumpFontSize: 8 })

    // Assert
    expect(tooBig.braindumpFontSize).toBe(24)
    expect(tooSmall.braindumpFontSize).toBe(12)
  })

  it('self-heals a non-finite BrainDump font size to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      braindumpFontSize: Number.NaN,
    })

    // Assert
    expect(result.braindumpFontSize).toBe(14)
  })

  it('self-heals an unknown BrainDump font family to the default instead of rejecting', () => {
    // Act
    const result = UserSettingsStateSchema.parse({
      braindumpFontFamily: 'comic-sans',
    })

    // Assert
    expect(result.braindumpFontFamily).toBe('mono')
  })

  it('keeps a valid BrainDump text color (theme token or hex) and self-heals anything else', () => {
    // Act — a themed preset and a custom hex both pass; an unsupported shape heals.
    const themed = UserSettingsStateSchema.parse({
      braindumpTextColor: 'var(--primary)',
    })
    // A digit-bearing theme token (e.g. a future chart-color preset) must pass —
    // the narrow [a-z-] charset would have silently healed it away.
    const digitToken = UserSettingsStateSchema.parse({
      braindumpTextColor: 'var(--chart-1)',
    })
    const hex = UserSettingsStateSchema.parse({ braindumpTextColor: '#1A2B3C' })
    const bogus = UserSettingsStateSchema.parse({
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
    const shorthand = UserSettingsStateSchema.parse({
      braindumpTextColor: '#abc',
    })
    const withAlpha = UserSettingsStateSchema.parse({
      braindumpTextColor: '#1A2B3C80',
    })

    // Assert — both are preserved verbatim, not healed away.
    expect(shorthand.braindumpTextColor).toBe('#abc')
    expect(withAlpha.braindumpTextColor).toBe('#1A2B3C80')
  })
})
