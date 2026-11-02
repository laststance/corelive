/**
 * Pre-paint background of the login window when the OS appearance is dark: the
 * stock shadcn Default dark `--background` (`oklch(0.145 0 0)`) as sRGB hex, so a
 * dark Mac never flashes white before the web content paints. Must stay equal to
 * the Default dark seed in `packages/live-editor/src/themes/registry.ts`.
 */
export const LOGIN_WINDOW_BACKGROUND_DARK = '#0a0a0a'

/**
 * Pre-paint background of the login window when the OS appearance is light: the
 * stock shadcn Default light `--background` (`oklch(1 0 0)`) as sRGB hex.
 */
export const LOGIN_WINDOW_BACKGROUND_LIGHT = '#ffffff'
