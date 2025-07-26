# CoreLive Design System Specification

## Executive Summary

The CoreLive Design System is a comprehensive, scalable design token architecture capable of supporting 100+ visual themes while maintaining consistency, accessibility, and performance. Built on TailwindCSS v4, it provides a production-grade foundation for multi-theme applications with enterprise-level scalability.

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Token Architecture](#token-architecture)
3. [Theme System](#theme-system)
4. [TailwindCSS v4 Integration](#tailwindcss-v4-integration)
5. [Implementation Strategy](#implementation-strategy)
6. [Component System](#component-system)
7. [Accessibility Framework](#accessibility-framework)
8. [Performance Optimization](#performance-optimization)
9. [Developer Experience](#developer-experience)
10. [Governance & Maintenance](#governance--maintenance)

## Design Philosophy

### Core Principles

1. **Scale-First Architecture**: Designed to handle infinite themes without performance degradation
2. **Semantic Clarity**: Every token has clear, purposeful meaning
3. **Accessibility by Design**: WCAG 2.2 AA compliance built into the foundation
4. **Performance Obsessed**: Optimized for runtime efficiency and bundle size
5. **Developer-Centric**: Exceptional DX with type safety and intelligent tooling
6. **Future-Proof**: Tech-agnostic foundation that adapts to emerging standards

### Design Token Hierarchy

Following industry best practices from GitHub Primer, Atlassian, and Nord Health, our system implements a four-tier token hierarchy:

```
Foundation → Semantic → Component → Variant
```

## Token Architecture

### 1. Foundation Tokens (Primitive Layer)

Foundation tokens are raw values that form the mathematical basis of the design system.

#### Color Foundation

```css
/* Color Primitives - Mathematical Color Scales */
--foundation-color-gray-50: #fafafa;
--foundation-color-gray-100: #f4f4f5;
--foundation-color-gray-200: #e4e4e7;
--foundation-color-gray-300: #d4d4d8;
--foundation-color-gray-400: #a1a1aa;
--foundation-color-gray-500: #71717a;
--foundation-color-gray-600: #52525b;
--foundation-color-gray-700: #3f3f46;
--foundation-color-gray-800: #27272a;
--foundation-color-gray-900: #18181b;
--foundation-color-gray-950: #09090b;

/* Brand Color Primitives */
--foundation-color-brand-50: #eff6ff;
--foundation-color-brand-100: #dbeafe;
--foundation-color-brand-200: #bfdbfe;
--foundation-color-brand-300: #93c5fd;
--foundation-color-brand-400: #60a5fa;
--foundation-color-brand-500: #3b82f6;
--foundation-color-brand-600: #2563eb;
--foundation-color-brand-700: #1d4ed8;
--foundation-color-brand-800: #1e40af;
--foundation-color-brand-900: #1e3a8a;
--foundation-color-brand-950: #172554;

/* Semantic Color Primitives */
--foundation-color-success-50: #f0fdf4;
--foundation-color-success-500: #22c55e;
--foundation-color-success-900: #14532d;

--foundation-color-warning-50: #fffbeb;
--foundation-color-warning-500: #f59e0b;
--foundation-color-warning-900: #78350f;

--foundation-color-danger-50: #fef2f2;
--foundation-color-danger-500: #ef4444;
--foundation-color-danger-900: #7f1d1d;
```

#### Typography Foundation

```css
/* Font Family Primitives */
--foundation-font-family-sans:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial,
  sans-serif;
--foundation-font-family-mono:
  ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono',
  monospace;

/* Font Weight Primitives */
--foundation-font-weight-thin: 100;
--foundation-font-weight-light: 300;
--foundation-font-weight-regular: 400;
--foundation-font-weight-medium: 500;
--foundation-font-weight-semibold: 600;
--foundation-font-weight-bold: 700;
--foundation-font-weight-extrabold: 800;
--foundation-font-weight-black: 900;

/* Font Size Primitives - Modular Scale */
--foundation-font-size-xs: 0.75rem; /* 12px */
--foundation-font-size-sm: 0.875rem; /* 14px */
--foundation-font-size-base: 1rem; /* 16px */
--foundation-font-size-lg: 1.125rem; /* 18px */
--foundation-font-size-xl: 1.25rem; /* 20px */
--foundation-font-size-2xl: 1.5rem; /* 24px */
--foundation-font-size-3xl: 1.875rem; /* 30px */
--foundation-font-size-4xl: 2.25rem; /* 36px */
--foundation-font-size-5xl: 3rem; /* 48px */
--foundation-font-size-6xl: 3.75rem; /* 60px */
--foundation-font-size-7xl: 4.5rem; /* 72px */
```

#### Spacing Foundation

```css
/* Spacing Primitives - 8px Grid System */
--foundation-space-px: 1px;
--foundation-space-0: 0;
--foundation-space-1: 0.25rem; /* 4px */
--foundation-space-2: 0.5rem; /* 8px */
--foundation-space-3: 0.75rem; /* 12px */
--foundation-space-4: 1rem; /* 16px */
--foundation-space-5: 1.25rem; /* 20px */
--foundation-space-6: 1.5rem; /* 24px */
--foundation-space-7: 1.75rem; /* 28px */
--foundation-space-8: 2rem; /* 32px */
--foundation-space-10: 2.5rem; /* 40px */
--foundation-space-12: 3rem; /* 48px */
--foundation-space-16: 4rem; /* 64px */
--foundation-space-20: 5rem; /* 80px */
--foundation-space-24: 6rem; /* 96px */
--foundation-space-32: 8rem; /* 128px */
```

#### Border Radius Foundation

```css
/* Border Radius Primitives */
--foundation-radius-none: 0;
--foundation-radius-sm: 0.125rem; /* 2px */
--foundation-radius-base: 0.25rem; /* 4px */
--foundation-radius-md: 0.375rem; /* 6px */
--foundation-radius-lg: 0.5rem; /* 8px */
--foundation-radius-xl: 0.75rem; /* 12px */
--foundation-radius-2xl: 1rem; /* 16px */
--foundation-radius-3xl: 1.5rem; /* 24px */
--foundation-radius-full: 9999px;
```

#### Shadow Foundation

```css
/* Shadow Primitives - Elevation System */
--foundation-shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--foundation-shadow-sm:
  0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
--foundation-shadow-base:
  0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--foundation-shadow-md:
  0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
--foundation-shadow-lg:
  0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
--foundation-shadow-xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
--foundation-shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
--foundation-shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
```

### 2. Semantic Tokens (Purpose Layer)

Semantic tokens provide meaning and context to foundation tokens, enabling theme flexibility.

#### Color Semantic Tokens

```css
/* Background Colors - Context-Aware */
--semantic-color-background-default: var(--foundation-color-gray-50);
--semantic-color-background-subtle: var(--foundation-color-gray-100);
--semantic-color-background-muted: var(--foundation-color-gray-200);
--semantic-color-background-emphasis: var(--foundation-color-brand-500);
--semantic-color-background-inverse: var(--foundation-color-gray-900);

/* Text Colors - Hierarchy */
--semantic-color-text-default: var(--foundation-color-gray-900);
--semantic-color-text-muted: var(--foundation-color-gray-600);
--semantic-color-text-subtle: var(--foundation-color-gray-500);
--semantic-color-text-inverse: var(--foundation-color-gray-50);
--semantic-color-text-brand: var(--foundation-color-brand-600);

/* Border Colors - Functional */
--semantic-color-border-default: var(--foundation-color-gray-200);
--semantic-color-border-muted: var(--foundation-color-gray-100);
--semantic-color-border-emphasis: var(--foundation-color-brand-500);

/* Status Colors - Semantic Meaning */
--semantic-color-status-success: var(--foundation-color-success-500);
--semantic-color-status-warning: var(--foundation-color-warning-500);
--semantic-color-status-danger: var(--foundation-color-danger-500);
--semantic-color-status-info: var(--foundation-color-brand-500);
```

#### Typography Semantic Tokens

```css
/* Typography Hierarchy */
--semantic-typography-display-1: var(--foundation-font-weight-bold)
  var(--foundation-font-size-6xl) / 1.1 var(--foundation-font-family-sans);
--semantic-typography-display-2: var(--foundation-font-weight-bold)
  var(--foundation-font-size-5xl) / 1.2 var(--foundation-font-family-sans);
--semantic-typography-heading-1: var(--foundation-font-weight-bold)
  var(--foundation-font-size-4xl) / 1.25 var(--foundation-font-family-sans);
--semantic-typography-heading-2: var(--foundation-font-weight-semibold)
  var(--foundation-font-size-3xl) / 1.3 var(--foundation-font-family-sans);
--semantic-typography-heading-3: var(--foundation-font-weight-semibold)
  var(--foundation-font-size-2xl) / 1.35 var(--foundation-font-family-sans);
--semantic-typography-heading-4: var(--foundation-font-weight-semibold)
  var(--foundation-font-size-xl) / 1.4 var(--foundation-font-family-sans);
--semantic-typography-body-large: var(--foundation-font-weight-regular)
  var(--foundation-font-size-lg) / 1.6 var(--foundation-font-family-sans);
--semantic-typography-body-default: var(--foundation-font-weight-regular)
  var(--foundation-font-size-base) / 1.6 var(--foundation-font-family-sans);
--semantic-typography-body-small: var(--foundation-font-weight-regular)
  var(--foundation-font-size-sm) / 1.5 var(--foundation-font-family-sans);
--semantic-typography-caption: var(--foundation-font-weight-regular)
  var(--foundation-font-size-xs) / 1.4 var(--foundation-font-family-sans);
--semantic-typography-code: var(--foundation-font-weight-regular)
  var(--foundation-font-size-sm) / 1.5 var(--foundation-font-family-mono);
```

#### Layout Semantic Tokens

```css
/* Layout Semantics */
--semantic-layout-container-xs: 640px;
--semantic-layout-container-sm: 768px;
--semantic-layout-container-md: 1024px;
--semantic-layout-container-lg: 1280px;
--semantic-layout-container-xl: 1536px;

--semantic-layout-gutter: var(--foundation-space-6);
--semantic-layout-section-gap: var(--foundation-space-16);
--semantic-layout-component-gap: var(--foundation-space-4);
```

### 3. Component Tokens (Component Layer)

Component tokens are specific to UI components and inherit from semantic tokens.

#### Button Component Tokens

```css
/* Button - Primary Variant */
--component-button-primary-background: var(
  --semantic-color-background-emphasis
);
--component-button-primary-background-hover: var(--foundation-color-brand-600);
--component-button-primary-background-active: var(--foundation-color-brand-700);
--component-button-primary-text: var(--semantic-color-text-inverse);
--component-button-primary-border: var(--semantic-color-background-emphasis);
--component-button-primary-radius: var(--foundation-radius-md);
--component-button-primary-padding-x: var(--foundation-space-4);
--component-button-primary-padding-y: var(--foundation-space-2);
--component-button-primary-typography: var(--semantic-typography-body-default);
--component-button-primary-shadow: var(--foundation-shadow-sm);
--component-button-primary-shadow-hover: var(--foundation-shadow-md);

/* Button - Secondary Variant */
--component-button-secondary-background: transparent;
--component-button-secondary-background-hover: var(
  --semantic-color-background-subtle
);
--component-button-secondary-text: var(--semantic-color-text-brand);
--component-button-secondary-border: var(--semantic-color-border-emphasis);
--component-button-secondary-radius: var(--foundation-radius-md);
--component-button-secondary-padding-x: var(--foundation-space-4);
--component-button-secondary-padding-y: var(--foundation-space-2);
--component-button-secondary-typography: var(
  --semantic-typography-body-default
);
```

#### Input Component Tokens

```css
/* Input Field */
--component-input-background: var(--semantic-color-background-default);
--component-input-background-focus: var(--semantic-color-background-default);
--component-input-background-disabled: var(--semantic-color-background-muted);
--component-input-text: var(--semantic-color-text-default);
--component-input-placeholder: var(--semantic-color-text-muted);
--component-input-border: var(--semantic-color-border-default);
--component-input-border-focus: var(--semantic-color-border-emphasis);
--component-input-border-error: var(--semantic-color-status-danger);
--component-input-radius: var(--foundation-radius-md);
--component-input-padding-x: var(--foundation-space-3);
--component-input-padding-y: var(--foundation-space-2);
--component-input-typography: var(--semantic-typography-body-default);
--component-input-shadow-focus: 0 0 0 3px
  rgb(var(--foundation-color-brand-500) / 0.1);
```

## Theme System

### Theme Architecture

The CoreLive Design System supports unlimited themes through a sophisticated inheritance and override system:

```
Base Theme (Foundation)
├── Light Theme (Default)
├── Dark Theme
├── High Contrast Theme
├── Brand Themes
│   ├── Corporate Theme
│   ├── Healthcare Theme
│   ├── Finance Theme
│   └── Custom Themes (100+)
└── Context Themes
    ├── Reduced Motion
    ├── Print Theme
    └── Mobile Theme
```

### Theme Definition Structure

Each theme is defined as a CSS module with variable overrides:

```css
/* themes/dark-theme.css */
:root[data-theme='dark'] {
  /* Override Semantic Colors */
  --semantic-color-background-default: var(--foundation-color-gray-900);
  --semantic-color-background-subtle: var(--foundation-color-gray-800);
  --semantic-color-text-default: var(--foundation-color-gray-50);
  --semantic-color-text-muted: var(--foundation-color-gray-400);
  --semantic-color-border-default: var(--foundation-color-gray-700);

  /* Adjust Shadows for Dark Mode */
  --foundation-shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.3);
  --foundation-shadow-md: 0 10px 15px -3px rgb(0 0 0 / 0.3);
}
```

### Dynamic Theme Switching

```typescript
// Theme Manager TypeScript Interface
interface ThemeManager {
  currentTheme: string
  availableThemes: string[]
  setTheme(themeId: string): void
  getThemeTokens(themeId: string): Record<string, string>
  preloadTheme(themeId: string): Promise<void>
}

// Theme Switching Implementation
class CoreLiveThemeManager implements ThemeManager {
  currentTheme = 'light'

  setTheme(themeId: string): void {
    document.documentElement.setAttribute('data-theme', themeId)
    this.currentTheme = themeId

    // Emit theme change event
    window.dispatchEvent(
      new CustomEvent('theme-changed', {
        detail: { theme: themeId },
      }),
    )
  }

  preloadTheme(themeId: string): Promise<void> {
    return import(`./themes/${themeId}-theme.css`)
  }
}
```

## TailwindCSS v4 Integration

### Enhanced Configuration

```javascript
// tailwind.config.js
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],

  // Theme-aware CSS Custom Properties
  theme: {
    extend: {
      colors: {
        // Semantic Color Tokens
        'background-default': 'var(--semantic-color-background-default)',
        'background-subtle': 'var(--semantic-color-background-subtle)',
        'text-default': 'var(--semantic-color-text-default)',
        'text-muted': 'var(--semantic-color-text-muted)',
        'border-default': 'var(--semantic-color-border-default)',

        // Status Colors
        'status-success': 'var(--semantic-color-status-success)',
        'status-warning': 'var(--semantic-color-status-warning)',
        'status-danger': 'var(--semantic-color-status-danger)',
        'status-info': 'var(--semantic-color-status-info)',
      },

      fontFamily: {
        sans: 'var(--foundation-font-family-sans)',
        mono: 'var(--foundation-font-family-mono)',
      },

      fontSize: {
        'display-1': [
          'var(--foundation-font-size-6xl)',
          {
            lineHeight: '1.1',
            fontWeight: 'var(--foundation-font-weight-bold)',
          },
        ],
        'heading-1': [
          'var(--foundation-font-size-4xl)',
          {
            lineHeight: '1.25',
            fontWeight: 'var(--foundation-font-weight-bold)',
          },
        ],
        'body-large': ['var(--foundation-font-size-lg)', { lineHeight: '1.6' }],
        'body-default': [
          'var(--foundation-font-size-base)',
          { lineHeight: '1.6' },
        ],
      },

      spacing: {
        'component-gap': 'var(--semantic-layout-component-gap)',
        'section-gap': 'var(--semantic-layout-section-gap)',
      },

      borderRadius: {
        component: 'var(--foundation-radius-md)',
      },

      boxShadow: {
        component: 'var(--foundation-shadow-sm)',
        'component-hover': 'var(--foundation-shadow-md)',
      },
    },
  },

  // Custom Plugins for Component Tokens
  plugins: [
    function ({ addUtilities, theme }) {
      addUtilities({
        '.btn-primary': {
          backgroundColor: 'var(--component-button-primary-background)',
          color: 'var(--component-button-primary-text)',
          borderColor: 'var(--component-button-primary-border)',
          borderRadius: 'var(--component-button-primary-radius)',
          paddingLeft: 'var(--component-button-primary-padding-x)',
          paddingRight: 'var(--component-button-primary-padding-x)',
          paddingTop: 'var(--component-button-primary-padding-y)',
          paddingBottom: 'var(--component-button-primary-padding-y)',
          boxShadow: 'var(--component-button-primary-shadow)',

          '&:hover': {
            backgroundColor: 'var(--component-button-primary-background-hover)',
            boxShadow: 'var(--component-button-primary-shadow-hover)',
          },

          '&:active': {
            backgroundColor:
              'var(--component-button-primary-background-active)',
          },
        },
      })
    },
  ],
}
```

### Component Implementation

```tsx
// Example: Theme-Aware Button Component
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}) => {
  return (
    <button
      className={cn(
        // Base button styles using design tokens
        'inline-flex items-center justify-center transition-all duration-200',
        'border border-solid font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none',

        // Variant styles using component tokens
        {
          'btn-primary focus:ring-status-info/20': variant === 'primary',
          'btn-secondary focus:ring-status-info/20': variant === 'secondary',
          'hover:bg-background-subtle text-text-default bg-transparent':
            variant === 'ghost',
        },

        // Size variants
        {
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-base': size === 'md',
          'px-6 py-3 text-lg': size === 'lg',
        },

        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
```

## Component System

### Component Architecture

Components are built with three principles:

1. **Token-Driven**: All styling comes from design tokens
2. **Theme-Agnostic**: Components adapt to any theme automatically
3. **Accessible by Default**: ARIA compliance and keyboard navigation built-in

### Component Library Structure

```
src/components/
├── ui/                     # Base components
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   ├── Button.stories.tsx
│   │   └── index.ts
│   ├── Input/
│   ├── Select/
│   ├── Modal/
│   └── ...
├── compound/               # Compound components
│   ├── Form/
│   ├── DataTable/
│   ├── Navigation/
│   └── ...
├── layout/                 # Layout components
│   ├── Container/
│   ├── Grid/
│   ├── Stack/
│   └── ...
└── feedback/               # Feedback components
    ├── Toast/
    ├── Alert/
    ├── Loading/
    └── ...
```

### Component Token Generation

```typescript
// Automated component token generation
interface ComponentTokens {
  background: string
  backgroundHover: string
  backgroundActive: string
  text: string
  border: string
  borderFocus: string
  radius: string
  padding: { x: string; y: string }
  typography: string
  shadow: string
  shadowHover: string
}

function generateComponentTokens(
  component: string,
  variant: string,
): ComponentTokens {
  return {
    background: `var(--component-${component}-${variant}-background)`,
    backgroundHover: `var(--component-${component}-${variant}-background-hover)`,
    backgroundActive: `var(--component-${component}-${variant}-background-active)`,
    text: `var(--component-${component}-${variant}-text)`,
    border: `var(--component-${component}-${variant}-border)`,
    borderFocus: `var(--component-${component}-${variant}-border-focus)`,
    radius: `var(--component-${component}-${variant}-radius)`,
    padding: {
      x: `var(--component-${component}-${variant}-padding-x)`,
      y: `var(--component-${component}-${variant}-padding-y)`,
    },
    typography: `var(--component-${component}-${variant}-typography)`,
    shadow: `var(--component-${component}-${variant}-shadow)`,
    shadowHover: `var(--component-${component}-${variant}-shadow-hover)`,
  }
}
```

## Accessibility Framework

### WCAG 2.2 AA Compliance

All design tokens include accessibility considerations:

```css
/* Accessibility-First Color Tokens */
--semantic-color-text-default: var(
  --foundation-color-gray-900
); /* 21:1 contrast ratio */
--semantic-color-text-muted: var(
  --foundation-color-gray-600
); /* 7:1 contrast ratio */
--semantic-color-text-subtle: var(
  --foundation-color-gray-500
); /* 4.5:1 contrast ratio */

/* High Contrast Theme Overrides */
:root[data-theme='high-contrast'] {
  --semantic-color-text-default: #000000; /* Maximum contrast */
  --semantic-color-background-default: #ffffff;
  --semantic-color-border-default: #000000;
  --foundation-shadow-sm: none; /* Remove shadows */
}

/* Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  :root {
    --foundation-transition-duration: 0ms;
    --foundation-animation-duration: 0ms;
  }
}
```

### Focus Management

```css
/* Accessible Focus Tokens */
--semantic-focus-ring-color: var(--foundation-color-brand-500);
--semantic-focus-ring-width: 2px;
--semantic-focus-ring-style: solid;
--semantic-focus-ring-offset: 2px;

/* Focus Ring Utility */
.focus-ring {
  &:focus-visible {
    outline: var(--semantic-focus-ring-width) var(--semantic-focus-ring-style)
      var(--semantic-focus-ring-color);
    outline-offset: var(--semantic-focus-ring-offset);
  }
}
```

## Performance Optimization

### Bundle Size Management

1. **Tree-Shaking**: Only include used design tokens
2. **Theme Lazy Loading**: Load themes on-demand
3. **Critical CSS**: Inline essential tokens
4. **Compression**: Gzip + Brotli for token files

### Runtime Performance

```typescript
// Optimized Theme Switching
class PerformantThemeManager {
  private themeCache = new Map<string, Record<string, string>>()
  private preloadedThemes = new Set<string>()

  async setTheme(themeId: string): Promise<void> {
    // Check if theme is already cached
    if (!this.themeCache.has(themeId)) {
      await this.loadTheme(themeId)
    }

    // Apply theme with single DOM operation
    const tokens = this.themeCache.get(themeId)!
    this.applyTokens(tokens)
  }

  private async loadTheme(themeId: string): Promise<void> {
    const tokens = await import(`./themes/${themeId}.json`)
    this.themeCache.set(themeId, tokens.default)
  }

  private applyTokens(tokens: Record<string, string>): void {
    const root = document.documentElement
    const style = root.style

    // Batch DOM updates
    Object.entries(tokens).forEach(([property, value]) => {
      style.setProperty(property, value)
    })
  }
}
```

## Developer Experience

### Type Safety

```typescript
// Generated types for design tokens
export interface DesignTokens {
  colors: {
    background: {
      default: string
      subtle: string
      muted: string
      emphasis: string
      inverse: string
    }
    text: {
      default: string
      muted: string
      subtle: string
      inverse: string
      brand: string
    }
    status: {
      success: string
      warning: string
      danger: string
      info: string
    }
  }
  typography: {
    display1: string
    heading1: string
    bodyDefault: string
    caption: string
  }
  spacing: {
    componentGap: string
    sectionGap: string
  }
  radius: {
    component: string
  }
}

// Type-safe token access
export const tokens: DesignTokens = {
  colors: {
    background: {
      default: 'var(--semantic-color-background-default)',
      subtle: 'var(--semantic-color-background-subtle)',
      // ... etc
    },
    // ... etc
  },
  // ... etc
}
```

### Development Tools

```typescript
// Design Token Inspector (Development Only)
if (process.env.NODE_ENV === 'development') {
  window.designTokens = {
    inspect: (element: HTMLElement) => {
      const styles = getComputedStyle(element)
      const tokens = Array.from(styles).filter(
        (prop) =>
          prop.startsWith('--foundation-') ||
          prop.startsWith('--semantic-') ||
          prop.startsWith('--component-'),
      )

      console.table(
        tokens.reduce(
          (acc, token) => {
            acc[token] = styles.getPropertyValue(token)
            return acc
          },
          {} as Record<string, string>,
        ),
      )
    },

    themes: () => document.documentElement.getAttribute('data-theme'),

    setTheme: (theme: string) => {
      document.documentElement.setAttribute('data-theme', theme)
    },
  }
}
```

### IDE Integration

```json
// .vscode/settings.json
{
  "css.customData": [".vscode/css-custom-data.json"],
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

```json
// .vscode/css-custom-data.json
{
  "properties": [
    {
      "name": "--semantic-color-background-default",
      "description": "Default background color that adapts to theme",
      "syntax": "<color>"
    },
    {
      "name": "--component-button-primary-background",
      "description": "Primary button background color",
      "syntax": "<color>"
    }
  ]
}
```

## Governance & Maintenance

### Token Lifecycle

1. **Proposal**: New tokens proposed via RFC process
2. **Review**: Design and engineering review
3. **Implementation**: Token added to foundation
4. **Migration**: Gradual adoption across components
5. **Deprecation**: Old tokens marked for removal
6. **Removal**: Clean removal after migration period

### Documentation Generation

```typescript
// Automated documentation generation
interface TokenDocumentation {
  name: string
  value: string
  description: string
  category: 'foundation' | 'semantic' | 'component'
  usage: string[]
  examples: string[]
  accessibility: string
}

// Generate documentation from token definitions
function generateTokenDocs(): TokenDocumentation[] {
  // Parse CSS files and extract token metadata
  // Generate usage examples
  // Validate accessibility compliance
  // Create interactive examples
}
```

### Quality Assurance

```typescript
// Automated testing for design tokens
describe('Design Token Quality', () => {
  test('all semantic tokens reference foundation tokens', () => {
    const semanticTokens = getSemanticTokens()
    semanticTokens.forEach((token) => {
      expect(token.value).toMatch(/var\(--foundation-/)
    })
  })

  test('contrast ratios meet WCAG AA standards', () => {
    const colorCombinations = getColorCombinations()
    colorCombinations.forEach(({ background, foreground }) => {
      const contrast = calculateContrast(background, foreground)
      expect(contrast).toBeGreaterThan(4.5)
    })
  })

  test('theme switching preserves semantic meaning', () => {
    const themes = ['light', 'dark', 'high-contrast']
    themes.forEach((theme) => {
      setTheme(theme)
      const primaryButton = getComputedStyle(
        document.querySelector('[data-testid="primary-button"]'),
      )
      expect(primaryButton.backgroundColor).toBeDefined()
      expect(primaryButton.color).toBeDefined()
    })
  })
})
```

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

- [ ] Set up foundation token architecture
- [ ] Implement base theme (light)
- [ ] Create TailwindCSS v4 configuration
- [ ] Build theme manager utility

### Phase 2: Core Components (Weeks 3-4)

- [ ] Implement component token system
- [ ] Build base UI components (Button, Input, Select)
- [ ] Create component documentation
- [ ] Set up Storybook integration

### Phase 3: Theme System (Weeks 5-6)

- [ ] Implement dark theme
- [ ] Create high-contrast theme
- [ ] Build theme switching interface
- [ ] Add accessibility testing

### Phase 4: Scale & Optimize (Weeks 7-8)

- [ ] Performance optimization
- [ ] Bundle size optimization
- [ ] Create theme generation tools
- [ ] Implement CI/CD for token management

### Phase 5: Advanced Features (Weeks 9-12)

- [ ] Custom theme builder interface
- [ ] Advanced component variants
- [ ] Motion and animation tokens
- [ ] Mobile-specific optimizations

## Conclusion

The CoreLive Design System represents a comprehensive, scalable solution for multi-theme applications. Built on modern CSS Custom Properties and TailwindCSS v4, it provides the foundation for consistent, accessible, and performant user interfaces that can adapt to unlimited visual themes while maintaining design coherence and developer productivity.

This specification serves as the blueprint for a production-grade design system that scales with your organization's needs while maintaining the highest standards of quality, performance, and accessibility.
