'use client'

import { ThemeSelector } from '@corelive/live-editor/ui/ThemeSelector'
import type { ReactElement } from 'react'

import { useNextThemesPersistence } from '@/hooks/useThemeAxis'

/**
 * The web dashboard's only Settings section: the dashboard theme.
 *
 * Desktop preferences (LiveEditor, shortcuts, application, categories, updates, account) live in
 * the bundled Settings window since #216 D5, so `/settings` keeps just Appearance. Rendered by the
 * `/settings` page.
 *
 * @returns A labelled Appearance `<section>` driving the shared picker through next-themes.
 * @example
 * <AppearanceSettings />
 */
export function AppearanceSettings(): ReactElement {
  const themePersistence = useNextThemesPersistence()
  return (
    <section
      aria-labelledby="settings-section-appearance"
      className="settings-section space-y-6"
    >
      <h2
        id="settings-section-appearance"
        className="type-h3 leading-7 text-foreground"
      >
        Appearance
      </h2>
      <ThemeSelector persistence={themePersistence} />
    </section>
  )
}
