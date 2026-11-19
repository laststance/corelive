/** Family order shared by the picker, the palette registry and the stored account preference. */
export const THEME_FAMILY_IDS = [
  'default',
  'cathedral',
  'harbor',
  'grove',
  'rose-tea',
  'iris',
  'graphite',
] as const
export type ThemeFamilyId = (typeof THEME_FAMILY_IDS)[number]
export type ThemeMode = 'light' | 'dark'

/** The default family uses flat IDs so the operating system can resolve its light and dark variants. */
export type ThemeId =
  ThemeMode | `${Exclude<ThemeFamilyId, 'default'>}-${ThemeMode}`

/** Resolves a picker family and light/dark mode to the ID stored by the dashboard and desktop.
 * @example getThemeId('default','dark') // 'dark'
 * @example getThemeId('cathedral','dark') // 'cathedral-dark'
 */
export function getThemeId(family: ThemeFamilyId, mode: ThemeMode): ThemeId {
  return family === 'default' ? mode : `${family}-${mode}`
}
