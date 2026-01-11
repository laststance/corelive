/**
 * Electron Settings Slice
 *
 * Redux slice for managing Electron-specific settings such as
 * dock icon visibility, menu bar presence, and login at startup.
 * This slice is persisted to localStorage via redux-storage-middleware.
 *
 * @module lib/redux/slices/electronSettingsSlice
 *
 * @example
 * // In a component
 * import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks'
 * import { setHideAppIcon, selectHideAppIcon } from '@/lib/redux/slices/electronSettingsSlice'
 *
 * const hideAppIcon = useAppSelector(selectHideAppIcon)
 * const dispatch = useAppDispatch()
 * dispatch(setHideAppIcon(true))
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '../store'

/**
 * Interface for Electron-specific settings state.
 *
 * @property hideAppIcon - Whether the dock icon should be hidden
 * @property showInMenuBar - Whether to show the app in the menu bar
 * @property startAtLogin - Whether to start the app at system login
 */
export interface ElectronSettingsState {
  hideAppIcon: boolean
  showInMenuBar: boolean
  startAtLogin: boolean
}

/**
 * Default state for Electron settings.
 * Used as initial state and for reset operations.
 */
export const initialState: ElectronSettingsState = {
  hideAppIcon: false,
  showInMenuBar: true,
  startAtLogin: false,
}

/**
 * Redux slice for Electron settings.
 * Manages dock icon visibility, menu bar presence, and startup behavior.
 */
export const electronSettingsSlice = createSlice({
  name: 'electronSettings',
  initialState,
  reducers: {
    /**
     * Sets the hideAppIcon setting.
     * When true, the dock icon is hidden using app.setActivationPolicy('accessory').
     *
     * @param state - Current state
     * @param action - Payload containing the new hideAppIcon value
     */
    setHideAppIcon: (state, action: PayloadAction<boolean>) => {
      state.hideAppIcon = action.payload
    },

    /**
     * Sets the showInMenuBar setting.
     * Controls whether the app appears in the system menu bar.
     *
     * @param state - Current state
     * @param action - Payload containing the new showInMenuBar value
     */
    setShowInMenuBar: (state, action: PayloadAction<boolean>) => {
      state.showInMenuBar = action.payload
    },

    /**
     * Sets the startAtLogin setting.
     * Controls whether the app starts automatically at system login.
     *
     * @param state - Current state
     * @param action - Payload containing the new startAtLogin value
     */
    setStartAtLogin: (state, action: PayloadAction<boolean>) => {
      state.startAtLogin = action.payload
    },

    /**
     * Resets all settings to their default values.
     * Useful for clearing user preferences.
     *
     * @param state - Current state
     */
    resetSettings: (state) => {
      state.hideAppIcon = initialState.hideAppIcon
      state.showInMenuBar = initialState.showInMenuBar
      state.startAtLogin = initialState.startAtLogin
    },
  },
})

// Export actions
export const {
  setHideAppIcon,
  setShowInMenuBar,
  setStartAtLogin,
  resetSettings,
} = electronSettingsSlice.actions

// Selectors
/**
 * Selects the hideAppIcon setting from the Redux state.
 *
 * @param state - Root state
 * @returns Whether the dock icon is hidden
 */
export const selectHideAppIcon = (state: RootState): boolean =>
  state.electronSettings.hideAppIcon

/**
 * Selects the showInMenuBar setting from the Redux state.
 *
 * @param state - Root state
 * @returns Whether the app shows in the menu bar
 */
export const selectShowInMenuBar = (state: RootState): boolean =>
  state.electronSettings.showInMenuBar

/**
 * Selects the startAtLogin setting from the Redux state.
 *
 * @param state - Root state
 * @returns Whether the app starts at login
 */
export const selectStartAtLogin = (state: RootState): boolean =>
  state.electronSettings.startAtLogin

/**
 * Selects all Electron settings from the Redux state.
 *
 * @param state - Root state
 * @returns All Electron settings
 */
export const selectElectronSettings = (
  state: RootState,
): ElectronSettingsState => state.electronSettings

export default electronSettingsSlice.reducer
