'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps as NextThemesProviderProps } from 'next-themes'
import React from 'react'

import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  THEME_REGISTRY,
} from '@/lib/themes/registry'
import type { ThemeId } from '@/lib/themes/registry'

import { ThemeAllowlistGuard } from './ThemeAllowlistGuard'
import { ThemeTransition } from './ThemeTransition'

/**
 * Available theme ids, sourced from the theme registry (the single source of
 * truth). To add a theme, add a seed to `src/lib/themes/registry.ts` — never
 * here and never directly in globals.css.
 */
export const THEMES = THEME_IDS

export type { ThemeId }

/**
 * Theme display metadata for picker UI, derived from the registry so it never
 * drifts from the source of truth and automatically includes new families.
 * Key = theme id, value = display properties.
 * The assertion is required because `Object.fromEntries` cannot express a
 * literal-keyed Record; the keys come straight from THEME_IDS, so it is exact.
 */
export const THEME_META = Object.fromEntries(
  THEME_IDS.map((id) => [
    id,
    { name: THEME_REGISTRY[id].name, preview: THEME_REGISTRY[id].preview },
  ]),
) as Record<ThemeId, { name: string; preview: string }>

interface ThemeProviderProps extends Omit<NextThemesProviderProps, 'themes'> {
  children: React.ReactNode
}

/**
 * Theme provider for the application.
 * Wraps next-themes with CoreLive theme configuration.
 * @param children - Child components
 * @returns Provider component
 */
export const ThemeProvider = React.memo(function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps) {
  const themes = React.useMemo(() => [...THEMES], [])

  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme={DEFAULT_THEME_ID}
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange={false}
      themes={themes}
      storageKey="corelive-theme"
      {...props}
    >
      {/* Self-heals a stale/tampered persisted theme back to the default
          (next-themes does not validate its own localStorage value). */}
      <ThemeAllowlistGuard />
      {/* Crossfades the whole UI during a theme switch by toggling a transient
          class on <html>, without animating every hover/focus interaction. */}
      <ThemeTransition />
      {children}
    </NextThemesProvider>
  )
})
