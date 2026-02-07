/**
 * Shared mapping from category color names to Tailwind background classes.
 * Used by Category, CategoryManageDialog, FloatingNavigator, and TodoItem.
 *
 * @example
 * getColorDotClass('blue')  // => 'bg-blue-500'
 * getColorDotClass('unknown') // => 'bg-muted-foreground'
 */
import type { CategoryColor } from '@/server/schemas/category'

/** Tailwind background color classes mapped to category color names */
export const COLOR_DOT_CLASSES: Record<CategoryColor, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
}

/**
 * Returns the Tailwind bg class for a category color.
 * @param color - Category color name
 * @returns Tailwind bg-* class string, or 'bg-muted-foreground' for unknown colors
 * @example
 * getColorDotClass('blue')    // => 'bg-blue-500'
 * getColorDotClass(undefined) // => 'bg-muted-foreground'
 */
export const getColorDotClass = (color?: string | null): string =>
  (color && COLOR_DOT_CLASSES[color as CategoryColor]) ?? 'bg-muted-foreground'
