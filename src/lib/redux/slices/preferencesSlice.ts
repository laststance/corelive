/**
 * Preferences Slice
 *
 * Redux slice for the core web/Electron user preferences that govern the todo
 * experience (not Electron window chrome — that lives in electronSettings).
 * Persisted to localStorage via redux-storage-middleware and synced live across
 * windows via the preferences BroadcastChannel.
 *
 * @module lib/redux/slices/preferencesSlice
 *
 * @example
 * import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks'
 * import {
 *   selectRetainCompletedInList,
 *   setRetainCompletedInList,
 * } from '@/lib/redux/slices/preferencesSlice'
 *
 * const retain = useAppSelector(selectRetainCompletedInList)
 * const dispatch = useAppDispatch()
 * dispatch(setRetainCompletedInList(true))
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { DEFAULT_PREFERENCES } from '@/lib/constants/preferences'

import type { RootState } from '../store'

/**
 * Interface for the core user-preferences state.
 *
 * @property completionSound - Play a soft sound on completion (opt-in, default OFF).
 * @property retainCompletedInList - 居残りモード: keep checked todos in the active
 *   list with strikethrough instead of moving them to Completed (default OFF).
 */
export interface PreferencesState {
  completionSound: boolean
  retainCompletedInList: boolean
}

/**
 * Default preferences state. Used as initial state and for reset; both fields
 * default OFF so behavior is unchanged for users who never touch the toggles.
 */
export const initialState: PreferencesState = {
  ...DEFAULT_PREFERENCES,
}

/**
 * Redux slice for core user preferences (completion sound + 居残りモード).
 */
export const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    /**
     * Toggles the opt-in completion sound.
     * @param state - Current state
     * @param action - Payload containing the new completionSound value
     */
    setCompletionSound: (state, action: PayloadAction<boolean>) => {
      state.completionSound = action.payload
    },

    /**
     * Toggles 居残りモード (keep completed todos in the active list).
     * @param state - Current state
     * @param action - Payload containing the new retainCompletedInList value
     */
    setRetainCompletedInList: (state, action: PayloadAction<boolean>) => {
      state.retainCompletedInList = action.payload
    },

    /**
     * Replaces the whole preferences state. Used by the cross-window sync to
     * apply preferences received from another window without re-broadcasting.
     * @param _state - Current state (unused, returns new state)
     * @param action - Payload containing the full preferences snapshot
     */
    hydratePreferences: (_state, action: PayloadAction<PreferencesState>) => {
      return { ...action.payload }
    },

    /**
     * Resets all preferences to their default (OFF) values.
     * @param _state - Current state (unused, returns new state)
     */
    resetPreferences: (_state) => {
      return { ...initialState }
    },
  },
})

// Export actions
export const {
  setCompletionSound,
  setRetainCompletedInList,
  hydratePreferences,
  resetPreferences,
} = preferencesSlice.actions

// Selectors — read through `?? DEFAULT` so a field dropped by shallowMerge (a
// field added to this slice AFTER a user persisted it) coalesces to its default
// instead of surfacing `undefined` (eng-review Finding 5).
/**
 * Selects the completion-sound preference.
 * @param state - Root state
 * @returns Whether the opt-in completion sound is enabled (default false)
 */
export const selectCompletionSound = (state: RootState): boolean =>
  state.preferences.completionSound ?? DEFAULT_PREFERENCES.completionSound

/**
 * Selects the 居残りモード (retain-completed-in-list) preference.
 * @param state - Root state
 * @returns Whether completed todos stay in the active list (default false)
 */
export const selectRetainCompletedInList = (state: RootState): boolean =>
  state.preferences.retainCompletedInList ??
  DEFAULT_PREFERENCES.retainCompletedInList

/**
 * Selects the full preferences state (both fields coalesced to defaults).
 * @param state - Root state
 * @returns The complete preferences state
 */
export const selectPreferences = (state: RootState): PreferencesState => ({
  completionSound: selectCompletionSound(state),
  retainCompletedInList: selectRetainCompletedInList(state),
})

export default preferencesSlice.reducer
