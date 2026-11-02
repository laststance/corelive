'use client'

import { useEffect } from 'react'

import { THEME_CROSSFADE_DURATION_MS } from './themeConstants'

/** Transient class globals.css keys the crossfade off; present only mid-switch. */
const THEME_TRANSITION_CLASS = 'theme-transition'

/**
 * Sets `data-theme` on `<html>` with the crossfade class already present, so the
 * switch animates even when a later layout effect forces a style flush before
 * {@link ThemeTransition}'s MutationObserver callback runs.
 *
 * The desktop editor applies its theme inside a layout effect; sibling layout
 * effects (strike geometry, caret measurement) read layout in the same commit, so
 * the new palette would otherwise be computed without the transition and snap.
 * The observer still owns removal: it re-adds the class and arms its timer on the
 * resulting attribute mutation. The first paint (no current theme) and a no-op
 * write (same id) never add the class, so hover/focus stay instant.
 *
 * @param themeId - The concrete `data-theme` value to apply (a registry id, never `system`).
 * @example
 * applyThemeAttribute('cathedral-light') // crossfades from the current theme when one is set
 */
export function applyThemeAttribute(themeId: string): void {
  const htmlElement = document.documentElement
  const currentThemeId = htmlElement.dataset.theme
  // Only a real switch from an existing theme crossfades.
  if (currentThemeId !== undefined && currentThemeId !== themeId) {
    htmlElement.classList.add(THEME_TRANSITION_CLASS)
  }
  htmlElement.dataset.theme = themeId
}

/**
 * Adds a transient `theme-transition` class to <html> for one crossfade window
 * whenever the active theme changes, so globals.css animates colors across the
 * whole UI ONLY during a switch (never on hover/focus). Mounted once by
 * the web ThemeProvider and bundled renderer; watches their `data-theme` attribute via MutationObserver.
 * @returns null — side-effect-only component, renders nothing.
 * @example
 * // In ThemeProvider, alongside the allowlist guard:
 * <ThemeTransition />
 */
export function ThemeTransition(): null {
  // External DOM subscription (MutationObserver on <html>), not derived React
  // state — a mount effect with cleanup is the right tool. It is deliberately
  // NOT useSyncExternalStore: nothing here is read into render.
  useEffect(() => {
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

    return (): void => {
      themeChangeObserver.disconnect()
      if (removeClassTimer !== undefined) clearTimeout(removeClassTimer)
      htmlElement.classList.remove(THEME_TRANSITION_CLASS)
    }
  }, [])

  return null
}
