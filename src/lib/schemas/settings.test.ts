import { describe, expect, it } from 'vitest'

import { UserSettingsStateSchema } from '@/lib/schemas/settings'

describe('UserSettingsStateSchema', () => {
  it('parses an empty object into the fully-silent default state (fresh install makes no sound)', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — every moment OFF, default timbre + volume, legacy flags OFF,
    // completed-title strikethrough ON to preserve the established presentation,
    // the LiveEditor editor at its prior look (mono / 14px / theme foreground),
    // and clear-on-complete OFF (finished lines stay put by default).
    expect(result).toEqual({
      completionSound: false,
      retainCompletedInList: false,
      showCompletedTaskStrikethrough: true,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
      liveEditorFontFamily: 'mono',
      liveEditorFontSize: 14,
      liveEditorTextColor: 'var(--foreground)',
      liveEditorClearOnComplete: false,
      liveEditorClearDelayMs: 500,
      liveEditorToastDurationMs: 5000,
    })
  })

  it('accepts a legacy payload of only the original two booleans and defaults newer settings', () => {
    // Arrange — exactly the shape persisted before the sound palette existed.
    const legacyPayload = { completionSound: true, retainCompletedInList: true }

    // Act
    const result = UserSettingsStateSchema.parse(legacyPayload)

    // Assert — the legacy values survive; every newer field fills from defaults.
    expect(result).toEqual({
      completionSound: true,
      retainCompletedInList: true,
      showCompletedTaskStrikethrough: true,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
      liveEditorFontFamily: 'mono',
      liveEditorFontSize: 14,
      liveEditorTextColor: 'var(--foreground)',
      liveEditorClearOnComplete: false,
      liveEditorClearDelayMs: 500,
      liveEditorToastDurationMs: 5000,
    })
  })

  it('keeps an explicit LiveEditor clear-on-complete opt-in and defaults it OFF when absent', () => {
    // Act — an explicit true is preserved; a payload omitting it defaults to OFF.
    const optedIn = UserSettingsStateSchema.parse({
      liveEditorClearOnComplete: true,
    })
    const omitted = UserSettingsStateSchema.parse({})

    // Assert
    expect(optedIn.liveEditorClearOnComplete).toBe(true)
    expect(omitted.liveEditorClearOnComplete).toBe(false)
  })

  it('defaults the LiveEditor clear delay to a gentle 500 ms when absent', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — a brief linger, not the abrupt 0 ms instant clear.
    expect(result.liveEditorClearDelayMs).toBe(500)
  })

  it('clamps an out-of-range LiveEditor clear delay into the bounds [0,5000]', () => {
    // Act — the ceiling is the 5 s undo window so a line never outlasts its Undo.
    const tooLong = UserSettingsStateSchema.parse({
      liveEditorClearDelayMs: 99000,
    })
    const negative = UserSettingsStateSchema.parse({
      liveEditorClearDelayMs: -200,
    })

    // Assert
    expect(tooLong.liveEditorClearDelayMs).toBe(5000)
    expect(negative.liveEditorClearDelayMs).toBe(0)
  })

  it('self-heals a non-finite LiveEditor clear delay to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      liveEditorClearDelayMs: Number.NaN,
    })

    // Assert
    expect(result.liveEditorClearDelayMs).toBe(500)
  })

  it('defaults the LiveEditor completion-toast duration to 5000 ms when absent', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — the same 5 s window the toast used before it was configurable.
    expect(result.liveEditorToastDurationMs).toBe(5000)
  })

  it('clamps an out-of-range LiveEditor toast duration into the bounds [2000,10000]', () => {
    // Act — above the 10 s ceiling clamps down, below the 2 s floor clamps up.
    const tooLong = UserSettingsStateSchema.parse({
      liveEditorToastDurationMs: 99000,
    })
    const tooShort = UserSettingsStateSchema.parse({
      liveEditorToastDurationMs: 500,
    })

    // Assert
    expect(tooLong.liveEditorToastDurationMs).toBe(10000)
    expect(tooShort.liveEditorToastDurationMs).toBe(2000)
  })

  it('self-heals a non-finite LiveEditor toast duration to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      liveEditorToastDurationMs: Number.NaN,
    })

    // Assert
    expect(result.liveEditorToastDurationMs).toBe(5000)
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

  it('clamps an out-of-range LiveEditor font size into the slider bounds [12,24]', () => {
    // Act
    const tooBig = UserSettingsStateSchema.parse({ liveEditorFontSize: 99 })
    const tooSmall = UserSettingsStateSchema.parse({ liveEditorFontSize: 8 })

    // Assert
    expect(tooBig.liveEditorFontSize).toBe(24)
    expect(tooSmall.liveEditorFontSize).toBe(12)
  })

  it('self-heals a non-finite LiveEditor font size to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      liveEditorFontSize: Number.NaN,
    })

    // Assert
    expect(result.liveEditorFontSize).toBe(14)
  })

  it('self-heals an unknown LiveEditor font family to the default instead of rejecting', () => {
    // Act
    const result = UserSettingsStateSchema.parse({
      liveEditorFontFamily: 'comic-sans',
    })

    // Assert
    expect(result.liveEditorFontFamily).toBe('mono')
  })

  it('keeps a valid LiveEditor text color (theme token or hex) and self-heals anything else', () => {
    // Act — a themed preset and a custom hex both pass; an unsupported shape heals.
    const themed = UserSettingsStateSchema.parse({
      liveEditorTextColor: 'var(--primary)',
    })
    // A digit-bearing theme token (e.g. a future chart-color preset) must pass —
    // the narrow [a-z-] charset would have silently healed it away.
    const digitToken = UserSettingsStateSchema.parse({
      liveEditorTextColor: 'var(--chart-1)',
    })
    const hex = UserSettingsStateSchema.parse({
      liveEditorTextColor: '#1A2B3C',
    })
    const bogus = UserSettingsStateSchema.parse({
      liveEditorTextColor: 'rgba(0,0,0,0.5)',
    })

    // Assert
    expect(themed.liveEditorTextColor).toBe('var(--primary)')
    expect(digitToken.liveEditorTextColor).toBe('var(--chart-1)')
    expect(hex.liveEditorTextColor).toBe('#1A2B3C')
    expect(bogus.liveEditorTextColor).toBe('var(--foreground)')
  })

  it('accepts the 3-digit and 8-digit hex shapes the color pattern allows', () => {
    // Act — the pattern admits #rgb (shorthand) and #rrggbbaa (with alpha), not
    // only the 6-digit form the native picker emits.
    const shorthand = UserSettingsStateSchema.parse({
      liveEditorTextColor: '#abc',
    })
    const withAlpha = UserSettingsStateSchema.parse({
      liveEditorTextColor: '#1A2B3C80',
    })

    // Assert — both are preserved verbatim, not healed away.
    expect(shorthand.liveEditorTextColor).toBe('#abc')
    expect(withAlpha.liveEditorTextColor).toBe('#1A2B3C80')
  })
})
