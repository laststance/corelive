/**
 * CoreLive Design System - Theme Factory
 *
 * Utilities for generating theme variations efficiently
 */

export interface ThemeConfig {
  name: string
  category: 'dark' | 'light' | 'gradient' | 'retro' | 'seasonal'
  isPremium: boolean
  description: string
  preview: string
  colors: {
    background: string
    foreground: string
    primary: string
    primaryForeground: string
    secondary: string
    secondaryForeground: string
    accent: string
    accentForeground: string
    muted: string
    mutedForeground: string
    card?: string
    cardForeground?: string
    success?: string
    warning?: string
    danger?: string
  }
  effects?: {
    blur?: boolean
    gradient?: boolean
    shadow?: 'subtle' | 'normal' | 'strong'
    animation?: 'subtle' | 'normal' | 'playful'
  }
}

/**
 * Generate CSS for a theme configuration
 */
export function generateThemeCSS(themeId: string, config: ThemeConfig): string {
  const { colors, effects } = config

  let css = `
[data-theme="${themeId}"] {
  color-scheme: ${config.category === 'dark' ? 'dark' : 'light'};
  
  /* Theme metadata */
  --theme-name: "${config.name}";
  --theme-mode: "${config.category}";
  
  /* Color tokens */
  --color-background: ${colors.background};
  --color-foreground: ${colors.foreground};
  --color-primary: ${colors.primary};
  --color-primary-foreground: ${colors.primaryForeground};
  --color-secondary: ${colors.secondary};
  --color-secondary-foreground: ${colors.secondaryForeground};
  --color-accent: ${colors.accent};
  --color-accent-foreground: ${colors.accentForeground};
  --color-muted: ${colors.muted};
  --color-muted-foreground: ${colors.mutedForeground};
  
  ${colors.card ? `--color-card: ${colors.card};` : ''}
  ${colors.cardForeground ? `--color-card-foreground: ${colors.cardForeground};` : ''}
  ${colors.success ? `--color-success: ${colors.success};` : ''}
  ${colors.warning ? `--color-warning: ${colors.warning};` : ''}
  ${colors.danger ? `--color-danger: ${colors.danger};` : ''}
`

  // Add shadow effects
  if (effects?.shadow) {
    const shadowStrength = {
      subtle: 0.05,
      normal: 0.1,
      strong: 0.25,
    }[effects.shadow]

    css += `
  /* Shadow effects */
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / ${shadowStrength}), 0 1px 2px -1px rgb(0 0 0 / ${shadowStrength});
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / ${shadowStrength}), 0 2px 4px -2px rgb(0 0 0 / ${shadowStrength});
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / ${shadowStrength}), 0 4px 6px -4px rgb(0 0 0 / ${shadowStrength});
`
  }

  // Add gradient effects
  if (effects?.gradient) {
    css += `
  /* Gradient effects */
  --gradient-primary: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
  --gradient-background: linear-gradient(135deg, ${colors.background} 0%, ${colors.background} / 95% 100%);
`
  }

  // Add blur effects
  if (effects?.blur) {
    css += `
  /* Blur effects */
  --backdrop-blur: 20px;
  --card-backdrop-blur: 12px;
`
  }

  css += '}\n'

  return css
}

/**
 * Premium Dark Theme Examples
 */
