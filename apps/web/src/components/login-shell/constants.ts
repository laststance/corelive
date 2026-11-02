/**
 * Fill for each login-ribbon level (0 = rest, 4 = strongest), as `--primary`
 * mixed into `--muted`. The ramp follows the active theme: neutral on Default,
 * cream to amber on Warm Cathedral, the family accent on colored themes.
 * Consumed by {@link LoginShell}'s decorative ribbon; deliberately independent
 * of the content-colour `--hm-*` heatmap tokens.
 */
export const LOGIN_RIBBON_LEVEL_FILLS = [
  'color-mix(in oklch, var(--primary) 10%, var(--muted))',
  'color-mix(in oklch, var(--primary) 30%, var(--muted))',
  'color-mix(in oklch, var(--primary) 50%, var(--muted))',
  'color-mix(in oklch, var(--primary) 70%, var(--muted))',
  'color-mix(in oklch, var(--primary) 90%, var(--muted))',
] as const
