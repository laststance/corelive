'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps as NextThemesProviderProps } from 'next-themes'
import React from 'react'

/**
 * Available themes in the application.
 * To add a new theme:
 * 1. Add the theme id to this array
 * 2. Add CSS variables in globals.css with `[data-theme='theme-id']` selector
 */
export const THEMES = ['light', 'dark'] as const

export type ThemeId = (typeof THEMES)[number]

/**
 * Theme display metadata for UI components.
 * Key = theme id, value = display properties
 */
export const THEME_META: Record<ThemeId, { name: string; preview: string }> = {
  light: { name: 'Light', preview: '#ffffff' },
  dark: { name: 'Dark', preview: '#1a1a1a' },
}

interface ThemeProviderProps extends Omit<NextThemesProviderProps, 'themes'> {
  children: React.ReactNode
}

/**
 * Theme provider for the application.
 * Wraps next-themes with CoreLive theme configuration.
 * @param children - Child components
 * @returns Provider component
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange={false}
      themes={[...THEMES]}
      storageKey="corelive-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
