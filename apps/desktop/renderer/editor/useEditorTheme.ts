import { applyThemeAttribute } from '@corelive/live-editor/theme-transition'
import { normalizeThemePreference } from '@corelive/live-editor/themes'
import { useLayoutEffect } from 'react'

/**
 * Applies the cached theme preference locally. The raw workspace value is mapped
 * through {@link normalizeThemePreference} (legacy `default-*` aliases and unknown
 * values included) and `system` follows the OS without a network request.
 * Mounted once by the bundled editor and the bundled Settings window; re-runs when the stored theme changes.
 * @param theme - Raw workspace theme preference, or {@link DEFAULT_THEME_PREFERENCE} before the workspace is ready.
 * @example useEditorTheme(preferences.theme)
 */
export function useEditorTheme(theme: string): void {
  useLayoutEffect(() => {
    const preference = normalizeThemePreference(theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      // `system` resolves to the Default pair, the only family that owns light/dark.
      applyThemeAttribute(
        preference === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : preference,
      )
    }
    apply()
    media.addEventListener('change', apply)
    return (): void => media.removeEventListener('change', apply)
  }, [theme])
}