export const premiumDarkThemes: Record<string, ThemeConfig> = {
  'dark-midnight': {
    name: 'Midnight',
    category: 'dark',
    isPremium: true,
    description: 'Deep midnight blue theme',
    preview: '#0f172a',
    colors: {
      background: 'oklch(0.15 0.02 250)',
      foreground: 'oklch(0.95 0.01 250)',
      primary: 'oklch(0.55 0.2 250)',
      primaryForeground: 'oklch(0.95 0.01 250)',
      secondary: 'oklch(0.5 0.15 280)',
      secondaryForeground: 'oklch(0.95 0.01 280)',
      accent: 'oklch(0.3 0.02 250)',
      accentForeground: 'oklch(0.9 0.01 250)',
      muted: 'oklch(0.25 0.02 250)',
      mutedForeground: 'oklch(0.65 0.01 250)',
    },
    effects: {
      shadow: 'strong',
    },
  },

  'dark-charcoal': {
    name: 'Charcoal',
    category: 'dark',
    isPremium: true,
    description: 'Sophisticated charcoal theme',
    preview: '#18181b',
    colors: {
      background: 'oklch(0.16 0.005 0)',
      foreground: 'oklch(0.92 0.005 0)',
      primary: 'oklch(0.7 0.005 0)',
      primaryForeground: 'oklch(0.16 0.005 0)',
      secondary: 'oklch(0.6 0.01 0)',
      secondaryForeground: 'oklch(0.92 0.005 0)',
      accent: 'oklch(0.28 0.01 0)',
      accentForeground: 'oklch(0.92 0.005 0)',
      muted: 'oklch(0.24 0.005 0)',
      mutedForeground: 'oklch(0.6 0.005 0)',
    },
  },

  'dark-obsidian': {
    name: 'Obsidian',
    category: 'dark',
    isPremium: true,
    description: 'Pure black obsidian theme',
    preview: '#0a0a0a',
    colors: {
      background: 'oklch(0.1 0 0)',
      foreground: 'oklch(0.98 0 0)',
      primary: 'oklch(0.65 0.3 340)',
      primaryForeground: 'oklch(0.98 0 0)',
      secondary: 'oklch(0.6 0.2 20)',
      secondaryForeground: 'oklch(0.98 0 0)',
      accent: 'oklch(0.2 0 0)',
      accentForeground: 'oklch(0.98 0 0)',
      muted: 'oklch(0.18 0 0)',
      mutedForeground: 'oklch(0.7 0 0)',
    },
    effects: {
      shadow: 'subtle',
    },
  },
}

/**
 * Premium Light Theme Examples
 */
export const premiumLightThemes: Record<string, ThemeConfig> = {
  'light-pearl': {
    name: 'Pearl',
    category: 'light',
    isPremium: true,
    description: 'Elegant pearl white theme',
    preview: '#fafafa',
    colors: {
      background: 'oklch(0.985 0.002 85)',
      foreground: 'oklch(0.2 0.01 85)',
      primary: 'oklch(0.45 0.1 30)',
      primaryForeground: 'oklch(0.98 0.002 85)',
      secondary: 'oklch(0.8 0.05 60)',
      secondaryForeground: 'oklch(0.2 0.01 85)',
      accent: 'oklch(0.95 0.01 85)',
      accentForeground: 'oklch(0.3 0.01 85)',
      muted: 'oklch(0.94 0.005 85)',
      mutedForeground: 'oklch(0.5 0.01 85)',
    },
  },

  'light-snow': {
    name: 'Snow',
    category: 'light',
    isPremium: true,
    description: 'Pure snow white theme',
    preview: '#ffffff',
    colors: {
      background: 'oklch(1 0 0)',
      foreground: 'oklch(0.15 0 250)',
      primary: 'oklch(0.5 0.25 250)',
      primaryForeground: 'oklch(1 0 0)',
      secondary: 'oklch(0.6 0.15 200)',
      secondaryForeground: 'oklch(1 0 0)',
      accent: 'oklch(0.97 0.01 250)',
      accentForeground: 'oklch(0.15 0 250)',
      muted: 'oklch(0.96 0.005 250)',
      mutedForeground: 'oklch(0.45 0.01 250)',
    },
  },
}

/**
 * Premium Gradient Theme Examples
 */
export const premiumGradientThemes: Record<string, ThemeConfig> = {
  'gradient-aurora': {
    name: 'Aurora',
    category: 'gradient',
    isPremium: true,
    description: 'Northern lights gradient',
    preview: 'linear-gradient(135deg, #667eea, #764ba2)',
    colors: {
      background: 'oklch(0.15 0.02 280)',
      foreground: 'oklch(0.98 0.01 280)',
      primary: 'oklch(0.55 0.25 280)',
      primaryForeground: 'oklch(0.98 0.01 280)',
      secondary: 'oklch(0.6 0.25 320)',
      secondaryForeground: 'oklch(0.98 0.01 320)',
      accent: 'oklch(0.25 0.03 280)',
      accentForeground: 'oklch(0.95 0.01 280)',
      muted: 'oklch(0.22 0.02 280)',
      mutedForeground: 'oklch(0.7 0.01 280)',
    },
    effects: {
      gradient: true,
      blur: true,
    },
  },

  'gradient-sunset': {
    name: 'Sunset',
    category: 'gradient',
    isPremium: true,
    description: 'Warm sunset gradient',
    preview: 'linear-gradient(135deg, #fa709a, #fee140)',
    colors: {
      background: 'oklch(0.18 0.03 30)',
      foreground: 'oklch(0.98 0.01 30)',
      primary: 'oklch(0.65 0.25 30)',
      primaryForeground: 'oklch(0.98 0.01 30)',
      secondary: 'oklch(0.7 0.2 60)',
      secondaryForeground: 'oklch(0.15 0.01 60)',
      accent: 'oklch(0.28 0.04 30)',
      accentForeground: 'oklch(0.95 0.01 30)',
      muted: 'oklch(0.25 0.03 30)',
      mutedForeground: 'oklch(0.7 0.01 30)',
    },
    effects: {
      gradient: true,
      shadow: 'normal',
    },
  },
}

