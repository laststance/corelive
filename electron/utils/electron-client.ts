import type {
  ElectronAPI,
  LiveEditorAPI,
  LiveEditorSettingsAPI,
} from '../types/electron-api'

/**
 * @fileoverview Electron Environment Detection
 *
 * In WebView architecture, the Electron app loads https://corelive.app/ directly,
 * so data operations use the same oRPC client as the web version.
 *
 * This module provides utility functions for detecting Electron environment,
 * which is still needed for:
 * - Auth sync between web and Electron main process
 * - Electron-specific UI features (window controls, notifications)
 * - Platform-specific behavior in components
 *
 * Note: The old ElectronIPCLink and createElectronClient have been removed
 * as data operations now use oRPC via HTTP.
 */

/**
 * Check if running in Electron environment.
 *
 * Detects Electron by checking for window.electronAPI, which the Settings and
 * login window preloads expose.
 *
 * @returns true if running in an Electron window with electronAPI, false otherwise
 * @example
 * isElectronEnvironment() // => true (in Electron)
 * isElectronEnvironment() // => false (in browser)
 */
export const isElectronEnvironment = (): boolean => {
  return (
    typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'
  )
}

/**
 * Returns the LiveEditor preload bridge across canonical and pre-rename installed desktop versions.
 * @returns The available LiveEditor API, or undefined in a regular browser.
 * @example const note = await getLiveEditorAPI()?.note.get(1)
 */
export const getLiveEditorAPI = (): LiveEditorAPI | undefined => {
  if (typeof window === 'undefined') return undefined
  return window.liveEditorAPI ?? window.brainDumpAPI
}

/**
 * Returns the main Settings LiveEditor bridge while web and desktop releases cross versions independently.
 * @returns The available Settings bridge, or undefined outside a compatible Electron main renderer.
 * @example await getLiveEditorSettingsAPI()?.setOpacity(0.85)
 */
export const getLiveEditorSettingsAPI = ():
  LiveEditorSettingsAPI | undefined => {
  if (typeof window === 'undefined') return undefined
  const electronAPI: ElectronAPI | undefined = window.electronAPI
  return electronAPI?.liveEditor ?? electronAPI?.brainDump
}

/**
 * Check if running in the LiveEditor frameless window.
 *
 * Detects the LiveEditor host by checking for `window.liveEditorAPI`, which is
 * exposed only by `preload-live-editor.ts`. Use this from the LiveEditor renderer
 * (`src/components/live-editor/*`) to skip API calls when the same React route is
 * rendered in a regular browser tab during dev.
 *
 * @returns true if running in LiveEditor window, false otherwise
 * @example
 * if (isLiveEditorEnvironment()) {
 *   await window.liveEditorAPI.window.setOpacity(0.85)
 * }
 */
export const isLiveEditorEnvironment = (): boolean => {
  return getLiveEditorAPI() !== undefined
}
