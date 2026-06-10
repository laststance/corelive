'use client'

import { useTheme } from 'next-themes'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { DEFAULT_THEME_ID, isThemeId } from '@/lib/themes/registry'

/** next-themes' OS-follow sentinel — a valid stored choice, not a registry id. */
const SYSTEM_THEME = 'system'

/**
 * Resets a persisted theme that is neither `system` nor a registered id back to
 * the default. Exists because next-themes 0.4.6 writes localStorage verbatim and
 * never validates it (confirmed in its source), so a stale id (left after a
 * downgrade that dropped a colored family) or a tampered value can drive
 * `data-theme` to an unregistered id — which renders cathedral tokens but, for a
 * `*-dark` id, also fires the dark Tailwind variant: a broken light/dark hybrid.
 * Rendered once inside the provider; runs post-mount (the static root stays the
 * default pre-hydration), so it self-heals the rare bad value with no picker
 * interaction.
 * @returns null — renders nothing; its only job is the corrective side effect.
 * @example
 * // localStorage['corelive-theme'] === 'sunset-dark' (unregistered family)
 * // → after mount: setTheme('light') rewrites storage + data-theme
 */
export function ThemeAllowlistGuard(): null {
  const { theme, setTheme } = useTheme()

  useCycleEffect(() => {
    // Synchronize the persisted store: an unregistered, non-system value is stale
    // or tampered — rewrite it to the default so data-theme can never point at a
    // theme that has no CSS block.
    if (theme !== undefined && theme !== SYSTEM_THEME && !isThemeId(theme)) {
      setTheme(DEFAULT_THEME_ID)
    }
  }, [theme, setTheme])

  return null
}
