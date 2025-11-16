# CoreLive Design System - Quick Reference

## 🎨 Available Themes

```tsx
// Free Themes (14)
;(light, dark, traditional - light, traditional - dark)
;(harmonized - red, harmonized - red - dark)
;(harmonized - mustard, harmonized - mustard - dark)
;(harmonized - turquoise, harmonized - turquoise - dark)
;(harmonized - azure, harmonized - azure - dark)
;(harmonized - fuchsia, harmonized - fuchsia - dark)

// Premium Dark (5 examples)
;(dark - midnight, dark - charcoal, dark - obsidian, dark - noir, dark - shadow)

// Premium Light (5 examples)
;(light - pearl, light - snow, light - cream, light - alabaster, light - ivory)

// Premium Gradient (5 examples)
;(gradient - aurora,
  gradient - sunset,
  gradient - ocean,
  gradient - forest,
  gradient - nebula)

// Premium Retro (5 examples)
;(retro - synthwave,
  retro - terminal,
  retro - vaporwave,
  retro - sepia,
  retro - neon)

// Premium Seasonal (5 examples)
;(seasonal - spring - blossom, seasonal - summer - beach)
;(seasonal - autumn - forest, seasonal - winter - snow, seasonal - holiday)
```

## 🔧 Common Token Usage

### Colors

```css
/* Backgrounds */
bg-background          /* Main background */
bg-card               /* Card background */
bg-primary            /* Primary button/accent */
bg-secondary          /* Secondary elements */
bg-muted              /* Muted backgrounds */

/* Text */
text-foreground       /* Main text */
text-primary-foreground /* Text on primary bg */
text-muted-foreground /* Muted/secondary text */

/* Borders */
border-border         /* Default borders */
border-input         /* Input borders */
ring-ring            /* Focus rings */
```

### Spacing

```css
/* Common spacings */
p-1  (4px)    p-4  (16px)    p-8  (32px)
p-2  (8px)    p-5  (20px)    p-10 (40px)
p-3  (12px)   p-6  (24px)    p-12 (48px)

/* Using CSS variables */
padding: var(--spacing-4);
margin: var(--spacing-2);
gap: var(--spacing-3);
```

### Component Classes

```css
/* Todo Items */
.todo-item
.todo-item-completed
.todo-item-checkbox
.todo-item-text
.todo-item-tag

/* Buttons */
.button
.button-sm / .button-lg
.button-default / .button-outline / .button-ghost
.button-destructive / .button-link

/* Cards */
.card
.card-header
.card-title
.card-description
.card-content
.card-footer

/* Inputs */
.input
.input-sm / .input-lg
.textarea
.checkbox
.radio
.switch
```

## ✨ Animation Classes

### Micro Interactions

```css
.pulse              /* Continuous pulse */
.pulse-once         /* Single pulse */
.bounce             /* Bounce effect */
.shake              /* Error shake */
.hover-scale        /* Scale on hover */
.pressed-scale      /* Scale on press */
.card-lift          /* Lift card on hover */
```

### Transitions

```css
.fade-enter         /* Fade in */
.fade-exit          /* Fade out */
.slide-enter-right  /* Slide from right */
.menu-slide         /* Menu animation */
.tooltip            /* Tooltip fade */
```

## 🚀 Component Usage

### Theme Switching

```tsx
import { useTheme } from 'next-themes'

const { theme, setTheme } = useTheme()
setTheme('gradient-aurora')
```

### Animations

```tsx
// Confetti
import { ConfettiAnimation, useConfetti } from '@/components/animations'
const { trigger, celebrate } = useConfetti()

// Level Up
import { LevelUpAnimation, useLevelUp } from '@/components/animations'
const { showAnimation, levelUp } = useLevelUp()

// Achievements
import { useAchievements } from '@/components/animations'
const { unlockAchievement, templates } = useAchievements()
```

## 📝 Token Examples

### Button with Tokens

```tsx
<button className="hover:bg-primary/90 h-[var(--button-height-md)] rounded-[var(--button-border-radius)] bg-primary px-[var(--button-padding-x-md)] text-primary-foreground transition-colors">
  Click Me
</button>
```

### Card with Tokens

```tsx
<div className="rounded-[var(--card-border-radius)] bg-card p-[var(--card-padding)] text-card-foreground shadow-[var(--card-shadow)] transition-shadow hover:shadow-[var(--card-shadow-hover)]">
  Card Content
</div>
```

### Input with Tokens

```tsx
<input className="focus:ring-ring/50 h-[var(--input-height-md)] w-full rounded-[var(--input-border-radius)] border border-input bg-background px-[var(--input-padding-x)] transition-colors focus:border-ring focus:ring-[var(--input-focus-ring-width)]" />
```

## 🎯 Theme-Specific Styling

```css
/* Target specific theme */
[data-theme='gradient-aurora'] {
  /* Aurora-specific styles */
}

/* Target theme category */
[data-theme^='gradient'] {
  /* All gradient themes */
}

[data-theme^='retro'] {
  /* All retro themes */
}

/* Target mode */
[data-theme$='-dark'] {
  /* All dark variants */
}

.dark {
  /* Dark mode (any dark theme) */
}
```

## 🔍 CSS Variable Reference

```css
/* Quick lookup in DevTools */
:root {
  /* Colors */
  --color-background
  --color-foreground
  --color-primary
  --color-secondary
  --color-accent
  --color-muted
  --color-card
  --color-success
  --color-warning
  --color-danger

  /* Spacing */
  --spacing-{0-96}

  /* Radius */
  --radius-sm (4px)
  --radius-md (8px)
  --radius-lg (12px)
  --radius-xl (20px)

  /* Shadows */
  --shadow-sm
  --shadow-md
  --shadow-lg

  /* Animation */
  --duration-fast (150ms)
  --duration-normal (300ms)
  --duration-slow (500ms)
  --ease-smooth
  --ease-bounce
}
```

## 🚨 Common Pitfalls

1. **Don't use hard-coded colors**

   ```diff
   - bg-blue-500
   + bg-primary
   ```

2. **Use semantic tokens**

   ```diff
   - text-gray-600
   + text-muted-foreground
   ```

3. **Theme-aware borders**

   ```diff
   - border-gray-200 dark:border-gray-700
   + border-border
   ```

4. **Consistent spacing**
   ```diff
   - p-[18px]
   + p-4 or p-[var(--spacing-4)]
   ```
