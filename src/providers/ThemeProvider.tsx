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

  // CoreLive base themes (Free tier)
  CORELIVE_BASE: {
    LIGHT: 'corelive-base-light',
    DARK: 'corelive-base-dark',
  },

  // Traditional TODO themes (Free tier)
  TRADITIONAL: {
    LIGHT: 'traditional-light',
    DARK: 'traditional-dark',
  },

  // Harmonized themes (from harmonized-palette.css)
  HARMONIZED: {
    RED: 'harmonized-red',
    RED_DARK: 'harmonized-red-dark',
    MUSTARD: 'harmonized-mustard',
    MUSTARD_DARK: 'harmonized-mustard-dark',
    TURQUOISE: 'harmonized-turquoise',
    TURQUOISE_DARK: 'harmonized-turquoise-dark',
    AZURE: 'harmonized-azure',
    AZURE_DARK: 'harmonized-azure-dark',
    FUCHSIA: 'harmonized-fuchsia',
    FUCHSIA_DARK: 'harmonized-fuchsia-dark',
  },

  // Premium Dark themes (30 variants)
  DARK: {
    MIDNIGHT: 'dark-midnight',
    CHARCOAL: 'dark-charcoal',
    OBSIDIAN: 'dark-obsidian',
    NOIR: 'dark-noir',
    SHADOW: 'dark-shadow',
    // ... more to be added
  },

  // Premium Light themes (20 variants)
  LIGHT: {
    PEARL: 'light-pearl',
    SNOW: 'light-snow',
    CREAM: 'light-cream',
    ALABASTER: 'light-alabaster',
    IVORY: 'light-ivory',
    // ... more to be added
  },

  // Gradient themes (20 variants)
  GRADIENT: {
    AURORA: 'gradient-aurora',
    SUNSET: 'gradient-sunset',
    OCEAN: 'gradient-ocean',
    FOREST: 'gradient-forest',
    NEBULA: 'gradient-nebula',
    // ... more to be added
  },

  // Retro/Vintage themes (15 variants)
  RETRO: {
    SYNTHWAVE: 'retro-synthwave',
    VAPORWAVE: 'retro-vaporwave',
    TERMINAL: 'retro-terminal',
    SEPIA: 'retro-sepia',
    NEON: 'retro-neon',
    // ... more to be added
  },

  // Seasonal themes (15 variants)
  SEASONAL: {
    SPRING_BLOSSOM: 'seasonal-spring-blossom',
    SUMMER_BEACH: 'seasonal-summer-beach',
    AUTUMN_FOREST: 'seasonal-autumn-forest',
    WINTER_SNOW: 'seasonal-winter-snow',
    HOLIDAY: 'seasonal-holiday',
    // ... more to be added
  },
} as const

// Extract all theme values into a flat array
export const ALL_THEMES = Object.values(CORELIVE_THEMES).flatMap((category) =>
  Object.values(category),
)

// Theme categories for filtering
export const THEME_CATEGORIES = {
  FREE: [
    ...Object.values(CORELIVE_THEMES.DEFAULT),
    ...Object.values(CORELIVE_THEMES.CORELIVE_BASE),
    ...Object.values(CORELIVE_THEMES.TRADITIONAL),
    ...Object.values(CORELIVE_THEMES.HARMONIZED),
  ],
  PREMIUM_DARK: Object.values(CORELIVE_THEMES.DARK),
  PREMIUM_LIGHT: Object.values(CORELIVE_THEMES.LIGHT),
  PREMIUM_GRADIENT: Object.values(CORELIVE_THEMES.GRADIENT),
  PREMIUM_RETRO: Object.values(CORELIVE_THEMES.RETRO),
  PREMIUM_SEASONAL: Object.values(CORELIVE_THEMES.SEASONAL),
} as const

// Theme metadata for UI display
export const THEME_METADATA: Record<
  string,
  {
    name: string
    category:
      | 'base'
      | 'harmonized'
      | 'dark'
      | 'light'
      | 'gradient'
      | 'retro'
      | 'seasonal'
    isPremium: boolean
    description?: string
    preview?: string // Preview color or gradient
  }
