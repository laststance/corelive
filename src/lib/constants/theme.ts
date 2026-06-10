/**
 * Theme-toggle crossfade duration — the short motion tier (DESIGN.md Motion →
 * "Theme toggle: crossfade"), locked to 200ms ease-out. Mirrors the `200ms`
 * literal in the `html.theme-transition` rule in globals.css: <ThemeTransition>
 * keeps that transient class on <html> for exactly one crossfade window, so this
 * value MUST stay in sync with the CSS or the class would be cleared before the
 * fade finishes (early snap) or linger past it.
 */
export const THEME_CROSSFADE_DURATION_MS = 200
