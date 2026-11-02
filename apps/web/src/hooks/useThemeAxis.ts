'use client'

import { useTheme } from 'next-themes'

import { useMounted } from '@/hooks/use-mounted'
import {
  DEFAULT_THEME_ID,
  getThemeId,
  getThemeMode,
  isThemeId,
  normalizeThemePreference,
  THEME_FAMILY_IDS,
  THEME_FAMILY_LABEL,
  THEME_REGISTRY,
} from '@/lib/themes/registry'
import type { ThemeFamilyId, ThemeId, ThemeMode } from '@/lib/themes/registry'

/** Mode axis of the picker: the two real modes plus the OS-managed "system". */
export type ThemeModeChoice = ThemeMode | 'system'

/** One option on the family axis — a family id with its display label. */
export interface ThemeFamilyOption {
  family: ThemeFamilyId
  label: string
}

/** State + actions for the two-axis (family × mode) theme picker. */
export interface ThemeAxis {
  /** The active family (Default while on System — System maps to it). */
  family: ThemeFamilyId
  /** The active mode for the mode axis: `light` / `dark` / `system`. */
  mode: ThemeModeChoice
  /** True when the OS-managed System theme is selected. */
  isSystem: boolean
  /** The concrete light/dark actually applied (System → the OS setting). */
  resolvedMode: ThemeMode
  /** The concrete theme id currently applied (e.g. `harbor-dark`). */
  activeId: ThemeId
  /** Modes offered for the active family — only Default exposes System. */
  availableModes: ThemeModeChoice[]
  /** Every family, default-first, for the family axis. */
  families: ThemeFamilyOption[]
  /** Switch family, keeping the current mode (System → that family, explicit). */
  setFamily: (family: ThemeFamilyId) => void
  /** Switch mode, keeping the current family (System → the Default pair). */
  setMode: (mode: ThemeModeChoice) => void
  /** Radio/toggle-group adapter: applies a raw string if it is an offered mode, else ignores it. */
  selectMode: (value: string) => void
  /** Radio-group adapter: applies a raw string if it is a known family, else ignores it. */
  selectFamily: (value: string) => void
  /** False until mounted — render a disabled/placeholder state until then. */
  mounted: boolean
}

/**
 * Drives the two-axis theme picker (Settings page + sidebar quick-switch), turning
 * next-themes' single stored value into an independent (family, mode) selection
 * and back. Encapsulates the System rule: System is OS-managed and maps ONLY to the
 * Default light/dark pair (next-themes resolves System to the names `light`/`dark`,
 * which the Default family owns), so other families never expose System and
 * choosing System selects the Default pair. The raw stored value is read through
 * {@link normalizeThemePreference}, so a legacy alias or unknown value is reflected
 * immediately, before the allowlist guard repairs storage.
 * @returns the {@link ThemeAxis} state and `setFamily`/`setMode` actions.
 * @example
 * const { family, mode, setFamily, setMode, families } = useThemeAxis()
 * setFamily('harbor') // → 'harbor-light' or 'harbor-dark', preserving the mode
 * setMode('system')   // → OS-managed Default pair
 */
export function useThemeAxis(): ThemeAxis {
  const { theme, resolvedTheme, systemTheme, setTheme } = useTheme()
  const mounted = useMounted()

  const normalizedTheme = normalizeThemePreference(theme)
  const isSystem = normalizedTheme === 'system'
  // Concrete value behind the picker, by precedence:
  // - stored 'system': next-themes' resolved OS mode
  // - unknown raw value that normalizes to System: next-themes' resolvedTheme would
  //   echo the unknown raw string, so use the OS mode (systemTheme) instead
  // - otherwise the normalized id itself
  const rawActiveId = isSystem
    ? theme === 'system'
      ? resolvedTheme
      : systemTheme
    : normalizedTheme
  const activeId: ThemeId = isThemeId(rawActiveId)
    ? rawActiveId
    : DEFAULT_THEME_ID

  const family = THEME_REGISTRY[activeId].family
  const resolvedMode = getThemeMode(activeId)
  const mode: ThemeModeChoice = isSystem ? 'system' : resolvedMode

  // Only the Default family is OS-managed; every other family is an explicit choice.
  const availableModes: ThemeModeChoice[] =
    family === 'default' ? ['light', 'dark', 'system'] : ['light', 'dark']

  const families = THEME_FAMILY_IDS.map((familyId) => ({
    family: familyId,
    label: THEME_FAMILY_LABEL[familyId],
  }))

  const setFamily = (nextFamily: ThemeFamilyId): void => {
    // Re-picking Default while on System keeps the OS-managed pairing.
    if (nextFamily === 'default' && isSystem) {
      setTheme('system')
      return
    }
    // Any other pick collapses System to an explicit id at the resolved mode.
    setTheme(getThemeId(nextFamily, resolvedMode))
  }

  const setMode = (nextMode: ThemeModeChoice): void => {
    // System is OS-managed and family-agnostic → the Default pair.
    if (nextMode === 'system') {
      setTheme('system')
      return
    }
    setTheme(getThemeId(family, nextMode))
  }

  // Radix groups emit plain strings (and '' when a toggle is re-clicked); narrow
  // them to offered values instead of casting, ignoring anything else.
  const selectMode = (value: string): void => {
    const next = availableModes.find((modeChoice) => modeChoice === value)
    if (next) setMode(next)
  }

  const selectFamily = (value: string): void => {
    const next = families.find((option) => option.family === value)
    if (next) setFamily(next.family)
  }

  return {
    family,
    mode,
    isSystem,
    resolvedMode,
    activeId,
    availableModes,
    families,
    setFamily,
    setMode,
    selectMode,
    selectFamily,
    mounted,
  }
}
