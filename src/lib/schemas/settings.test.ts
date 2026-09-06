import { describe, expect, test } from 'vitest'

import { UserSettingsStateSchema } from '@/lib/schemas/settings'

describe('UserSettingsStateSchema', () => {
  test('preserves completed-history and editor defaults when no settings have been saved', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — completed-title strikethrough preserves the established presentation,
    // the LiveEditor editor at its prior look (sans / 16px / theme foreground),
    // and clear-on-complete OFF (finished lines stay put by default).
    expect(result).toEqual({
      showCompletedTaskStrikethrough: true,
      showTodayEmber: false,
      liveEditorFontFamily: 'sans',
      liveEditorFontSize: 16,
      liveEditorTextColor: 'var(--foreground)',
      liveEditorClearOnComplete: false,
      liveEditorClearDelayMs: 500,
      liveEditorToastDurationMs: 5000,
    })
  })

  test('drops retired settings from old payloads while defaulting missing current preferences', () => {
    // Arrange — exactly the shape persisted before the sound palette existed.
    const legacyPayload = { completionSound: true, retainCompletedInList: true }

    // Act
    const result = UserSettingsStateSchema.parse(legacyPayload)

    // Assert — retired values are absent; current fields fill from defaults.
    expect(result).toEqual({
      showCompletedTaskStrikethrough: true,
      showTodayEmber: false,
      liveEditorFontFamily: 'sans',
      liveEditorFontSize: 16,
      liveEditorTextColor: 'var(--foreground)',
      liveEditorClearOnComplete: false,
      liveEditorClearDelayMs: 500,
      liveEditorToastDurationMs: 5000,
    })
  })

  test('keeps an explicit LiveEditor clear-on-complete opt-in and defaults it OFF when absent', () => {
    // Act — an explicit true is preserved; a payload omitting it defaults to OFF.
    const optedIn = UserSettingsStateSchema.parse({
      liveEditorClearOnComplete: true,
    })
    const omitted = UserSettingsStateSchema.parse({})

    // Assert
    expect(optedIn.liveEditorClearOnComplete).toBe(true)
    expect(omitted.liveEditorClearOnComplete).toBe(false)
  })

  test('defaults the LiveEditor clear delay to a gentle 500 ms when absent', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — a brief linger, not the abrupt 0 ms instant clear.
    expect(result.liveEditorClearDelayMs).toBe(500)
  })

  test('clamps an out-of-range LiveEditor clear delay into the bounds [0,5000]', () => {
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

  test('self-heals a non-finite LiveEditor clear delay to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      liveEditorClearDelayMs: Number.NaN,
    })

    // Assert
    expect(result.liveEditorClearDelayMs).toBe(500)
  })

  test('defaults the LiveEditor completion-toast duration to 5000 ms when absent', () => {
    // Act
    const result = UserSettingsStateSchema.parse({})

    // Assert — the same 5 s window the toast used before it was configurable.
    expect(result.liveEditorToastDurationMs).toBe(5000)
  })

  test('clamps an out-of-range LiveEditor toast duration into the bounds [2000,10000]', () => {
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

  test('self-heals a non-finite LiveEditor toast duration to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      liveEditorToastDurationMs: Number.NaN,
    })

    // Assert
    expect(result.liveEditorToastDurationMs).toBe(5000)
  })

  test('clamps an out-of-range LiveEditor font size into the slider bounds [12,24]', () => {
    // Act
    const tooBig = UserSettingsStateSchema.parse({ liveEditorFontSize: 99 })
    const tooSmall = UserSettingsStateSchema.parse({ liveEditorFontSize: 8 })

    // Assert
    expect(tooBig.liveEditorFontSize).toBe(24)
    expect(tooSmall.liveEditorFontSize).toBe(12)
  })

  test('self-heals a non-finite LiveEditor font size to the default (no poisoned hydrate)', () => {
    // Act — a NaN that slipped into a persisted/synced blob must not survive.
    const result = UserSettingsStateSchema.parse({
      liveEditorFontSize: Number.NaN,
    })

    // Assert
    expect(result.liveEditorFontSize).toBe(16)
  })

  test('self-heals an unknown LiveEditor font family to the default instead of rejecting', () => {
    // Act
    const result = UserSettingsStateSchema.parse({
      liveEditorFontFamily: 'comic-sans',
    })

    // Assert
    expect(result.liveEditorFontFamily).toBe('sans')
  })

  test('keeps a valid LiveEditor text color (theme token or hex) and self-heals anything else', () => {
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

  test('accepts the 3-digit and 8-digit hex shapes the color pattern allows', () => {
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
