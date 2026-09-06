/**
 * Settings Slice
 *
 * Redux slice for the core web/Electron user settings that govern the todo
 * experience (not Electron window chrome — that lives in electronSettings).
 * Persisted to localStorage via redux-storage-middleware and synced live across
 * windows via the settings BroadcastChannel. The state SHAPE is owned by
 * {@link UserSettingsStateSchema}; this slice adds reducers and selectors.
 *
 * @module lib/redux/slices/settingsSlice
 *
 * @example
 * import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks'
 * import {
 *   selectShowCompletedTaskStrikethrough,
 *   setShowCompletedTaskStrikethrough,
 * } from '@/lib/redux/slices/settingsSlice'
 *
 * const showStrikethrough = useAppSelector(selectShowCompletedTaskStrikethrough)
 * const dispatch = useAppDispatch()
 * dispatch(setShowCompletedTaskStrikethrough(false))
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import {
  LIVE_EDITOR_CLEAR_DELAY_MAX_MS,
  LIVE_EDITOR_CLEAR_DELAY_MIN_MS,
  LIVE_EDITOR_FONT_FAMILY_IDS,
  LIVE_EDITOR_FONT_SIZE_MAX_PX,
  LIVE_EDITOR_FONT_SIZE_MIN_PX,
  LIVE_EDITOR_TEXT_COLOR_PATTERN,
  LIVE_EDITOR_TOAST_DURATION_MAX_MS,
  LIVE_EDITOR_TOAST_DURATION_MIN_MS,
  type LiveEditorFontFamilyId,
} from '@/lib/constants/live-editor'
import { DEFAULT_SETTINGS } from '@/lib/constants/settings'
import { type UserSettingsState } from '@/lib/schemas/settings'

import type { RootState } from '../store'

// The settings SHAPE is the Zod schema's inferred type (D2 SSoT). Re-exported
// so sync and test callers share the same canonical type.
export type { UserSettingsState }

/**
 * Default settings state. Used as initial state and for reset; sourced from
 * the schema SSoT so every field preserves the established behavior for users
 * who never touch the toggles.
 */
export const initialState = { ...DEFAULT_SETTINGS }

/**
 * Redux slice for core user settings: task presentation and
 * LiveEditor appearance/behavior shared by web and Electron renderers.
 */
