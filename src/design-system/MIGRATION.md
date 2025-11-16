# CoreLive Design System Migration Guide

This guide helps you migrate existing components to use the new CoreLive Design System.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Migration](#step-by-step-migration)
4. [Component Migration](#component-migration)
5. [Theme Migration](#theme-migration)
6. [Common Issues](#common-issues)
7. [Rollback Plan](#rollback-plan)

## Overview

The migration involves:

- Replacing hard-coded colors with design tokens
- Updating components to use new token-based classes
- Implementing ThemeProvider for theme switching
- Converting animations to use the new system

## Prerequisites

Before migrating:

1. **Backup your code**

   ```bash
   git checkout -b design-system-migration
   ```

2. **Install dependencies**

   ```bash
   pnpm add next-themes
   ```

3. **Ensure Tailwind CSS v4 is configured**
   ```js
   // tailwind.config.ts
   export default {
     darkMode: 'class',
     // ... rest of config
   }
   ```

## Step-by-Step Migration

### Step 1: Add ThemeProvider

Update your root layout:

```diff
// app/layout.tsx
+ import { ThemeProvider } from '@/providers/ThemeProvider'

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
+       <ThemeProvider>
          {children}
+       </ThemeProvider>
      </body>
    </html>
  )
}
```

### Step 2: Import Design System

Ensure the design system is imported in your globals.css:

```diff
// src/globals.css
@import 'tailwindcss';
@import 'tw-animate-css';
+ @import './design-system/index.css';
```

### Step 3: Add Theme Selector

Add theme switching capability:

```tsx
// components/Header.tsx
import { ThemeSelector } from '@/components/ThemeSelector'

export function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      <Logo />
      <ThemeSelector />
    </header>
  )
}
```

## Component Migration

### Migrating Colors

Replace hard-coded colors with design tokens:

```diff
// Before
- <div className="bg-white dark:bg-gray-900 text-black dark:text-white">
+ <div className="bg-background text-foreground">

// Before
- <button className="bg-blue-500 hover:bg-blue-600 text-white">
+ <button className="bg-primary hover:bg-primary/90 text-primary-foreground">

// Before
- <div className="border border-gray-200 dark:border-gray-700">
+ <div className="border border-border">
```

### Migrating Spacing

Replace pixel values with spacing tokens:

```diff
// Before
- <div className="p-4 m-2 gap-3">
+ <div className="p-4 m-2 gap-3"> // These already use token values

// Before (custom values)
- <div className="p-[18px] m-[10px]">
+ <div className="p-[var(--spacing-4)] m-[var(--spacing-2-5)]">
```

### Migrating Typography

Update font properties:

```diff
// Before
- <h1 className="text-2xl font-bold">
+ <h1 className="text-2xl font-bold"> // Can keep as-is

// Before (custom)
- <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
+ <p className="text-sm leading-normal">
```

### Migrating Components

#### Button Component

```diff
// Before
export function Button({ variant = 'primary', children }) {
  const variants = {
-   primary: 'bg-blue-500 hover:bg-blue-600 text-white',
-   secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900',
+   primary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
+   secondary: 'bg-secondary hover:bg-secondary/90 text-secondary-foreground',
  }

  return (
-   <button className={`px-4 py-2 rounded ${variants[variant]}`}>
+   <button className={`h-[var(--button-height-md)] px-[var(--button-padding-x-md)] rounded-[var(--button-border-radius)] ${variants[variant]} transition-colors`}>
      {children}
    </button>
  )
}
```

#### Card Component

```diff
// Before
- <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm hover:shadow-md">
+ <div className="bg-card text-card-foreground p-[var(--card-padding)] rounded-[var(--card-border-radius)] shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] transition-shadow">
```

#### Input Component

```diff
// Before
- <input className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
+ <input className="w-full h-[var(--input-height-md)] px-[var(--input-padding-x)] border border-input rounded-[var(--input-border-radius)] bg-background focus:border-ring focus:ring-[var(--input-focus-ring-width)] focus:ring-ring/50 transition-colors" />
```

### Migrating Todo Components

```diff
// TodoItem.tsx
function TodoItem({ task, onComplete }) {
  return (
-   <div className={`flex items-center p-4 ${task.completed ? 'opacity-60' : ''}`}>
+   <div className={cn(
+     'todo-item flex items-center',
+     task.completed && 'todo-item-completed'
+   )}>
      <input
        type="checkbox"
-       className="mr-3 w-5 h-5"
+       className="todo-item-checkbox mr-3"
        checked={task.completed}
        onChange={onComplete}
      />
-     <span className={task.completed ? 'line-through' : ''}>
+     <span className="todo-item-text">
        {task.title}
      </span>
    </div>
  )
}
```

## Theme Migration

### From Basic Light/Dark

If you're using basic light/dark mode:

```diff
// Before: Manual dark mode classes
- <div className="bg-white dark:bg-black">

// After: Automatic theme support
+ <div className="bg-background">
```

### Custom Theme Colors

Convert custom color schemes:

```diff
// Before: Custom color variables
:root {
-  --primary-color: #3b82f6;
-  --secondary-color: #8b5cf6;
}

// After: Use theme system
// Colors are now managed by themes
```

### Adding Theme-Specific Styles

```css
/* Target specific themes */
[data-theme='traditional-light'] {
  /* Traditional theme overrides */
}

[data-theme^='gradient'] {
  /* All gradient theme overrides */
}

[data-theme$='-dark'] {
  /* All dark variant overrides */
}
```

## Animation Migration

### Using New Animation System

```diff
// Before: Custom confetti implementation
- import { customConfetti } from './confetti'

// After: Design system animations
+ import { ConfettiAnimation, useConfetti } from '@/components/animations'

function TodoComplete() {
- const [showConfetti, setShowConfetti] = useState(false)
+ const { trigger, celebrate } = useConfetti()

  const handleComplete = () => {
-   setShowConfetti(true)
-   setTimeout(() => setShowConfetti(false), 3000)
+   celebrate()
  }

  return (
    <>
      <button onClick={handleComplete}>Complete</button>
-     {showConfetti && <CustomConfetti />}
+     <ConfettiAnimation trigger={trigger} />
    </>
  )
}
```

## Common Issues

### 1. Flash of Unstyled Content (FOUC)

**Problem**: Theme flashes on load
**Solution**: Ensure `suppressHydrationWarning` is on `<html>`

```tsx
<html lang="en" suppressHydrationWarning>
```

### 2. Missing Token Values

**Problem**: `var(--token-name)` shows as invalid
**Solution**: Check token is defined in design system

```css
/* Verify in DevTools */
:root {
  --color-primary: oklch(...); /* Should be defined */
}
```

### 3. Theme Not Applying

**Problem**: Theme changes don't reflect
**Solution**: Verify ThemeProvider wraps entire app

```tsx
// ThemeProvider should be at root level
<ThemeProvider>
  <App /> {/* All content inside */}
</ThemeProvider>
```

### 4. Specificity Issues

**Problem**: Old styles override new tokens
**Solution**: Remove `!important` and inline styles

```diff
// Remove important flags
- style={{ backgroundColor: '#fff !important' }}
+ className="bg-background"
```

## Rollback Plan

If you need to rollback:

1. **Git revert**

   ```bash
   git revert HEAD
   ```

2. **Remove imports**

   ```diff
   - @import './design-system/index.css';
   ```

3. **Remove ThemeProvider**

   ```diff
   - <ThemeProvider>
     {children}
   - </ThemeProvider>
   ```

4. **Restore original classes**
   - Use git diff to identify changed classes
   - Restore previous color/spacing values

## Verification Checklist

After migration, verify:

- [ ] All themes load without errors
- [ ] Theme switching works instantly
- [ ] No FOUC on page load
- [ ] Animations play correctly
- [ ] Reduced motion is respected
- [ ] Components look correct in all themes
- [ ] No console errors
- [ ] Performance is maintained
- [ ] Accessibility is preserved

## Next Steps

1. **Test thoroughly** in all supported themes
2. **Update Storybook** stories with new tokens
3. **Document** any custom theme overrides
4. **Train team** on using design tokens
5. **Monitor** for issues in production

## Need Help?

- Review the [Design System Documentation](./README.md)
- Check component examples in `/src/components`
- Test in Storybook for visual verification
- File issues for migration problems
