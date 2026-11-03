'use client'

import { deriveThemeAxis } from '@corelive/live-editor/themes/axis'
import type {
  ThemeAxis,
  ThemePersistence,
} from '@corelive/live-editor/themes/axis'
import { useTheme } from 'next-themes'

import { useMounted } from '@/hooks/use-mounted'

export type { ThemeAxis, ThemePersistence }

/**
 * Adapts next-themes to the shared {@link ThemePersistence} contract.
 *
 * Why it exists: the shared picker in `@corelive/live-editor` must not import next-themes, so the
 * web wraps it here. Called by {@link useThemeAxis} and by the Settings page that renders the
 * shared ThemeSelector.
 * @returns a persistence adapter bound to the current next-themes state.
 * @example
 * const persistence = useNextThemesPersistence()
 */
export function useNextThemesPersistence(): ThemePersistence {
  const { theme, resolvedTheme, systemTheme, setTheme } = useTheme()
  const mounted = useMounted()
  return {
    value: theme,
    resolvedValue: resolvedTheme,
    systemValue: systemTheme,
    setValue: setTheme,
    mounted,
  }
}

/**
 * Drives the two-axis theme picker (sidebar quick-switch) from next-themes.
 * @returns the {@link ThemeAxis} state and actions for the stored theme.
 * @example
 * const { family, mode, setFamily, setMode } = useThemeAxis()
 */
export function useThemeAxis(): ThemeAxis {
  return deriveThemeAxis(useNextThemesPersistence())
}