export const userSettingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    /**
     * Controls whether completed task titles use a strikethrough in Home's completed history.
     * @param state - Current state.
     * @param action - Payload containing the new strikethrough visibility.
     * @returns Nothing; Redux Toolkit records the state mutation.
     * @example
     * dispatch(setShowCompletedTaskStrikethrough(false))
     */
    setShowCompletedTaskStrikethrough: (
      state,
      action: PayloadAction<boolean>,
    ) => {
      state.showCompletedTaskStrikethrough = action.payload
    },

    /**
     * Saves Ember visibility when {@link TaskSettings} toggles the shared LiveEditor feedback.
     * @param state - Current settings.
     * @param action - Whether Today Ember should be visible.
     * @returns Nothing; Redux Toolkit records the setting change.
     * @example
     * dispatch(setShowTodayEmber(true))
     */
    setShowTodayEmber: (state, action: PayloadAction<boolean>) => {
      state.showTodayEmber = action.payload
    },

    /**
     * Sets the LiveEditor editor font family, self-healing an unknown id to the
     * default face so the reducer shares the same validation boundary as the
     * schema/cross-window path (mirrors the guards on the other LiveEditor
     * setters). The UI only ever emits valid ids; this hardens against a stray
     * programmatic/persisted value.
     * @param state - Current state
     * @param action - Payload containing the new font-family id.
     */
    setLiveEditorFontFamily: (
      state,
      action: PayloadAction<LiveEditorFontFamilyId>,
    ) => {
      const requestedFamily = action.payload
      state.liveEditorFontFamily = LIVE_EDITOR_FONT_FAMILY_IDS.includes(
        requestedFamily,
      )
        ? requestedFamily
        : DEFAULT_SETTINGS.liveEditorFontFamily
    },

    /**
     * Sets the LiveEditor editor font size (px), clamped to the slider range so a
     * stray programmatic value can't exceed it; guards NaN/±Infinity to the
     * default.
     * @param state - Current state
     * @param action - Payload containing the new font size in px.
     */
    setLiveEditorFontSize: (state, action: PayloadAction<number>) => {
      const requestedSize = action.payload
      state.liveEditorFontSize = Number.isFinite(requestedSize)
        ? Math.min(
            LIVE_EDITOR_FONT_SIZE_MAX_PX,
            Math.max(LIVE_EDITOR_FONT_SIZE_MIN_PX, requestedSize),
          )
        : DEFAULT_SETTINGS.liveEditorFontSize
    },

    /**
     * Sets the LiveEditor editor text color (a theme `var(--token)` or a `#hex`),
     * self-healing an off-shape value to the default so the reducer path shares
     * the same validation boundary as the schema/cross-window path (mirrors the
     * in-reducer guard on setLiveEditorFontSize). The UI only ever emits valid
     * values; this hardens against a stray programmatic/persisted string.
     * @param state - Current state
     * @param action - Payload containing the new CSS color string.
     */
    setLiveEditorTextColor: (state, action: PayloadAction<string>) => {
      const requestedColor = action.payload
      state.liveEditorTextColor = LIVE_EDITOR_TEXT_COLOR_PATTERN.test(
        requestedColor,
      )
        ? requestedColor
        : DEFAULT_SETTINGS.liveEditorTextColor
    },

    /**
     * Toggles LiveEditor clear-on-complete (drop a finished line once its undo
     * window closes). Plain boolean, so no value-healing is needed.
     * @param state - Current state
     * @param action - Payload containing the new liveEditorClearOnComplete value
     */
    setLiveEditorClearOnComplete: (state, action: PayloadAction<boolean>) => {
      state.liveEditorClearOnComplete = action.payload
    },

    /**
     * Sets the LiveEditor clear-on-complete linger (ms), clamped to the slider
     * range so a stray programmatic value can't exceed it; guards NaN/±Infinity
     * to the default (mirrors setLiveEditorFontSize). Only takes visible effect
     * when liveEditorClearOnComplete is ON.
     * @param state - Current state
     * @param action - Payload containing the new clear delay in ms.
     */
    setLiveEditorClearDelayMs: (state, action: PayloadAction<number>) => {
      const requestedDelay = action.payload
      state.liveEditorClearDelayMs = Number.isFinite(requestedDelay)
        ? Math.min(
            LIVE_EDITOR_CLEAR_DELAY_MAX_MS,
            Math.max(LIVE_EDITOR_CLEAR_DELAY_MIN_MS, requestedDelay),
          )
        : DEFAULT_SETTINGS.liveEditorClearDelayMs
    },

    /**
     * Sets the LiveEditor completion-toast display duration (ms), clamped to the
     * slider range so a stray programmatic value can't exceed it; guards
     * NaN/±Infinity to the default (mirrors setLiveEditorClearDelayMs). Governs how
     * long the completion toast (with its Undo + close ✕) stays before auto-close.
     * @param state - Current state
     * @param action - Payload containing the new toast duration in ms.
     */
    setLiveEditorToastDurationMs: (state, action: PayloadAction<number>) => {
      const requestedDuration = action.payload
      state.liveEditorToastDurationMs = Number.isFinite(requestedDuration)
        ? Math.min(
            LIVE_EDITOR_TOAST_DURATION_MAX_MS,
            Math.max(LIVE_EDITOR_TOAST_DURATION_MIN_MS, requestedDuration),
          )
        : DEFAULT_SETTINGS.liveEditorToastDurationMs
    },

    /**
     * Replaces the whole settings state. Used by the cross-window sync to
     * apply settings received from another window without re-broadcasting.
     * @param _state - Current state (unused, returns new state)
     * @param action - Payload containing the full settings snapshot
     */
    hydrateUserSettings: (_state, action: PayloadAction<UserSettingsState>) => {
      return { ...action.payload }
    },

    /**
     * Resets all settings to the schema-owned defaults.
     * @param _state - Current state (unused, returns new state)
     */
    resetUserSettings: (_state) => {
      return { ...initialState }
    },
  },
})

// Export actions
export const {
  setShowCompletedTaskStrikethrough,
  setShowTodayEmber,
  setLiveEditorFontFamily,
  setLiveEditorFontSize,
  setLiveEditorTextColor,
  setLiveEditorClearOnComplete,
  setLiveEditorClearDelayMs,
  setLiveEditorToastDurationMs,
  hydrateUserSettings,
  resetUserSettings,
} = userSettingsSlice.actions

