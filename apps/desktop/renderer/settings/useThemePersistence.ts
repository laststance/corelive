import { normalizeThemePreference } from '@corelive/live-editor/themes'
import type { ThemePersistence } from '@corelive/live-editor/themes/axis'
import { useSyncExternalStore } from 'react'

import { useSettings } from './SettingsProvider'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Subscribes to the OS light/dark preference. */
function subscribeToSystemScheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', onChange)
  return (): void => media.removeEventListener('change', onChange)
}

/**
 * Adapts the preload-backed preferences to the shared {@link ThemePersistence} contract.
 *
 * The web passes next-themes to the same picker; the bundled Settings window passes this, so a
 * theme change is saved to the device workspace and broadcast to the editor window (DA10, DA11).
 * Called by {@link ElectronSettingsPage}.
 *
 * @returns A persistence adapter bound to the workspace theme preference.
 * @example <ThemeSelector persistence={useThemePersistence()} />
 */
export function useThemePersistence(): ThemePersistence {
  const { theme, updateTheme } = useSettings()
  const systemIsDark = useSyncExternalStore(
    subscribeToSystemScheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  )
  const systemValue = systemIsDark ? 'dark' : 'light'
  // `system` resolves to the Default pair, the only family that owns light/dark.
  const preference = normalizeThemePreference(theme)
  return {
    value: theme,
    resolvedValue: preference === 'system' ? systemValue : preference,
    systemValue,
    setValue: updateTheme,
    mounted: true,
  }
}
