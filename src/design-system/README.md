# CoreLive Design System Documentation

A comprehensive, theme-able design system built on Tailwind CSS v4, supporting 100+ themes with fine-grained customization.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Themes](#themes)
5. [Design Tokens](#design-tokens)
6. [Components](#components)
7. [Animations](#animations)
8. [Migration Guide](#migration-guide)
9. [Creating Custom Themes](#creating-custom-themes)
10. [Best Practices](#best-practices)

## Overview

The CoreLive Design System provides:

- 🎨 **100+ Themes**: From basic light/dark to premium gradient, retro, and seasonal themes
- 🎯 **Design Tokens**: Fine-grained control over every UI element
- ✨ **Animations**: Celebration effects, micro-interactions, and smooth transitions
- 🔧 **Customization**: Component-specific tokens for detailed theming
- 📱 **Responsive**: Mobile-first design with Electron app support
- ♿ **Accessible**: WCAG 2.2 AA+ compliant with reduced motion support

## Architecture

```
src/design-system/
├── index.css                    # Main entry point
├── tokens/
│   ├── base/                   # Core design tokens
│   │   ├── colors.css         # Color system with OKLCH
│   │   ├── typography.css     # Font scales and text styles
│   │   ├── spacing.css        # Spacing and sizing system
│   │   ├── animations.css     # Animation tokens
│   │   └── harmonized-palette.css # Evil Martians palette
│   ├── themes/
│   │   ├── base-theme.css     # Default theme setup
│   │   ├── traditional-todo.css # Classic TODO theme
│   │   ├── harmonized-themes.css # Harmonized color themes
│   │   └── premium/           # Premium theme collections
│   └── components/             # Component-specific tokens
├── animations/                 # Animation implementations
└── theme-factory.ts           # Theme generation utilities
```

## Quick Start

### 1. Setup ThemeProvider

The design system uses `next-themes` for theme management:

```tsx
// app/layout.tsx
import { ThemeProvider } from '@/providers/ThemeProvider'

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

### 2. Add Theme Selector

```tsx
import { ThemeSelector } from '@/components/ThemeSelector'

export function Header() {
  return (
    <header>
      <ThemeSelector />
    </header>
  )
}
```

### 3. Use Design Tokens

```css
/* Component styles using tokens */
.my-component {
  background: var(--color-card);
  color: var(--color-card-foreground);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
  transition: var(--transition-colors);
}
```

## Themes

### Theme Categories

1. **Free Themes** (14 themes)
   - Light/Dark base themes
   - Traditional TODO (light/dark)
   - Harmonized colors (10 variants)

2. **Premium Dark Themes** (30 themes)
   - Midnight, Charcoal, Obsidian, Noir, Shadow

3. **Premium Light Themes** (20 themes)
   - Pearl, Snow, Cream, Alabaster, Ivory

4. **Premium Gradient Themes** (20 themes)
   - Aurora, Sunset, Ocean, Forest, Nebula

5. **Premium Retro Themes** (15 themes)
   - Synthwave, Terminal, Vaporwave, Sepia, Neon

6. **Premium Seasonal Themes** (15 themes)
   - Spring Blossom, Summer Beach, Autumn Forest, Winter Snow, Holiday

### Using Themes

```tsx
import { useTheme } from 'next-themes'

function MyComponent() {
  const { theme, setTheme } = useTheme()

  return (
    <button onClick={() => setTheme('gradient-aurora')}>
      Use Aurora Theme
    </button>
  )
}
```

## Design Tokens

### Color Tokens

All colors use OKLCH for better perceptual uniformity:

```css
/* Role-based color tokens */
--color-primary: oklch(0.638 0.237 275.744);
--color-secondary: oklch(0.632 0.262 295.119);
--color-success: oklch(0.639 0.193 142.495);
--color-warning: oklch(0.697 0.214 70.85);
--color-danger: oklch(0.628 0.258 25.357);

/* Surface colors */
--color-background: oklch(0.985 0.002 247.859);
--color-foreground: oklch(0.195 0.002 247.839);
--color-card: var(--color-background);
--color-popover: var(--color-background);
```

### Spacing Tokens

Based on 4/8 grid system:

```css
--spacing-1: 0.25rem; /* 4px */
--spacing-2: 0.5rem; /* 8px */
--spacing-3: 0.75rem; /* 12px */
--spacing-4: 1rem; /* 16px - Key margin */
--spacing-5: 1.25rem; /* 20px - Key margin */
--spacing-6: 1.5rem; /* 24px - Key margin */
```

### Typography Tokens

```css
--font-family-sans: ui-sans-serif, -apple-system, ...;
--font-size-base: 1rem;
--font-weight-medium: 500;
--line-height-normal: 1.5;
--letter-spacing-normal: 0em;
```

## Components

### Todo Item Tokens

```css
/* Structure */
--todo-item-min-height: 48px;
--todo-item-padding-x: var(--spacing-4);
--todo-item-border-radius: var(--radius-md);

/* Colors */
--todo-item-background: transparent;
--todo-item-background-hover: var(--color-accent);
--todo-item-text-color: var(--color-foreground);
--todo-item-text-color-completed: var(--color-muted-foreground);

/* States */
--todo-item-opacity-completed: 0.6;
--todo-item-text-decoration-completed: line-through;
```

### Button Tokens

```css
/* Sizes */
--button-height-sm: 32px;
--button-height-md: 36px;
--button-height-lg: 40px;

/* Variants */
--button-default-background: var(--color-primary);
--button-outline-border: var(--color-border);
--button-ghost-background: transparent;
```

### Card Tokens

```css
--card-padding: var(--spacing-6);
--card-border-radius: var(--radius-lg);
--card-shadow: var(--shadow-sm);
--card-shadow-hover: var(--shadow-md);
```

## Animations

### Confetti Animation

```tsx
import { ConfettiAnimation, useConfetti } from '@/components/animations'

function TodoItem() {
  const { trigger, celebrate } = useConfetti()

  const handleComplete = () => {
    // Complete task logic
    celebrate() // Trigger confetti
  }

  return (
    <>
      <button onClick={handleComplete}>Complete Task</button>
      <ConfettiAnimation trigger={trigger} />
    </>
  )
}
```

### Level Up Animation

```tsx
import { LevelUpAnimation, useLevelUp } from '@/components/animations'

function GameProgress() {
  const { currentLevel, showAnimation, levelUp } = useLevelUp()

  return <LevelUpAnimation level={currentLevel} show={showAnimation} />
}
```

### Achievement Animation

```tsx
import { useAchievements } from '@/components/animations'

function AchievementSystem() {
  const { unlockAchievement, templates } = useAchievements()

  const handleFirstTask = () => {
    unlockAchievement(templates.firstTask())
  }
}
```

## Migration Guide

See [MIGRATION.md](./MIGRATION.md) for detailed migration instructions.

## Creating Custom Themes

### Using the Theme Factory

```typescript
import { generateThemeCSS, ThemeConfig } from '@/design-system/theme-factory'

const myTheme: ThemeConfig = {
  name: 'My Custom Theme',
  category: 'dark',
  isPremium: true,
  description: 'A beautiful custom theme',
  preview: '#123456',
  colors: {
    background: 'oklch(0.15 0.02 250)',
    foreground: 'oklch(0.95 0.01 250)',
    primary: 'oklch(0.55 0.2 250)',
    // ... other colors
  },
  effects: {
    blur: true,
    gradient: true,
    shadow: 'strong',
  },
}

const css = generateThemeCSS('my-custom-theme', myTheme)
```

### Manual Theme Creation

```css
[data-theme='my-theme'] {
  color-scheme: dark;

  /* Required color tokens */
  --color-background: oklch(...);
  --color-foreground: oklch(...);
  --color-primary: oklch(...);
  --color-primary-foreground: oklch(...);
  /* ... other required tokens */

  /* Optional overrides */
  --button-height-md: 40px;
  --card-shadow: 0 10px 20px rgb(0 0 0 / 0.2);
}
```

## Best Practices

### 1. Use Semantic Tokens

```css
/* Good: Use semantic tokens */
background: var(--color-card);
color: var(--color-card-foreground);

/* Avoid: Direct color values */
background: #ffffff;
color: #000000;
```

### 2. Respect User Preferences

```css
/* Support reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 3. Theme-Specific Adjustments

```css
/* Adjust for specific themes */
[data-theme^='retro'] {
  --button-border-width: 2px;
  --card-shadow: 4px 4px 0 0 rgba(0, 0, 0, 0.2);
}
```

### 4. Component Token Usage

```tsx
// Use component classes that leverage tokens
<button className="h-[var(--button-height-md)] px-[var(--button-padding-x-md)]">
  Click me
</button>

// Or use the pre-built classes
<Button size="md" variant="default">
  Click me
</Button>
```

### 5. Testing Themes

Always test your components with:

- Light and dark base themes
- High contrast themes
- Gradient themes (for gradient support)
- Reduced motion preferences
- Different viewport sizes

## Resources

- [Tailwind CSS v4 Docs](https://tailwindcss.com)
- [next-themes Documentation](https://github.com/pacocoursey/next-themes)
- [OKLCH Color Space](https://oklch.com)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

## Support

For questions or issues:

- Check the [Migration Guide](./MIGRATION.md)
- Review component examples in Storybook
- File an issue in the repository