> = {
  // Default shadcn/ui themes
  [CORELIVE_THEMES.DEFAULT.LIGHT]: {
    name: 'Light',
    category: 'base',
    isPremium: false,
    description: 'Clean and minimal light theme',
    preview: '#ffffff',
  },
  [CORELIVE_THEMES.DEFAULT.DARK]: {
    name: 'Dark',
    category: 'base',
    isPremium: false,
    description: 'Modern dark theme',
    preview: '#1a1a1a',
  },

  // CoreLive base themes
  [CORELIVE_THEMES.CORELIVE_BASE.LIGHT]: {
    name: 'CoreLive Light',
    category: 'base',
    isPremium: false,
    description: 'CoreLive extended light theme',
    preview: '#ffffff',
  },
  [CORELIVE_THEMES.CORELIVE_BASE.DARK]: {
    name: 'CoreLive Dark',
    category: 'base',
    isPremium: false,
    description: 'CoreLive extended dark theme',
    preview: '#1a1a1a',
  },

  // Traditional TODO themes
  [CORELIVE_THEMES.TRADITIONAL.LIGHT]: {
    name: 'Traditional Light',
    category: 'base',
    isPremium: false,
    description: 'Classic TODO app light mode',
    preview: '#f5f5f5',
  },
  [CORELIVE_THEMES.TRADITIONAL.DARK]: {
    name: 'Traditional Dark',
    category: 'base',
    isPremium: false,
    description: 'Classic TODO app dark mode',
    preview: '#2d2d2d',
  },

  // Harmonized themes
  [CORELIVE_THEMES.HARMONIZED.RED]: {
    name: 'Harmonized Red',
    category: 'harmonized',
    isPremium: false,
    description: 'Warm red color palette',
    preview: '#dc2626',
  },
  [CORELIVE_THEMES.HARMONIZED.MUSTARD]: {
    name: 'Harmonized Mustard',
    category: 'harmonized',
    isPremium: false,
    description: 'Rich mustard color palette',
    preview: '#d97706',
  },
  [CORELIVE_THEMES.HARMONIZED.TURQUOISE]: {
    name: 'Harmonized Turquoise',
    category: 'harmonized',
    isPremium: false,
    description: 'Fresh turquoise color palette',
    preview: '#06b6d4',
  },
  [CORELIVE_THEMES.HARMONIZED.AZURE]: {
    name: 'Harmonized Azure',
    category: 'harmonized',
    isPremium: false,
    description: 'Elegant azure color palette',
    preview: '#2563eb',
  },
  [CORELIVE_THEMES.HARMONIZED.FUCHSIA]: {
    name: 'Harmonized Fuchsia',
    category: 'harmonized',
    isPremium: false,
    description: 'Vibrant fuchsia color palette',
    preview: '#a21caf',
  },
  // Harmonized dark themes
  [CORELIVE_THEMES.HARMONIZED.RED_DARK]: {
    name: 'Harmonized Red Dark',
    category: 'harmonized',
    isPremium: false,
    description: 'Dark red color palette',
    preview: '#7f1d1d',
  },
  [CORELIVE_THEMES.HARMONIZED.MUSTARD_DARK]: {
    name: 'Harmonized Mustard Dark',
    category: 'harmonized',
    isPremium: false,
    description: 'Dark mustard color palette',
    preview: '#713f12',
  },
  [CORELIVE_THEMES.HARMONIZED.TURQUOISE_DARK]: {
    name: 'Harmonized Turquoise Dark',
    category: 'harmonized',
    isPremium: false,
    description: 'Dark turquoise color palette',
    preview: '#134e4a',
  },
  [CORELIVE_THEMES.HARMONIZED.AZURE_DARK]: {
    name: 'Harmonized Azure Dark',
    category: 'harmonized',
    isPremium: false,
    description: 'Dark azure color palette',
    preview: '#1e3a8a',
  },
  [CORELIVE_THEMES.HARMONIZED.FUCHSIA_DARK]: {
    name: 'Harmonized Fuchsia Dark',
    category: 'harmonized',
    isPremium: false,
    description: 'Dark fuchsia color palette',
    preview: '#701a75',
  },

  // Premium Dark themes
  [CORELIVE_THEMES.DARK.MIDNIGHT]: {
    name: 'Midnight',
    category: 'dark',
    isPremium: true,
    description: 'Deep midnight blue theme',
    preview: '#0f172a',
  },
  [CORELIVE_THEMES.DARK.CHARCOAL]: {
    name: 'Charcoal',
    category: 'dark',
    isPremium: true,
    description: 'Sophisticated charcoal theme',
    preview: '#18181b',
  },
  [CORELIVE_THEMES.DARK.OBSIDIAN]: {
    name: 'Obsidian',
    category: 'dark',
    isPremium: true,
    description: 'Pure black obsidian theme',
    preview: '#0a0a0a',
  },
  [CORELIVE_THEMES.DARK.NOIR]: {
    name: 'Noir',
    category: 'dark',
    isPremium: true,
    description: 'Film noir aesthetic',
    preview: '#1a1a1a',
  },
  [CORELIVE_THEMES.DARK.SHADOW]: {
    name: 'Shadow',
    category: 'dark',
    isPremium: true,
    description: 'Deep shadow theme',
    preview: '#2d1b69',
  },

  // Premium Light themes
  [CORELIVE_THEMES.LIGHT.PEARL]: {
    name: 'Pearl',
    category: 'light',
    isPremium: true,
    description: 'Elegant pearl white theme',
    preview: '#fafafa',
  },
  [CORELIVE_THEMES.LIGHT.SNOW]: {
    name: 'Snow',
    category: 'light',
    isPremium: true,
    description: 'Pure snow white theme',
    preview: '#ffffff',
  },
  [CORELIVE_THEMES.LIGHT.CREAM]: {
    name: 'Cream',
    category: 'light',
    isPremium: true,
    description: 'Warm cream theme',
    preview: '#fef3c7',
  },
  [CORELIVE_THEMES.LIGHT.ALABASTER]: {
    name: 'Alabaster',
    category: 'light',
    isPremium: true,
    description: 'Soft alabaster theme',
    preview: '#f8fafc',
  },
  [CORELIVE_THEMES.LIGHT.IVORY]: {
    name: 'Ivory',
    category: 'light',
    isPremium: true,
    description: 'Classic ivory theme',
    preview: '#fffef7',
  },

  // Premium Gradient themes
  [CORELIVE_THEMES.GRADIENT.AURORA]: {
    name: 'Aurora',
    category: 'gradient',
    isPremium: true,
    description: 'Northern lights gradient',
    preview: 'linear-gradient(135deg, #667eea, #764ba2)',
  },
  [CORELIVE_THEMES.GRADIENT.SUNSET]: {
    name: 'Sunset',
    category: 'gradient',
    isPremium: true,
    description: 'Warm sunset gradient',
    preview: 'linear-gradient(135deg, #fa709a, #fee140)',
  },
  [CORELIVE_THEMES.GRADIENT.OCEAN]: {
    name: 'Ocean',
    category: 'gradient',
    isPremium: true,
    description: 'Deep ocean gradient',
    preview: 'linear-gradient(135deg, #1e3c72, #2a5298)',
  },
  [CORELIVE_THEMES.GRADIENT.FOREST]: {
    name: 'Forest',
    category: 'gradient',
    isPremium: true,
    description: 'Deep forest gradient',
    preview: 'linear-gradient(135deg, #134e4a, #065f46)',
  },
  [CORELIVE_THEMES.GRADIENT.NEBULA]: {
    name: 'Nebula',
    category: 'gradient',
    isPremium: true,
    description: 'Space nebula gradient',
    preview: 'linear-gradient(135deg, #4c1d95, #a21caf)',
  },

  // Premium Retro themes
  [CORELIVE_THEMES.RETRO.SYNTHWAVE]: {
    name: 'Synthwave',
    category: 'retro',
    isPremium: true,
    description: '80s synthwave aesthetic',
    preview: '#2d1b69',
  },
  [CORELIVE_THEMES.RETRO.TERMINAL]: {
    name: 'Terminal',
    category: 'retro',
    isPremium: true,
    description: 'Classic terminal green',
    preview: '#00ff00',
  },
  [CORELIVE_THEMES.RETRO.VAPORWAVE]: {
    name: 'Vaporwave',
    category: 'retro',
    isPremium: true,
    description: 'Vaporwave aesthetic',
    preview: '#ff006e',
  },
  [CORELIVE_THEMES.RETRO.SEPIA]: {
    name: 'Sepia',
    category: 'retro',
    isPremium: true,
    description: 'Old photo sepia',
    preview: '#704214',
  },
  [CORELIVE_THEMES.RETRO.NEON]: {
    name: 'Neon',
    category: 'retro',
    isPremium: true,
    description: 'Neon sign glow',
    preview: '#ff00ff',
  },

  // Premium Seasonal themes
  [CORELIVE_THEMES.SEASONAL.SPRING_BLOSSOM]: {
    name: 'Spring Blossom',
    category: 'seasonal',
    isPremium: true,
    description: 'Cherry blossom spring',
    preview: '#ffc0cb',
  },
  [CORELIVE_THEMES.SEASONAL.SUMMER_BEACH]: {
    name: 'Summer Beach',
    category: 'seasonal',
    isPremium: true,
    description: 'Beach summer vibes',
    preview: '#87ceeb',
  },
  [CORELIVE_THEMES.SEASONAL.AUTUMN_FOREST]: {
    name: 'Autumn Forest',
    category: 'seasonal',
    isPremium: true,
    description: 'Autumn forest colors',
    preview: '#d2691e',
  },
  [CORELIVE_THEMES.SEASONAL.WINTER_SNOW]: {
    name: 'Winter Snow',
    category: 'seasonal',
    isPremium: true,
    description: 'Frosty winter wonderland',
    preview: '#e0f2fe',
  },
  [CORELIVE_THEMES.SEASONAL.HOLIDAY]: {
    name: 'Holiday',
    category: 'seasonal',
    isPremium: true,
    description: 'Festive holiday theme',
    preview: '#dc2626',
  },
  // Premium themes metadata will be added as themes are created
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
