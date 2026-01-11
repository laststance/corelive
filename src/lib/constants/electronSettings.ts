/**
 * Shared Electron Settings Constants
 *
 * Default values for Electron settings used across client and server.
 * This ensures consistency between Redux state and database defaults.
 *
 * @module lib/constants/electronSettings
 */

/**
 * Default values for Electron settings.
 * Used when creating new settings records in both Redux and database.
 */
export const DEFAULT_ELECTRON_SETTINGS = {
  hideAppIcon: false,
  showInMenuBar: true,
  startAtLogin: false,
} as const
