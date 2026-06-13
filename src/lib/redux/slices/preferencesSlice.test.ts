import { describe, expect, it } from 'vitest'

import { DEFAULT_PREFERENCES } from '@/lib/constants/preferences'

import type { RootState } from '../store'

import reducer, {
  hydratePreferences,
  initialState,
  resetPreferences,
  selectCompletionSound,
  selectPreferences,
  selectRetainCompletedInList,
  selectSoundMoment,
  selectSoundTimbre,
  selectSoundVolume,
  setCompletionSound,
  setRetainCompletedInList,
  setSoundMoment,
  setSoundTimbre,
  setSoundVolume,
  type PreferencesState,
} from './preferencesSlice'

// Build a RootState-shaped object carrying only the preferences slice the
// selectors read (other slices are irrelevant to these assertions). The cast
// is deliberate: these tests simulate malformed/partial persisted slices.
function stateWith(preferences: Partial<PreferencesState>): RootState {
  return { preferences } as unknown as RootState
}

describe('preferencesSlice', () => {
  it('defaults every preference to silent/neutral so a fresh install makes no sound', () => {
    // Assert — all sound moments OFF, default timbre + volume, both legacy flags OFF.
    expect(initialState).toEqual({
      completionSound: false,
      retainCompletedInList: false,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
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
    } as unknown as PreferencesState

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

  it('replaces the whole state on hydratePreferences (the cross-window apply path)', () => {
    // Arrange
    const incoming: PreferencesState = {
      completionSound: true,
      retainCompletedInList: true,
      soundMoments: { 'task-create': true, complete: true, clear: true },
      soundTimbre: 'paper',
      soundVolume: 0.8,
    }

    // Act
    const next = reducer(initialState, hydratePreferences(incoming))

    // Assert
    expect(next).toEqual(incoming)
  })

  it('restores every default on resetPreferences', () => {
    // Arrange — a fully-enabled state.
    const enabled: PreferencesState = {
      completionSound: true,
      retainCompletedInList: true,
      soundMoments: { 'task-create': true, complete: true, clear: true },
      soundTimbre: 'paper',
      soundVolume: 0.9,
    }

    // Act
    const next = reducer(enabled, resetPreferences())

    // Assert
    expect(next).toEqual({
      completionSound: false,
      retainCompletedInList: false,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
    })
  })

  it('coalesces a field missing from a persisted blob to its default (shallowMerge forward-compat, Finding 5)', () => {
    // Arrange — an older persisted slice that lacks completionSound, exactly as
    // shallowMerge would leave it after the field was added in a later release.
    const legacyState = stateWith({ retainCompletedInList: true })

    // Act / Assert — the selector returns the default, never undefined.
    expect(selectCompletionSound(legacyState)).toBe(
      DEFAULT_PREFERENCES.completionSound,
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

  it('selectPreferences returns every field coalesced to defaults for an empty persisted slice', () => {
    // Arrange — all fields dropped.
    const emptyState = stateWith({})

    // Act
    const preferences = selectPreferences(emptyState)

    // Assert
    expect(preferences).toEqual({
      completionSound: false,
      retainCompletedInList: false,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
    })
  })
})
