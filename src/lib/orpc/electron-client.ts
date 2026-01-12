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
 * Detects Electron by checking for window.electronAPI which is exposed
 * by the preload script in the main window.
 *
 * Note: Returns false when E2E testing mode is detected via:
 * - `?e2e=true` URL parameter, OR
 * - `window.__E2E_MODE__` global flag (set by preload script when E2E_MODE env is set)
 *
 * This ensures the standard Clerk `<SignIn>` component is used during E2E tests,
 * which is compatible with setupClerkTestingToken.
 *
 * @returns true if running in Electron main window, false otherwise
 * @example
 * isElectronEnvironment() // => true (in Electron)
 * isElectronEnvironment() // => false (in browser or E2E test)
 */
export const isElectronEnvironment = (): boolean => {
  return (
    typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'
  )
}

/**
 * Check if running in Electron floating navigator window.
 *
 * Detects the floating navigator by checking for window.floatingNavigatorAPI
 * which is exposed by the preload-floating script.
 *
 * @returns true if running in floating navigator window, false otherwise
 */
export const isFloatingNavigatorEnvironment = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    typeof window.floatingNavigatorAPI !== 'undefined'
  )
}

/**
 * Check if running in any Electron window (main or floating).
 *
 * @returns true if running in any Electron window, false otherwise
 */
export const isAnyElectronEnvironment = (): boolean => {
  return isElectronEnvironment() || isFloatingNavigatorEnvironment()
}
