# CoreLive Design System v2.0

## Token Architecture

### 1. Primitive Tokens (Level 0)

```css
/* Color Primitives - Raw values */
--primitive-color-{family}-{scale}     /* e.g., --primitive-color-brand-500 */
--primitive-space-{scale}              /* e.g., --primitive-space-4 */
--primitive-radius-{scale}             /* e.g., --primitive-radius-md */
--primitive-shadow-{level}             /* e.g., --primitive-shadow-2 */
--primitive-font-size-{scale}          /* e.g., --primitive-font-size-3 */
--primitive-font-weight-{weight}       /* e.g., --primitive-font-weight-semibold */
--primitive-line-height-{scale}        /* e.g., --primitive-line-height-tight */
```

### 2. System Tokens (Level 1)

```css
/* Semantic Tokens - Global patterns */
--system-color-{role}-{modifier}-{state}        /* e.g., --system-color-background-default */
--system-space-{context}-{scale}                /* e.g., --system-space-component-md */
--system-typography-{pattern}-{property}        /* e.g., --system-typography-heading-size */
--system-motion-{property}-{speed}              /* e.g., --system-motion-duration-fast */
--system-elevation-{level}                      /* e.g., --system-elevation-raised */
```

### 3. Component Tokens (Level 2)

```css
/* Component-specific tokens */
--component-{name}-{element}-{property}-{state}  /* e.g., --component-button-primary-background-hover */
--component-{name}-{variant}-{property}          /* e.g., --component-input-error-border */
```

### 4. Theme Override Tokens (Level 3)

```css
/* Theme-specific overrides */
--theme-{context}-{token-path}  /* e.g., --theme-healthcare-color-primary */
```

## Color System

### Color Families (11 total)

- **Brand**: primary, secondary, accent
- **Semantic**: success, warning, danger, info, discovery
- **UI**: neutral, surface, border

### Color Tokens per Family

```css
--primitive-color-{family}-{50|100|200|300|400|500|600|700|800|900|950}

/* Semantic mappings */
--system-color-{family}                /* Base color */
--system-color-{family}-container      /* Light background */
--system-color-{family}-on            /* Text on base */
--system-color-{family}-on-container  /* Text on container */
--system-color-{family}-outline       /* Border color */
--system-color-{family}-surface       /* Very light background */
--system-color-{family}-inverse       /* Inverted contrast */

/* States */
--system-color-{family}-{hover|active|focus|disabled}
```

## Theme Inheritance System

```typescript
interface ThemeHierarchy {
  foundation: FoundationTokens // Immutable primitives
  archetype: ArchetypeTheme // light | dark | high-contrast
  brand: BrandTheme // Industry/org specific
  context?: ContextTheme // Device/print specific
  custom?: CustomOverrides // User/app specific
}
```

### Theme Loading Strategy

1. Load foundation (cached globally)
2. Load archetype (cached per type)
3. Apply brand overrides (lazy)
4. Apply context overrides (lazy)
5. Apply custom overrides (dynamic)

## TailwindCSS v4 Integration

### Dynamic Utilities

```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: generateThemeColors(),
      spacing: generateThemeSpacing(),
      borderRadius: generateThemeBorderRadius(),
    },
  },
  plugins: [coreliveDynamicThemePlugin(), coreliveComponentPlugin()],
}
```

### Theme-Aware Classes

```css
/* Auto-generated utilities */
.bg-primary              /* var(--system-color-primary) */
.bg-primary-container    /* var(--system-color-primary-container) */
.text-on-primary         /* var(--system-color-primary-on) */
.border-primary-outline  /* var(--system-color-primary-outline) */

/* Component classes */
.btn-primary {
  @apply px-component-md py-component-sm rounded-component bg-component-button-primary text-component-button-primary-text border-component-button-primary-border duration-system-fast border transition-all;
}
```

## Spacing System

