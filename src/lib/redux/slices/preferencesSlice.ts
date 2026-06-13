/**
 * Preferences Slice
 *
 * Redux slice for the core web/Electron user preferences that govern the todo
 * experience (not Electron window chrome — that lives in electronSettings).
 * Persisted to localStorage via redux-storage-middleware and synced live across
 * windows via the preferences BroadcastChannel. The state SHAPE is owned by
 * `PreferencesStateSchema` (the Zod SSoT); this slice only adds the reducers,
 * selectors, and the legacy→palette migration on read.
 *
 * @module lib/redux/slices/preferencesSlice
 *
 * @example
 * import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks'
 * import {
 *   selectSoundMoment,
 *   setSoundMoment,
 * } from '@/lib/redux/slices/preferencesSlice'
 *
 * const completeEnabled = useAppSelector((s) => selectSoundMoment(s, 'complete'))
 * const dispatch = useAppDispatch()
 * dispatch(setSoundMoment({ moment: 'complete', enabled: true }))
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { DEFAULT_PREFERENCES } from '@/lib/constants/preferences'
import { type SoundMomentId, type TimbreId } from '@/lib/constants/sound'
import { type PreferencesState } from '@/lib/schemas/preferences'

import type { RootState } from '../store'

// The preferences SHAPE is the Zod schema's inferred type (D2 SSoT). Re-exported
// so existing importers (sync-channel, tests) keep importing it from the slice.
export type { PreferencesState }

/**
 * Default preferences state. Used as initial state and for reset; sourced from
 * the schema SSoT so every field defaults OFF/neutral and behavior is unchanged
 * for users who never touch the toggles.
 */
export const initialState = { ...DEFAULT_PREFERENCES }

/**
 * Redux slice for core user preferences: the sound palette (per-moment toggles,
 * timbre, master volume) plus 居残りモード, plus the legacy completionSound flag.
 */
export const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    /**
     * Toggles the LEGACY single completion sound. Retained as a read-only
     * fallback the 'complete' moment migrates from; new UI writes setSoundMoment.
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
     * Sets ON/OFF for a single sound moment (task-create / complete / clear).
     * Coalesces a missing soundMoments object (a legacy persisted blob that
     * predates the field — shallowMerge replaces the whole slice) to the default
     * before writing, so the first toggle never reads `undefined[moment]`.
     * @param state - Current state
     * @param action - Payload: which moment, and whether it should play.
     */
    setSoundMoment: (
      state,
      action: PayloadAction<{ moment: SoundMomentId; enabled: boolean }>,
    ) => {
      const currentMoments =
        state.soundMoments ?? DEFAULT_PREFERENCES.soundMoments
      state.soundMoments = {
        ...currentMoments,
        [action.payload.moment]: action.payload.enabled,
      }
    },

    /**
     * Selects the active timbre for every enabled moment.
     * @param state - Current state
     * @param action - Payload containing the new timbre id.
     */
    setSoundTimbre: (state, action: PayloadAction<TimbreId>) => {
      state.soundTimbre = action.payload
    },

    /**
     * Sets the master sound volume, clamped to [0,1] so a stray programmatic
     * value can never exceed the range the slider enforces.
     * @param state - Current state
     * @param action - Payload containing the new volume (0–1).
     */
    setSoundVolume: (state, action: PayloadAction<number>) => {
      state.soundVolume = Math.min(1, Math.max(0, action.payload))
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
  setSoundMoment,
  setSoundTimbre,
  setSoundVolume,
  hydratePreferences,
  resetPreferences,
} = preferencesSlice.actions

// Selectors — read through `?? DEFAULT` so a field dropped by shallowMerge (the
// whole preferences slice is replaced by a persisted blob that predates the
// field) coalesces to its default instead of surfacing `undefined` (Finding 5).
/**
 * Selects the LEGACY completion-sound preference.
 * @param state - Root state
 * @returns Whether the legacy completion sound is enabled (default false)
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
 * Selects whether a given sound moment should play, with legacy migration: a
 * pre-palette user only had `completionSound`, which maps to the 'complete'
 * moment ONLY; every other moment defaults OFF. An explicit per-moment toggle
 * always WINS over the legacy flag (migration contract).
 * @param state - Root state
 * @param moment - Which moment to read (task-create / complete / clear).
 * @returns
 * - When the moment has an explicit toggle: that boolean
 * - For 'complete' with no explicit toggle: the legacy completionSound
 * - Otherwise: the moment's default (false)
 * @example
 * selectSoundMoment(state, 'complete') // legacy completionSound:true => true
 * selectSoundMoment(state, 'clear')    // no legacy mapping            => false
 */
export const selectSoundMoment = (
  state: RootState,
  moment: SoundMomentId,
): boolean => {
  // Annotated `| undefined`: shallowMerge replaces the whole preferences slice,
  // so a pre-soundMoments persisted blob has no soundMoments at runtime.
  const soundMoments: PreferencesState['soundMoments'] | undefined =
    state.preferences.soundMoments
  const explicit = soundMoments?.[moment]
  if (typeof explicit === 'boolean') return explicit
  if (moment === 'complete') {
    return (
      state.preferences.completionSound ?? DEFAULT_PREFERENCES.completionSound
    )
  }
  return DEFAULT_PREFERENCES.soundMoments[moment]
}

/**
 * Selects the active sound timbre id.
 * @param state - Root state
 * @returns The selected timbre id (default felt)
 */
export const selectSoundTimbre = (state: RootState): TimbreId =>
  state.preferences.soundTimbre ?? DEFAULT_PREFERENCES.soundTimbre

/**
 * Selects the master sound volume.
 * @param state - Root state
 * @returns The master volume, 0–1 (default 0.6)
 */
export const selectSoundVolume = (state: RootState): number =>
  state.preferences.soundVolume ?? DEFAULT_PREFERENCES.soundVolume

/**
 * Selects the full preferences state (every field coalesced/migrated to its
 * effective value) — the snapshot the cross-window sync broadcasts.
 * @param state - Root state
 * @returns The complete, effective preferences state
 */
export const selectPreferences = (state: RootState): PreferencesState => ({
  completionSound: selectCompletionSound(state),
  retainCompletedInList: selectRetainCompletedInList(state),
  soundMoments: {
    'task-create': selectSoundMoment(state, 'task-create'),
    complete: selectSoundMoment(state, 'complete'),
    clear: selectSoundMoment(state, 'clear'),
  },
  soundTimbre: selectSoundTimbre(state),
  soundVolume: selectSoundVolume(state),
})

export default preferencesSlice.reducer
