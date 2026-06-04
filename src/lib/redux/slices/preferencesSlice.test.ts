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
  setCompletionSound,
  setRetainCompletedInList,
  type PreferencesState,
} from './preferencesSlice'

// Build a RootState-shaped object carrying only the preferences slice the
// selectors read (other slices are irrelevant to these assertions). The cast
// is deliberate: these tests simulate malformed/partial persisted slices.
function stateWith(preferences: Partial<PreferencesState>): RootState {
  return { preferences } as unknown as RootState
}

describe('preferencesSlice', () => {
  it('defaults both preferences to OFF so behavior is unchanged for new users', () => {
    // Assert
    expect(initialState).toEqual({
      completionSound: false,
      retainCompletedInList: false,
    })
  })

  it('enables the completion sound when setCompletionSound(true) is dispatched', () => {
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

  it('replaces the whole state on hydratePreferences (the cross-window apply path)', () => {
    // Arrange
    const incoming: PreferencesState = {
      completionSound: true,
      retainCompletedInList: true,
    }

    // Act
    const next = reducer(initialState, hydratePreferences(incoming))

    // Assert
    expect(next).toEqual(incoming)
  })

  it('restores both defaults on resetPreferences', () => {
    // Arrange — a fully-enabled state.
    const enabled: PreferencesState = {
      completionSound: true,
      retainCompletedInList: true,
    }

    // Act
    const next = reducer(enabled, resetPreferences())

    // Assert
    expect(next).toEqual({
      completionSound: false,
      retainCompletedInList: false,
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

  it('selectPreferences returns both fields coalesced to defaults for an empty persisted slice', () => {
    // Arrange — both fields dropped.
    const emptyState = stateWith({})

    // Act
    const preferences = selectPreferences(emptyState)

    // Assert
    expect(preferences).toEqual({
      completionSound: false,
      retainCompletedInList: false,
    })
  })
})
