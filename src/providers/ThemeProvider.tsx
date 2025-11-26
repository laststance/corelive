'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps as NextThemesProviderProps } from 'next-themes'
import React, { createContext, useContext } from 'react'

/**
 * Theme names for the CoreLive DesignSystem
 * Supporting 100+ themes across different categories
 */
export const CORELIVE_THEMES = {
  // Default themes from shadcn/ui (Free tier)
  DEFAULT: {
    LIGHT: 'light',
    DARK: 'dark',
  },
} as const

// Extract all theme values into a flat array
export const ALL_THEMES = Object.values(CORELIVE_THEMES).flatMap((category) =>
  Object.values(category),
)

// Theme categories for filtering
export const THEME_CATEGORIES = {
  FREE: [...Object.values(CORELIVE_THEMES.DEFAULT)],
} as const

// Theme metadata for UI display
export const THEME_METADATA: Record<
  string,
  {
    name: string
    category: 'dark' | 'light'
    isPremium: boolean
    description?: string
    preview?: string // Preview color or gradient
  }
> = {
  // Default shadcn/ui themes
  [CORELIVE_THEMES.DEFAULT.LIGHT]: {
    name: 'Light',
    category: 'light',
    isPremium: false,
    description: 'Clean and minimal light theme',
    preview: '#ffffff',
  },
  [CORELIVE_THEMES.DEFAULT.DARK]: {
    name: 'Dark',
    category: 'dark',
    isPremium: false,
    description: 'Modern dark theme',
    preview: '#1a1a1a',
  },
}

// Context for theme-related utilities
interface ThemeContextValue {
  themes: typeof ALL_THEMES
  categories: typeof THEME_CATEGORIES
  metadata: typeof THEME_METADATA
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function useThemeContext() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider')
  }
  return context
}

interface ThemeProviderProps extends Omit<NextThemesProviderProps, 'themes'> {
  children: React.ReactNode
}

/**
 * CoreLive ThemeProvider component
 * Wraps next-themes provider with our custom theme configuration
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const themeContextValue: ThemeContextValue = {
    themes: ALL_THEMES,
    categories: THEME_CATEGORIES,
    metadata: THEME_METADATA,
  }

  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange={false}
      themes={ALL_THEMES}
      storageKey="corelive-theme"
      {...props}
    >
      <ThemeContext.Provider value={themeContextValue}>
        {children}
      </ThemeContext.Provider>
    </NextThemesProvider>
  )
}
