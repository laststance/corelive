import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/lib/constants/settings'

import type { RootState } from '../store'

import reducer, {
  hydrateUserSettings,
  initialState,
  resetUserSettings,
  selectBraindumpClearDelayMs,
  selectBraindumpClearOnComplete,
  selectBraindumpFontFamily,
  selectBraindumpFontSize,
  selectBraindumpTextColor,
  selectBraindumpToastDurationMs,
  selectCompletionSound,
  selectUserSettings,
  selectRetainCompletedInList,
  selectSoundMoment,
  selectSoundTimbre,
  selectSoundVolume,
  setBraindumpClearDelayMs,
  setBraindumpClearOnComplete,
  setBraindumpFontFamily,
  setBraindumpFontSize,
  setBraindumpTextColor,
  setBraindumpToastDurationMs,
  setCompletionSound,
  setRetainCompletedInList,
  setSoundMoment,
  setAllSoundMoments,
  setSoundTimbre,
  setSoundVolume,
  type UserSettingsState,
} from './settingsSlice'

// Build a RootState-shaped object carrying only the settings slice the
// selectors read (other slices are irrelevant to these assertions). The cast
// is deliberate: these tests simulate malformed/partial persisted slices.
function stateWith(settings: Partial<UserSettingsState>): RootState {
  return { settings } as unknown as RootState
}

