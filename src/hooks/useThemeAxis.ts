'use client'

import { useTheme } from 'next-themes'

import { useMounted } from '@/hooks/use-mounted'
import {
  DEFAULT_THEME_ID,
  getThemeId,
  getThemeMode,
  isThemeId,
  THEME_FAMILY_IDS,
  THEME_FAMILY_LABEL,
  THEME_REGISTRY,
} from '@/lib/themes/registry'
import type { ThemeFamilyId, ThemeId, ThemeMode } from '@/lib/themes/registry'

/** Mode axis of the picker: the two real modes plus the OS-managed "system". */
export type ThemeModeChoice = ThemeMode | 'system'

/** Every mode-axis choice — the complete key set for stable handler maps. */
export const THEME_MODE_CHOICES: ThemeModeChoice[] = ['light', 'dark', 'system']

/** One option on the family axis — a family id with its display label. */
export interface ThemeFamilyOption {
  family: ThemeFamilyId
  label: string
}

/** State + actions for the two-axis (family × mode) theme picker. */
export interface ThemeAxis {
  /** The active family (Warm Cathedral while on System — System maps to it). */
  family: ThemeFamilyId
  /** The active mode for the mode axis: `light` / `dark` / `system`. */
  mode: ThemeModeChoice
  /** True when the OS-managed System theme is selected. */
  isSystem: boolean
  /** The concrete light/dark actually applied (System → the OS preference). */
  resolvedMode: ThemeMode
  /** The concrete theme id currently applied (e.g. `harbor-dark`). */
  activeId: ThemeId
  /** Modes offered for the active family — only Warm Cathedral exposes System. */
  availableModes: ThemeModeChoice[]
  /** Every family, default-first, for the family axis. */
  families: ThemeFamilyOption[]
  /** Switch family, keeping the current mode (System → that family, explicit). */
  setFamily: (family: ThemeFamilyId) => void
  /** Switch mode, keeping the current family (System → Warm Cathedral). */
  setMode: (mode: ThemeModeChoice) => void
  /** False until mounted — render a disabled/placeholder state until then. */
  mounted: boolean
}

/**
 * Drives the two-axis theme picker (Settings page + sidebar quick-switch), turning
 * next-themes' single stored id into an independent (family, mode) selection and
 * back. Encapsulates the Fork-A System rule (decided in the design gate): System
 * is OS-managed and maps ONLY to the default Warm Cathedral light/dark pair, so
 * colored families never expose System and choosing System resets to the default.
 * @returns the {@link ThemeAxis} state and `setFamily`/`setMode` actions.
 * @example
 * const { family, mode, setFamily, setMode, families } = useThemeAxis()
 * setFamily('harbor') // → 'harbor-light' or 'harbor-dark', preserving the mode
 * setMode('system')   // → OS-managed Warm Cathedral
 */
export function useThemeAxis(): ThemeAxis {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()

  const isSystem = theme === 'system'
  // While on System next-themes resolves to the flat light/dark (cathedral) id;
  // otherwise the stored id is the concrete theme. Guard stale/undefined values.
  const rawActiveId = isSystem ? resolvedTheme : theme
  const activeId: ThemeId = isThemeId(rawActiveId)
    ? rawActiveId
    : DEFAULT_THEME_ID

  const family = THEME_REGISTRY[activeId].family
  const resolvedMode = getThemeMode(activeId)
  const mode: ThemeModeChoice = isSystem ? 'system' : resolvedMode

  // Only the default family is OS-managed; colored families are explicit choices.
  const availableModes: ThemeModeChoice[] =
    family === 'cathedral' ? ['light', 'dark', 'system'] : ['light', 'dark']

  const families = THEME_FAMILY_IDS.map((familyId) => ({
    family: familyId,
    label: THEME_FAMILY_LABEL[familyId],
  }))

  const setFamily = (nextFamily: ThemeFamilyId): void => {
    // Re-picking the default while on System keeps the OS-managed pairing.
    if (nextFamily === 'cathedral' && isSystem) {
      setTheme('system')
      return
    }
    // Any other pick collapses System to an explicit id at the resolved mode.
    setTheme(getThemeId(nextFamily, resolvedMode))
  }

  const setMode = (nextMode: ThemeModeChoice): void => {
    // System is OS-managed and family-agnostic → the default Warm Cathedral pair.
    if (nextMode === 'system') {
      setTheme('system')
      return
    }
    setTheme(getThemeId(family, nextMode))
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
    mounted,
  }
}