// Selectors — read through `?? DEFAULT` as a read-time backstop: deepMerge
// (store.ts) already fills any field a pre-field persisted blob lacks, so this
// only guards the remaining edges instead of surfacing `undefined` (Finding 5).
/**
 * Selects whether completed task titles use a strikethrough in Home's completed history.
 * @param state - Root state.
 * @returns Whether the completed-title strikethrough is visible (default true).
 * @example
 * selectShowCompletedTaskStrikethrough(state) // => true
 */
export const selectShowCompletedTaskStrikethrough = (
  state: RootState,
): boolean =>
  state.settings.showCompletedTaskStrikethrough ??
  DEFAULT_SETTINGS.showCompletedTaskStrikethrough

/**
 * Reads the opt-in Ember setting for {@link LiveEditor} and {@link TaskSettings}, including older saved settings.
 * @param state - Root state.
 * @returns True only for an explicitly enabled Ember; missing or corrupt values stay off.
 * @example
 * selectShowTodayEmber(state) // => false on a fresh install
 */
export const selectShowTodayEmber = (state: RootState): boolean =>
  state.settings.showTodayEmber === true

/**
 * Selects the LiveEditor editor font family.
 * @param state - Root state
 * @returns The selected font-family id (default mono)
 */
export const selectLiveEditorFontFamily = (
  state: RootState,
): LiveEditorFontFamilyId =>
  state.settings.liveEditorFontFamily ?? DEFAULT_SETTINGS.liveEditorFontFamily

/**
 * Selects the LiveEditor editor font size (px).
 * @param state - Root state
 * @returns The font size in px (default 14)
 */
export const selectLiveEditorFontSize = (state: RootState): number =>
  state.settings.liveEditorFontSize ?? DEFAULT_SETTINGS.liveEditorFontSize

/**
 * Selects the LiveEditor editor text color (a theme var() token or a #hex).
 * @param state - Root state
 * @returns The CSS color string (default var(--foreground))
 */
export const selectLiveEditorTextColor = (state: RootState): string =>
  state.settings.liveEditorTextColor ?? DEFAULT_SETTINGS.liveEditorTextColor

/**
 * Selects the LiveEditor clear-on-complete setting.
 * @param state - Root state
 * @returns Whether finished LiveEditor lines clear after the undo window (default false)
 */
export const selectLiveEditorClearOnComplete = (state: RootState): boolean =>
  state.settings.liveEditorClearOnComplete ??
  DEFAULT_SETTINGS.liveEditorClearOnComplete

/**
 * Selects the LiveEditor clear-on-complete linger (ms).
 * @param state - Root state
 * @returns The clear delay in ms (default 500)
 */
export const selectLiveEditorClearDelayMs = (state: RootState): number =>
  state.settings.liveEditorClearDelayMs ??
  DEFAULT_SETTINGS.liveEditorClearDelayMs

/**
 * Selects the LiveEditor completion-toast display duration (ms).
 * @param state - Root state
 * @returns The toast duration in ms (default 5000)
 */
export const selectLiveEditorToastDurationMs = (state: RootState): number =>
  state.settings.liveEditorToastDurationMs ??
  DEFAULT_SETTINGS.liveEditorToastDurationMs

/**
 * Selects the full settings state (every field coalesced to its
 * effective value) — the snapshot the cross-window sync broadcasts.
 * @param state - Root state
 * @returns The complete, effective settings state
 */
export const selectUserSettings = (state: RootState): UserSettingsState => ({
  showCompletedTaskStrikethrough: selectShowCompletedTaskStrikethrough(state),
  showTodayEmber: selectShowTodayEmber(state),
  liveEditorFontFamily: selectLiveEditorFontFamily(state),
  liveEditorFontSize: selectLiveEditorFontSize(state),
  liveEditorTextColor: selectLiveEditorTextColor(state),
  liveEditorClearOnComplete: selectLiveEditorClearOnComplete(state),
  liveEditorClearDelayMs: selectLiveEditorClearDelayMs(state),
  liveEditorToastDurationMs: selectLiveEditorToastDurationMs(state),
})

export default userSettingsSlice.reducer