describe('settingsSlice', () => {
  it('defaults every setting to silent/neutral so a fresh install makes no sound', () => {
    // Assert — all sound moments OFF, default timbre + volume, both legacy flags OFF,
    // and the BrainDump editor at its prior look (mono / 14px / theme foreground).
    expect(initialState).toEqual({
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

  it('enables the legacy completion sound when setCompletionSound(true) is dispatched', () => {
    // Act
    const next = reducer(initialState, setCompletionSound(true))

    // Assert
    expect(next.completionSound).toBe(true)
    expect(next.retainCompletedInList).toBe(false)
  })

  it('enables 居残りモード when setRetainCompletedInList(true) is dispatched', () => {
    // Act
    const next = reducer(initialState, setRetainCompletedInList(true))

    // Assert
    expect(next.retainCompletedInList).toBe(true)
    expect(next.completionSound).toBe(false)
  })

  it('turns on a single sound moment and leaves the other two untouched', () => {
    // Act — enable only the "clear" moment.
    const next = reducer(
      initialState,
      setSoundMoment({ moment: 'clear', enabled: true }),
    )

    // Assert — clear ON, the other moments still OFF.
    expect(next.soundMoments).toEqual({
      'task-create': false,
      complete: false,
      clear: true,
    })
  })

  it('coalesces a missing soundMoments object before writing a moment toggle (legacy persisted slice)', () => {
    // Arrange — a pre-palette persisted slice that shallowMerge left without
    // soundMoments at all; toggling a moment must not read undefined[moment].
    const legacyState = {
      completionSound: false,
      retainCompletedInList: false,
    } as unknown as UserSettingsState

    // Act
    const next = reducer(
      legacyState,
      setSoundMoment({ moment: 'task-create', enabled: true }),
    )

    // Assert — the object is rebuilt from defaults with only task-create flipped.
    expect(next.soundMoments).toEqual({
      'task-create': true,
      complete: false,
      clear: false,
    })
  })

  it('turns on every sound moment at once when the master toggle is enabled', () => {
    // Act — flip the master "All cues" switch on from a silent default.
    const next = reducer(initialState, setAllSoundMoments(true))

    // Assert — all three cues are now on.
    expect(next.soundMoments).toEqual({
      'task-create': true,
      complete: true,
      clear: true,
    })
  })

  it('silences every sound moment at once when the master toggle is disabled', () => {
    // Arrange — a palette with all three cues currently on.
    const allCuesOnState: UserSettingsState = {
      ...initialState,
      soundMoments: { 'task-create': true, complete: true, clear: true },
    }

    // Act — flip the master "All cues" switch off.
    const next = reducer(allCuesOnState, setAllSoundMoments(false))

    // Assert — every cue is now off (a silent palette).
    expect(next.soundMoments).toEqual({
      'task-create': false,
      complete: false,
      clear: false,
    })
  })

  it('selects the chosen timbre when setSoundTimbre is dispatched', () => {
    // Act
    const next = reducer(initialState, setSoundTimbre('wood'))

    // Assert
    expect(next.soundTimbre).toBe('wood')
  })

  it('clamps an out-of-range master volume into [0,1] when setSoundVolume is dispatched', () => {
    // Act — an above-range value is clamped to the ceiling.
    const tooLoud = reducer(initialState, setSoundVolume(50))
    // Act — a below-range value is clamped to the floor.
    const tooQuiet = reducer(initialState, setSoundVolume(-3))
    // Act — an in-range value passes through unchanged.
    const inRange = reducer(initialState, setSoundVolume(0.3))

    // Assert
    expect(tooLoud.soundVolume).toBe(1)
    expect(tooQuiet.soundVolume).toBe(0)
    expect(inRange.soundVolume).toBe(0.3)
  })

  it('replaces the whole state on hydrateUserSettings (the cross-window apply path)', () => {
    // Arrange
    const incoming: UserSettingsState = {
      completionSound: true,
      retainCompletedInList: true,
      soundMoments: { 'task-create': true, complete: true, clear: true },
      soundTimbre: 'paper',
      soundVolume: 0.8,
      braindumpFontFamily: 'serif',
      braindumpFontSize: 20,
      braindumpTextColor: 'var(--primary)',
      braindumpClearOnComplete: true,
      braindumpClearDelayMs: 1200,
      braindumpToastDurationMs: 8000,
    }

    // Act
    const next = reducer(initialState, hydrateUserSettings(incoming))

    // Assert
    expect(next).toEqual(incoming)
  })

  it('restores every default on resetUserSettings', () => {
    // Arrange — a fully-enabled state.
    const enabled: UserSettingsState = {
      completionSound: true,
      retainCompletedInList: true,
      soundMoments: { 'task-create': true, complete: true, clear: true },
      soundTimbre: 'paper',
      soundVolume: 0.9,
      braindumpFontFamily: 'serif',
      braindumpFontSize: 24,
      braindumpTextColor: '#abcdef',
      braindumpClearOnComplete: true,
      braindumpClearDelayMs: 2000,
      braindumpToastDurationMs: 7000,
    }

    // Act
    const next = reducer(enabled, resetUserSettings())

    // Assert
    expect(next).toEqual({
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

  it('coalesces a field missing from a persisted blob to its default (shallowMerge forward-compat, Finding 5)', () => {
    // Arrange — an older persisted slice that lacks completionSound, exactly as
    // shallowMerge would leave it after the field was added in a later release.
    const legacyState = stateWith({ retainCompletedInList: true })

    // Act / Assert — the selector returns the default, never undefined.
    expect(selectCompletionSound(legacyState)).toBe(
      DEFAULT_SETTINGS.completionSound,
    )
    expect(selectRetainCompletedInList(legacyState)).toBe(true)
  })

  it('migrates the legacy completionSound to the complete moment ONLY (other moments stay OFF)', () => {
    // Arrange — a pre-palette user who had only the single completion sound ON.
    const legacyState = stateWith({ completionSound: true })

    // Act / Assert — complete inherits the legacy flag; the new moments do not.
    expect(selectSoundMoment(legacyState, 'complete')).toBe(true)
    expect(selectSoundMoment(legacyState, 'task-create')).toBe(false)
    expect(selectSoundMoment(legacyState, 'clear')).toBe(false)
  })

  it('lets an explicit complete toggle WIN over the legacy completionSound (migration contract)', () => {
    // Arrange — legacy flag ON, but the user explicitly turned the complete
    // moment OFF in the new UI.
    const conflictingState = stateWith({
      completionSound: true,
      soundMoments: { 'task-create': false, complete: false, clear: false },
    })

    // Act / Assert — the explicit per-moment value wins, not the legacy flag.
    expect(selectSoundMoment(conflictingState, 'complete')).toBe(false)
  })

  it('falls back to the default timbre and volume for a slice that predates those fields', () => {
    // Arrange — a persisted slice with neither timbre nor volume.
    const legacyState = stateWith({ completionSound: false })

    // Act / Assert
    expect(selectSoundTimbre(legacyState)).toBe('felt')
    expect(selectSoundVolume(legacyState)).toBe(0.6)
  })

  it('selectUserSettings returns every field coalesced to defaults for an empty persisted slice', () => {
    // Arrange — all fields dropped.
    const emptyState = stateWith({})

    // Act
    const settings = selectUserSettings(emptyState)

    // Assert
    expect(settings).toEqual({
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

  it('sets the BrainDump editor font family when setBraindumpFontFamily is dispatched', () => {
    // Act
    const next = reducer(initialState, setBraindumpFontFamily('serif'))

    // Assert
    expect(next.braindumpFontFamily).toBe('serif')
  })

  it('self-heals an unknown BrainDump font family to the default instead of storing it', () => {
    // Act — a payload outside the known ids (a corrupt blob or stray dispatch)
    // must not poison the font-family key. A raw action bypasses the typed creator
    // to exercise the reducer's runtime guard the way malformed input would.
    const next = reducer(initialState, {
      type: setBraindumpFontFamily.type,
      payload: 'comic-sans',
    })

    // Assert — the reducer falls back to the default face.
    expect(next.braindumpFontFamily).toBe('mono')
  })

  it('clamps an out-of-range BrainDump font size into the slider bounds [12,24]', () => {
    // Act — above-range clamps to the ceiling, below-range to the floor, in-range passes.
    const tooBig = reducer(initialState, setBraindumpFontSize(99))
    const tooSmall = reducer(initialState, setBraindumpFontSize(2))
    const inRange = reducer(initialState, setBraindumpFontSize(18))

    // Assert
    expect(tooBig.braindumpFontSize).toBe(24)
    expect(tooSmall.braindumpFontSize).toBe(12)
    expect(inRange.braindumpFontSize).toBe(18)
  })

  it('guards a NaN BrainDump font size to the default instead of poisoning the slider', () => {
    // Act — a non-finite value (e.g. a stray empty slider event) must not stick.
    const next = reducer(initialState, setBraindumpFontSize(Number.NaN))

    // Assert
    expect(next.braindumpFontSize).toBe(14)
  })

  it('stores a custom BrainDump text color when setBraindumpTextColor is dispatched', () => {
    // Act — the native color picker emits a 6-digit hex.
    const next = reducer(initialState, setBraindumpTextColor('#123abc'))

    // Assert
    expect(next.braindumpTextColor).toBe('#123abc')
  })

  it('self-heals an off-shape BrainDump text color to the default instead of storing it', () => {
    // Act — a value that is neither a theme token nor a hex (e.g. a corrupt
    // persisted blob or stray programmatic call) must not reach the inline style.
    const next = reducer(initialState, setBraindumpTextColor('not-a-color'))

    // Assert — the reducer shares the schema's validation boundary and falls back.
    expect(next.braindumpTextColor).toBe('var(--foreground)')
  })

  it('falls back to the default font, size, and color for a slice that predates those fields', () => {
    // Arrange — a persisted slice from before the BrainDump text-style fields existed.
    const legacyState = stateWith({ completionSound: false })

    // Act / Assert — every BrainDump selector coalesces to its default (Finding 5).
    expect(selectBraindumpFontFamily(legacyState)).toBe('mono')
    expect(selectBraindumpFontSize(legacyState)).toBe(14)
    expect(selectBraindumpTextColor(legacyState)).toBe('var(--foreground)')
  })

  it('turns on BrainDump clear-on-complete when setBraindumpClearOnComplete(true) is dispatched', () => {
    // Act
    const next = reducer(initialState, setBraindumpClearOnComplete(true))

    // Assert
    expect(next.braindumpClearOnComplete).toBe(true)
  })

  it('falls back to clear-on-complete OFF for a slice that predates the field', () => {
    // Arrange — a persisted slice from before clear-on-complete existed.
    const legacyState = stateWith({ completionSound: false })

    // Act / Assert — the selector coalesces to the default, never undefined (Finding 5).
    expect(selectBraindumpClearOnComplete(legacyState)).toBe(false)
  })

  it('sets the BrainDump clear delay when setBraindumpClearDelayMs is dispatched', () => {
    // Act
    const next = reducer(initialState, setBraindumpClearDelayMs(1500))

    // Assert
    expect(next.braindumpClearDelayMs).toBe(1500)
  })

  it('clamps an out-of-range BrainDump clear delay into the bounds [0,5000]', () => {
    // Act — above the 5 s undo window clamps to the ceiling, below 0 to the floor,
    // in-range passes through.
    const tooLong = reducer(initialState, setBraindumpClearDelayMs(99000))
    const negative = reducer(initialState, setBraindumpClearDelayMs(-200))
    const inRange = reducer(initialState, setBraindumpClearDelayMs(800))

    // Assert
    expect(tooLong.braindumpClearDelayMs).toBe(5000)
    expect(negative.braindumpClearDelayMs).toBe(0)
    expect(inRange.braindumpClearDelayMs).toBe(800)
  })

  it('guards a NaN BrainDump clear delay to the default instead of poisoning the slider', () => {
    // Act — a non-finite value (e.g. a stray empty slider event) must not stick.
    const next = reducer(initialState, setBraindumpClearDelayMs(Number.NaN))

    // Assert
    expect(next.braindumpClearDelayMs).toBe(500)
  })

  it('falls back to the default clear delay for a slice that predates the field', () => {
    // Arrange — a persisted slice from before the clear delay existed.
    const legacyState = stateWith({ completionSound: false })

    // Act / Assert — the selector coalesces to the 500 ms default, never undefined.
    expect(selectBraindumpClearDelayMs(legacyState)).toBe(500)
  })

  it('sets the BrainDump toast duration when setBraindumpToastDurationMs is dispatched', () => {
    // Act
    const next = reducer(initialState, setBraindumpToastDurationMs(6000))

    // Assert
    expect(next.braindumpToastDurationMs).toBe(6000)
  })

  it('clamps an out-of-range BrainDump toast duration into the bounds [2000,10000]', () => {
    // Act — above the 10 s ceiling clamps down, below the 2 s floor clamps up,
    // in-range passes through.
    const tooLong = reducer(initialState, setBraindumpToastDurationMs(99000))
    const tooShort = reducer(initialState, setBraindumpToastDurationMs(500))
    const inRange = reducer(initialState, setBraindumpToastDurationMs(6000))

    // Assert
    expect(tooLong.braindumpToastDurationMs).toBe(10000)
    expect(tooShort.braindumpToastDurationMs).toBe(2000)
    expect(inRange.braindumpToastDurationMs).toBe(6000)
  })

  it('guards a NaN BrainDump toast duration to the default instead of poisoning the slider', () => {
    // Act — a non-finite value (e.g. a stray empty slider event) must not stick.
    const next = reducer(initialState, setBraindumpToastDurationMs(Number.NaN))

    // Assert
    expect(next.braindumpToastDurationMs).toBe(5000)
  })

  it('falls back to the default toast duration for a slice that predates the field', () => {
    // Arrange — a persisted slice from before the toast duration existed.
    const legacyState = stateWith({ completionSound: false })

    // Act / Assert — the selector coalesces to the 5000 ms default, never undefined.
    expect(selectBraindumpToastDurationMs(legacyState)).toBe(5000)
  })
})
