'use client'

import { useInitialEffect } from '@/hooks/use-initial-effect'
import { THEME_CROSSFADE_DURATION_MS } from '@/lib/constants/theme'

/** Transient class globals.css keys the crossfade off; present only mid-switch. */
const THEME_TRANSITION_CLASS = 'theme-transition'

/**
 * Adds a transient `theme-transition` class to <html> for one crossfade window
 * whenever the active theme changes, so globals.css animates colors across the
 * whole UI ONLY during a switch (never on hover/focus). Mounted once by
 * ThemeProvider; watches next-themes' `data-theme` attribute via MutationObserver.
 * @returns null — side-effect-only component, renders nothing.
 * @example
 * // In ThemeProvider, alongside the allowlist guard:
 * <ThemeTransition />
 */
export function ThemeTransition(): null {
  // External DOM subscription (MutationObserver on <html>), not derived React
  // state — a mount effect with cleanup is the right tool. It is deliberately
  // NOT useSyncExternalStore: nothing here is read into render.
  useInitialEffect(() => {
    const htmlElement = document.documentElement
    let removeClassTimer: ReturnType<typeof setTimeout> | undefined

    // next-themes flips data-theme on <html>; mirror each flip into a short-lived
    // class so the crossfade runs once per switch and then gets out of the way.
    const themeChangeObserver = new MutationObserver(() => {
      htmlElement.classList.add(THEME_TRANSITION_CLASS)
      // Restart the window on rapid successive switches.
      if (removeClassTimer !== undefined) clearTimeout(removeClassTimer)
      // Drop the class the moment the fade completes so hover/focus stay instant.
      removeClassTimer = setTimeout(() => {
        htmlElement.classList.remove(THEME_TRANSITION_CLASS)
      }, THEME_CROSSFADE_DURATION_MS)
    })

    // Connected AFTER mount, so the initial hydration data-theme never crossfades.
    themeChangeObserver.observe(htmlElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => {
      themeChangeObserver.disconnect()
      if (removeClassTimer !== undefined) clearTimeout(removeClassTimer)
      htmlElement.classList.remove(THEME_TRANSITION_CLASS)
    }
  })

  return null
}
