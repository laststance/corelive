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

import {
  BRAINDUMP_CLEAR_DELAY_MAX_MS,
  BRAINDUMP_CLEAR_DELAY_MIN_MS,
  BRAINDUMP_FONT_FAMILY_IDS,
  BRAINDUMP_FONT_SIZE_MAX_PX,
  BRAINDUMP_FONT_SIZE_MIN_PX,
  BRAINDUMP_TEXT_COLOR_PATTERN,
  type BrainDumpFontFamilyId,
} from '@/lib/constants/braindump'
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
     * Coalesces a missing soundMoments object to the default before writing, so
     * the first toggle never reads `undefined[moment]`. deepMerge normally fills
     * the field from defaults on rehydrate; this coalesce is the read-time backstop.
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
     * Flips EVERY sound moment on or off in one write — the master "All cues"
     * toggle. Writes the explicit literal (not a spread over the current object)
     * so a stale/missing `soundMoments` can't leave a moment behind; the
     * `satisfies Record<SoundMomentId, boolean>` mirrors the schema default and
     * fails compilation if the moment set ever drifts from SOUND_MOMENT_IDS.
     * @param state - Current state
     * @param action - Payload: whether all cues should play.
     * @example
     * dispatch(setAllSoundMoments(true))  // every cue ON
     * dispatch(setAllSoundMoments(false)) // every cue OFF (a silent palette)
     */
    setAllSoundMoments: (state, action: PayloadAction<boolean>) => {
      state.soundMoments = {
        'task-create': action.payload,
        complete: action.payload,
        clear: action.payload,
      } satisfies Record<SoundMomentId, boolean>
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
      // Guard NaN/±Infinity (Math.min/max would let NaN slip through and
      // poison the slider/gain); fall back to the default instead.
      const requestedVolume = action.payload
      state.soundVolume = Number.isFinite(requestedVolume)
        ? Math.min(1, Math.max(0, requestedVolume))
        : DEFAULT_PREFERENCES.soundVolume
    },

    /**
     * Sets the BrainDump editor font family, self-healing an unknown id to the
     * default face so the reducer shares the same validation boundary as the
     * schema/cross-window path (mirrors the guards on the other BrainDump
     * setters). The UI only ever emits valid ids; this hardens against a stray
     * programmatic/persisted value.
     * @param state - Current state
     * @param action - Payload containing the new font-family id.
     */
    setBraindumpFontFamily: (
      state,
      action: PayloadAction<BrainDumpFontFamilyId>,
    ) => {
      const requestedFamily = action.payload
      state.braindumpFontFamily = BRAINDUMP_FONT_FAMILY_IDS.includes(
        requestedFamily,
      )
        ? requestedFamily
        : DEFAULT_PREFERENCES.braindumpFontFamily
    },

    /**
     * Sets the BrainDump editor font size (px), clamped to the slider range so a
     * stray programmatic value can't exceed it; guards NaN/±Infinity to the
     * default (mirrors setSoundVolume).
     * @param state - Current state
     * @param action - Payload containing the new font size in px.
     */
    setBraindumpFontSize: (state, action: PayloadAction<number>) => {
      const requestedSize = action.payload
      state.braindumpFontSize = Number.isFinite(requestedSize)
        ? Math.min(
            BRAINDUMP_FONT_SIZE_MAX_PX,
            Math.max(BRAINDUMP_FONT_SIZE_MIN_PX, requestedSize),
          )
        : DEFAULT_PREFERENCES.braindumpFontSize
    },

    /**
     * Sets the BrainDump editor text color (a theme `var(--token)` or a `#hex`),
     * self-healing an off-shape value to the default so the reducer path shares
     * the same validation boundary as the schema/cross-window path (mirrors the
     * in-reducer guard on setBraindumpFontSize). The UI only ever emits valid
     * values; this hardens against a stray programmatic/persisted string.
     * @param state - Current state
     * @param action - Payload containing the new CSS color string.
     */
    setBraindumpTextColor: (state, action: PayloadAction<string>) => {
      const requestedColor = action.payload
      state.braindumpTextColor = BRAINDUMP_TEXT_COLOR_PATTERN.test(
        requestedColor,
      )
        ? requestedColor
        : DEFAULT_PREFERENCES.braindumpTextColor
    },

    /**
     * Toggles BrainDump clear-on-complete (drop a finished line once its undo
     * window closes). Plain boolean, so no value-healing is needed.
     * @param state - Current state
     * @param action - Payload containing the new braindumpClearOnComplete value
     */
    setBraindumpClearOnComplete: (state, action: PayloadAction<boolean>) => {
      state.braindumpClearOnComplete = action.payload
    },

    /**
     * Sets the BrainDump clear-on-complete linger (ms), clamped to the slider
     * range so a stray programmatic value can't exceed it; guards NaN/±Infinity
     * to the default (mirrors setBraindumpFontSize). Only takes visible effect
     * when braindumpClearOnComplete is ON.
     * @param state - Current state
     * @param action - Payload containing the new clear delay in ms.
     */
    setBraindumpClearDelayMs: (state, action: PayloadAction<number>) => {
      const requestedDelay = action.payload
      state.braindumpClearDelayMs = Number.isFinite(requestedDelay)
        ? Math.min(
            BRAINDUMP_CLEAR_DELAY_MAX_MS,
            Math.max(BRAINDUMP_CLEAR_DELAY_MIN_MS, requestedDelay),
          )
        : DEFAULT_PREFERENCES.braindumpClearDelayMs
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
  setAllSoundMoments,
  setSoundTimbre,
  setSoundVolume,
  setBraindumpFontFamily,
  setBraindumpFontSize,
  setBraindumpTextColor,
  setBraindumpClearOnComplete,
  setBraindumpClearDelayMs,
  hydratePreferences,
  resetPreferences,
} = preferencesSlice.actions

