'use client'

import { useTheme } from 'next-themes'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { log } from '@/lib/logger'
import { normalizeThemePreference } from '@/lib/themes/registry'

/**
 * Rewrites a persisted theme that is not already in its normalized form: a legacy
 * `default-*` alias becomes `light`/`dark`, and an unknown value becomes `system`.
 * Exists because next-themes 0.4.6 writes localStorage verbatim and never
 * validates it (confirmed in its source), so a stale id (left after a downgrade
 * that dropped a colored family) or a tampered value can drive `data-theme` to an
 * unregistered id, which has no token block but, for a `*-dark` id, still fires
 * the dark Tailwind variant: a broken light/dark hybrid. Rendered once inside the
 * provider; runs post-mount, so it self-heals with no picker interaction.
 * @returns null: renders nothing; its only job is the corrective side effect.
 * @example
 * // localStorage['corelive-theme'] === 'sunset-dark' (unregistered family)
 * // → after mount: setTheme('system') rewrites storage + data-theme
 * // localStorage['corelive-theme'] === 'default-dark' → setTheme('dark')
 */
export function ThemeAllowlistGuard(): null {
  const { theme, setTheme } = useTheme()

  useCycleEffect(() => {
    // Not hydrated yet: nothing stored to judge.
    if (theme === undefined) return
    const normalizedTheme = normalizeThemePreference(theme)
    // Already normalized (registered id or 'system'): a real choice is never clobbered.
    if (normalizedTheme === theme) return
    // Legacy alias or unknown value: rewrite storage so data-theme always has a CSS block.
    log.debug('[theme] rewriting stored theme', {
      storedTheme: theme,
      healedTheme: normalizedTheme,
    })
    setTheme(normalizedTheme)
  }, [theme, setTheme])

  return null
}