```css
/* Base scale */
--primitive-space-1: 0.25rem; /* 4px */
--primitive-space-2: 0.5rem; /* 8px */
--primitive-space-3: 0.75rem; /* 12px */
--primitive-space-4: 1rem; /* 16px */
--primitive-space-5: 1.5rem; /* 24px */
--primitive-space-6: 2rem; /* 32px */
--primitive-space-7: 2.5rem; /* 40px */
--primitive-space-8: 3rem; /* 48px */
--primitive-space-9: 4rem; /* 64px */
--primitive-space-10: 5rem; /* 80px */

/* Semantic mappings */
--system-space-component-xs: var(--primitive-space-1);
--system-space-component-sm: var(--primitive-space-2);
--system-space-component-md: var(--primitive-space-4);
--system-space-component-lg: var(--primitive-space-6);
--system-space-component-xl: var(--primitive-space-8);
```

## Typography System

```css
/* Font sizes */
--primitive-font-size-1: 0.75rem; /* 12px */
--primitive-font-size-2: 0.875rem; /* 14px */
--primitive-font-size-3: 1rem; /* 16px */
--primitive-font-size-4: 1.125rem; /* 18px */
--primitive-font-size-5: 1.25rem; /* 20px */
--primitive-font-size-6: 1.5rem; /* 24px */
--primitive-font-size-7: 2rem; /* 32px */
--primitive-font-size-8: 2.5rem; /* 40px */
--primitive-font-size-9: 3rem; /* 48px */

/* Typography patterns */
--system-typography-display-1: 700 var(--primitive-font-size-9) / 1.1;
--system-typography-display-2: 700 var(--primitive-font-size-8) / 1.2;
--system-typography-display-3: 700 var(--primitive-font-size-7) / 1.2;
--system-typography-heading-1: 700 var(--primitive-font-size-6) / 1.3;
--system-typography-heading-2: 600 var(--primitive-font-size-5) / 1.4;
--system-typography-heading-3: 600 var(--primitive-font-size-4) / 1.4;
--system-typography-body-1: 400 var(--primitive-font-size-3) / 1.5;
--system-typography-body-2: 400 var(--primitive-font-size-2) / 1.5;
--system-typography-caption: 400 var(--primitive-font-size-1) / 1.4;
```

## Theme API

```typescript
interface ThemeGenerator {
  createTheme(config: {
    archetype: 'light' | 'dark' | 'high-contrast'
    brandColors: {
      primary: string
      secondary: string
      accent: string
    }
    semanticMapping?: Partial<SemanticTokenMap>
    customOverrides?: Record<string, string>
  }): Theme

  generateVariants(baseTheme: Theme, variants: VariantConfig[]): Theme[]
  validateAccessibility(theme: Theme): AccessibilityReport
  exportTheme(theme: Theme, format: 'css' | 'json' | 'figma'): string
}
```

## Performance Optimization

```typescript
class ThemeManager {
  private themeCache = new Map<string, CSSStyleSheet>()

  async switchTheme(themeId: string): Promise<void> {
    if (!this.themeCache.has(themeId)) {
      const stylesheet = new CSSStyleSheet()
      await stylesheet.replace(await this.loadThemeCSS(themeId))
      this.themeCache.set(themeId, stylesheet)
    }

    document.adoptedStyleSheets = [this.themeCache.get(themeId)]
  }
}
```

## Accessibility

```css
/* Automatic contrast adjustment */
@media (prefers-contrast: high) {
  :root {
    --system-color-{family}-on: #{adjustContrast(7:1)};
    --system-color-{family}-outline: #{adjustContrast(4.5:1)};
  }
}

/* Motion preferences */
@media (prefers-reduced-motion: reduce) {
  :root {
    --system-motion-duration-fast: 0ms;
    --system-motion-duration-normal: 0ms;
    --system-motion-duration-slow: 0ms;
  }
}
```

## Implementation Phases

### Phase 1: Foundation (Weeks 1-3)

- Implement token architecture
- Expand color system
- Create theme inheritance

### Phase 2: Integration (Weeks 4-6)

- TailwindCSS v4 setup
- Component token generation
- Theme switching system

### Phase 3: Tooling (Weeks 7-9)

- CLI tools
- TypeScript integration
- Testing framework

### Phase 4: Scale (Weeks 10-12)

- Create 20+ test themes
- Performance optimization
- Documentation generation