/**
 * Premium Retro Theme Examples
 */
export const premiumRetroThemes: Record<string, ThemeConfig> = {
  'retro-synthwave': {
    name: 'Synthwave',
    category: 'retro',
    isPremium: true,
    description: '80s synthwave aesthetic',
    preview: '#2d1b69',
    colors: {
      background: 'oklch(0.2 0.1 300)',
      foreground: 'oklch(0.9 0.15 330)',
      primary: 'oklch(0.65 0.35 330)',
      primaryForeground: 'oklch(0.15 0.05 300)',
      secondary: 'oklch(0.6 0.3 180)',
      secondaryForeground: 'oklch(0.15 0.05 300)',
      accent: 'oklch(0.3 0.15 300)',
      accentForeground: 'oklch(0.9 0.15 330)',
      muted: 'oklch(0.25 0.08 300)',
      mutedForeground: 'oklch(0.7 0.1 330)',
    },
    effects: {
      shadow: 'strong',
      animation: 'playful',
    },
  },

  'retro-terminal': {
    name: 'Terminal',
    category: 'retro',
    isPremium: true,
    description: 'Classic terminal green',
    preview: '#00ff00',
    colors: {
      background: 'oklch(0.1 0 0)',
      foreground: 'oklch(0.8 0.25 142)',
      primary: 'oklch(0.8 0.25 142)',
      primaryForeground: 'oklch(0.1 0 0)',
      secondary: 'oklch(0.6 0.15 142)',
      secondaryForeground: 'oklch(0.1 0 0)',
      accent: 'oklch(0.15 0.02 142)',
      accentForeground: 'oklch(0.8 0.25 142)',
      muted: 'oklch(0.15 0.02 142)',
      mutedForeground: 'oklch(0.5 0.15 142)',
    },
  },
}

/**
 * Premium Seasonal Theme Examples
 */
export const premiumSeasonalThemes: Record<string, ThemeConfig> = {
  'seasonal-spring-blossom': {
    name: 'Spring Blossom',
    category: 'seasonal',
    isPremium: true,
    description: 'Cherry blossom spring',
    preview: '#ffc0cb',
    colors: {
      background: 'oklch(0.97 0.02 10)',
      foreground: 'oklch(0.3 0.05 10)',
      primary: 'oklch(0.75 0.2 10)',
      primaryForeground: 'oklch(0.97 0.02 10)',
      secondary: 'oklch(0.7 0.15 120)',
      secondaryForeground: 'oklch(0.2 0.02 120)',
      accent: 'oklch(0.93 0.03 10)',
      accentForeground: 'oklch(0.4 0.05 10)',
      muted: 'oklch(0.92 0.02 10)',
      mutedForeground: 'oklch(0.5 0.03 10)',
    },
  },

  'seasonal-winter-snow': {
    name: 'Winter Snow',
    category: 'seasonal',
    isPremium: true,
    description: 'Frosty winter wonderland',
    preview: '#e0f2fe',
    colors: {
      background: 'oklch(0.98 0.01 210)',
      foreground: 'oklch(0.2 0.02 210)',
      primary: 'oklch(0.5 0.15 210)',
      primaryForeground: 'oklch(0.98 0.01 210)',
      secondary: 'oklch(0.45 0.1 180)',
      secondaryForeground: 'oklch(0.98 0.01 210)',
      accent: 'oklch(0.94 0.02 210)',
      accentForeground: 'oklch(0.3 0.02 210)',
      muted: 'oklch(0.93 0.01 210)',
      mutedForeground: 'oklch(0.45 0.02 210)',
    },
  },
}
