import { describe, expect, test } from 'vitest'

import type { RootState } from '../store'

import reducer, {
  hydrateUserSettings,
  initialState,
  resetUserSettings,
  selectLiveEditorClearDelayMs,
  selectLiveEditorClearOnComplete,
  selectLiveEditorFontFamily,
  selectLiveEditorFontSize,
  selectLiveEditorTextColor,
  selectLiveEditorToastDurationMs,
  selectUserSettings,
  setLiveEditorClearDelayMs,
  setLiveEditorClearOnComplete,
  setLiveEditorFontFamily,
  setLiveEditorFontSize,
  setLiveEditorTextColor,
  setLiveEditorToastDurationMs,
  type UserSettingsState,
} from './settingsSlice'

// Build a RootState-shaped object carrying only the settings slice the
// selectors read (other slices are irrelevant to these assertions). The cast
// is deliberate: these tests simulate malformed/partial persisted slices.
function stateWith(settings: Partial<UserSettingsState>): RootState {
  return { settings } as unknown as RootState
}

describe('settingsSlice', () => {
  test('preserves the LiveEditor defaults without retired settings', () => {
    // Arrange — hard-code the remaining LiveEditor defaults.
    const expectedSettings = {
      showTodayEmber: false,
      liveEditorFontFamily: 'sans',
      liveEditorFontSize: 16,
      liveEditorTextColor: 'var(--foreground)',
      liveEditorClearOnComplete: false,
      liveEditorClearDelayMs: 500,
      liveEditorToastDurationMs: 5000,
    }

    // Act — read the schema-owned initial state used by fresh installs.
    const actualSettings = initialState

    // Assert — only active editor preferences remain.
    expect(actualSettings).toEqual(expectedSettings)
  })

  test('replaces the whole state on hydrateUserSettings (the cross-window apply path)', () => {
    // Arrange
    const incoming: UserSettingsState = {
      showTodayEmber: true,
      liveEditorFontFamily: 'serif',
      liveEditorFontSize: 20,
      liveEditorTextColor: 'var(--primary)',
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 1200,
      liveEditorToastDurationMs: 8000,
    }

    // Act
    const next = reducer(initialState, hydrateUserSettings(incoming))

    // Assert
    expect(next).toEqual({
      showTodayEmber: true,
      liveEditorFontFamily: 'serif',
      liveEditorFontSize: 20,
      liveEditorTextColor: 'var(--primary)',
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 1200,
      liveEditorToastDurationMs: 8000,
    })
  })

  test('restores every default on resetUserSettings', () => {
    // Arrange — a fully-enabled state.
    const enabled: UserSettingsState = {
      showTodayEmber: true,
      liveEditorFontFamily: 'serif',
      liveEditorFontSize: 24,
      liveEditorTextColor: '#abcdef',
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 2000,
      liveEditorToastDurationMs: 7000,
    }

    // Act
    const next = reducer(enabled, resetUserSettings())

    // Assert
    expect(next).toEqual({
      showTodayEmber: false,
      liveEditorFontFamily: 'sans',
      liveEditorFontSize: 16,
      liveEditorTextColor: 'var(--foreground)',
      liveEditorClearOnComplete: false,
      liveEditorClearDelayMs: 500,
      liveEditorToastDurationMs: 5000,
    })
  })

  test('fills missing saved settings with LiveEditor defaults', () => {
    // Arrange — all fields dropped.
    const emptyState = stateWith({})

    // Act
    const settings = selectUserSettings(emptyState)

    // Assert
    expect(settings).toEqual({
      showTodayEmber: false,
      liveEditorFontFamily: 'sans',
      liveEditorFontSize: 16,
      liveEditorTextColor: 'var(--foreground)',
      liveEditorClearOnComplete: false,
      liveEditorClearDelayMs: 500,
      liveEditorToastDurationMs: 5000,
    })
  })

  test('stores the selected LiveEditor font family', () => {
    // Act
    const next = reducer(initialState, setLiveEditorFontFamily('serif'))

    // Assert
    expect(next.liveEditorFontFamily).toBe('serif')
  })

  test('self-heals an unknown LiveEditor font family to the default instead of storing it', () => {
    // Act — a payload outside the known ids (a corrupt blob or stray dispatch)
    // must not poison the font-family key. A raw action bypasses the typed creator
    // to exercise the reducer's runtime guard the way malformed input would.
    const next = reducer(initialState, {
      type: setLiveEditorFontFamily.type,
      payload: 'comic-sans',
    })

    // Assert — the reducer falls back to the default face.
    expect(next.liveEditorFontFamily).toBe('sans')
  })

  test('clamps an out-of-range LiveEditor font size into the slider bounds [12,24]', () => {
    // Act — above-range clamps to the ceiling, below-range to the floor, in-range passes.
    const tooBig = reducer(initialState, setLiveEditorFontSize(99))
    const tooSmall = reducer(initialState, setLiveEditorFontSize(2))
    const inRange = reducer(initialState, setLiveEditorFontSize(18))

    // Assert
    expect(tooBig.liveEditorFontSize).toBe(24)
    expect(tooSmall.liveEditorFontSize).toBe(12)
    expect(inRange.liveEditorFontSize).toBe(18)
  })

  test('guards a NaN LiveEditor font size to the default instead of poisoning the slider', () => {
    // Act — a non-finite value (e.g. a stray empty slider event) must not stick.
    const next = reducer(initialState, setLiveEditorFontSize(Number.NaN))

    // Assert
    expect(next.liveEditorFontSize).toBe(16)
  })

  test('stores the selected LiveEditor text color', () => {
    // Act — the native color picker emits a 6-digit hex.
    const next = reducer(initialState, setLiveEditorTextColor('#123abc'))

    // Assert
    expect(next.liveEditorTextColor).toBe('#123abc')
  })

  test('self-heals an off-shape LiveEditor text color to the default instead of storing it', () => {
    // Act — a value that is neither a theme token nor a hex (e.g. a corrupt
    // persisted blob or stray programmatic call) must not reach the inline style.
    const next = reducer(initialState, setLiveEditorTextColor('not-a-color'))

    // Assert — the reducer shares the schema's validation boundary and falls back.
    expect(next.liveEditorTextColor).toBe('var(--foreground)')
  })

  test('falls back to the default font, size, and color for a slice that predates those fields', () => {
    // Arrange — a persisted slice from before the LiveEditor text-style fields existed.
    const legacyState = stateWith({})

    // Act / Assert — every LiveEditor selector coalesces to its default (Finding 5).
    expect(selectLiveEditorFontFamily(legacyState)).toBe('sans')
    expect(selectLiveEditorFontSize(legacyState)).toBe(16)
    expect(selectLiveEditorTextColor(legacyState)).toBe('var(--foreground)')
  })

  test('stores LiveEditor clear-on-complete as enabled', () => {
    // Act
    const next = reducer(initialState, setLiveEditorClearOnComplete(true))

    // Assert
    expect(next.liveEditorClearOnComplete).toBe(true)
  })

  test('falls back to clear-on-complete OFF for a slice that predates the field', () => {
    // Arrange — a persisted slice from before clear-on-complete existed.
    const legacyState = stateWith({})

    // Act / Assert — the selector coalesces to the default, never undefined (Finding 5).
    expect(selectLiveEditorClearOnComplete(legacyState)).toBe(false)
  })

  test('stores the selected LiveEditor clear delay', () => {
    // Act
    const next = reducer(initialState, setLiveEditorClearDelayMs(1500))

    // Assert
    expect(next.liveEditorClearDelayMs).toBe(1500)
  })

  test('clamps an out-of-range LiveEditor clear delay into the bounds [0,5000]', () => {
    // Act — above the 5 s undo window clamps to the ceiling, below 0 to the floor,
    // in-range passes through.
    const tooLong = reducer(initialState, setLiveEditorClearDelayMs(99000))
    const negative = reducer(initialState, setLiveEditorClearDelayMs(-200))
    const inRange = reducer(initialState, setLiveEditorClearDelayMs(800))

    // Assert
    expect(tooLong.liveEditorClearDelayMs).toBe(5000)
    expect(negative.liveEditorClearDelayMs).toBe(0)
    expect(inRange.liveEditorClearDelayMs).toBe(800)
  })

  test('guards a NaN LiveEditor clear delay to the default instead of poisoning the slider', () => {
    // Act — a non-finite value (e.g. a stray empty slider event) must not stick.
    const next = reducer(initialState, setLiveEditorClearDelayMs(Number.NaN))

    // Assert
    expect(next.liveEditorClearDelayMs).toBe(500)
  })

  test('falls back to the default clear delay for a slice that predates the field', () => {
    // Arrange — a persisted slice from before the clear delay existed.
    const legacyState = stateWith({})

    // Act / Assert — the selector coalesces to the 500 ms default, never undefined.
    expect(selectLiveEditorClearDelayMs(legacyState)).toBe(500)
  })

  test('stores the selected LiveEditor toast duration', () => {
    // Act
    const next = reducer(initialState, setLiveEditorToastDurationMs(6000))

    // Assert
    expect(next.liveEditorToastDurationMs).toBe(6000)
  })

  test('clamps an out-of-range LiveEditor toast duration into the bounds [2000,10000]', () => {
    // Act — above the 10 s ceiling clamps down, below the 2 s floor clamps up,
    // in-range passes through.
    const tooLong = reducer(initialState, setLiveEditorToastDurationMs(99000))
    const tooShort = reducer(initialState, setLiveEditorToastDurationMs(500))
    const inRange = reducer(initialState, setLiveEditorToastDurationMs(6000))

    // Assert
    expect(tooLong.liveEditorToastDurationMs).toBe(10000)
    expect(tooShort.liveEditorToastDurationMs).toBe(2000)
    expect(inRange.liveEditorToastDurationMs).toBe(6000)
  })

  test('guards a NaN LiveEditor toast duration to the default instead of poisoning the slider', () => {
    // Act — a non-finite value (e.g. a stray empty slider event) must not stick.
    const next = reducer(initialState, setLiveEditorToastDurationMs(Number.NaN))

    // Assert
    expect(next.liveEditorToastDurationMs).toBe(5000)
  })

  test('falls back to the default toast duration for a slice that predates the field', () => {
    // Arrange — a persisted slice from before the toast duration existed.
    const legacyState = stateWith({})

    // Act / Assert — the selector coalesces to the 5000 ms default, never undefined.
    expect(selectLiveEditorToastDurationMs(legacyState)).toBe(5000)
  })
})