// Selectors — read through `?? DEFAULT` as a read-time backstop: deepMerge
// (store.ts) already fills any field a pre-field persisted blob lacks, so this
// only guards the remaining edges instead of surfacing `undefined` (Finding 5).
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
  // Annotated `| undefined` defensively: deepMerge normally fills soundMoments
  // from defaults on rehydrate, so the read only guards the residual edges where
  // it could still be absent.
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
 * Selects the BrainDump editor font family.
 * @param state - Root state
 * @returns The selected font-family id (default mono)
 */
export const selectBraindumpFontFamily = (
  state: RootState,
): BrainDumpFontFamilyId =>
  state.preferences.braindumpFontFamily ??
  DEFAULT_PREFERENCES.braindumpFontFamily

/**
 * Selects the BrainDump editor font size (px).
 * @param state - Root state
 * @returns The font size in px (default 14)
 */
export const selectBraindumpFontSize = (state: RootState): number =>
  state.preferences.braindumpFontSize ?? DEFAULT_PREFERENCES.braindumpFontSize

/**
 * Selects the BrainDump editor text color (a theme var() token or a #hex).
 * @param state - Root state
 * @returns The CSS color string (default var(--foreground))
 */
export const selectBraindumpTextColor = (state: RootState): string =>
  state.preferences.braindumpTextColor ?? DEFAULT_PREFERENCES.braindumpTextColor

/**
 * Selects the BrainDump clear-on-complete preference.
 * @param state - Root state
 * @returns Whether finished BrainDump lines clear after the undo window (default false)
 */
export const selectBraindumpClearOnComplete = (state: RootState): boolean =>
  state.preferences.braindumpClearOnComplete ??
  DEFAULT_PREFERENCES.braindumpClearOnComplete

/**
 * Selects the BrainDump clear-on-complete linger (ms).
 * @param state - Root state
 * @returns The clear delay in ms (default 500)
 */
export const selectBraindumpClearDelayMs = (state: RootState): number =>
  state.preferences.braindumpClearDelayMs ??
  DEFAULT_PREFERENCES.braindumpClearDelayMs

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
  braindumpFontFamily: selectBraindumpFontFamily(state),
  braindumpFontSize: selectBraindumpFontSize(state),
  braindumpTextColor: selectBraindumpTextColor(state),
  braindumpClearOnComplete: selectBraindumpClearOnComplete(state),
  braindumpClearDelayMs: selectBraindumpClearDelayMs(state),
})

export default preferencesSlice.reducer
