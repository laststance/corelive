import * as React from 'react'

import {
  useSettingsSectionVisible,
  type SettingsSectionName,
} from './SettingsNavigation'

/** Gives each section heading a stable accessible name target.
 * @example slugifySectionId('LiveEditor') // 'settings-section-liveeditor'
 */
function slugifySectionId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `settings-section-${slug}`
}

/**
 * Keeps a Settings pane mounted while the menu shows another section, preserving pending edits.
 * The menu displays the active name. Its matching heading labels the region and receives
 * focus when returning from Sync details.
 *
 * @example
 * <SettingsSection label="Application">{controls}</SettingsSection>
 */
export const SettingsSection = function SettingsSection({
  label,
  children,
  id,
  headingRef,
}: {
  label: SettingsSectionName
  children: React.ReactNode
  id?: string
  /** Lets a caller move focus to the heading (DA14: focus returns to the Account heading). */
  headingRef?: React.Ref<HTMLHeadingElement>
}): React.ReactNode {
  const visible = useSettingsSectionVisible(label)
  const headingId = id ?? slugifySectionId(label)
  return (
    <section
      hidden={!visible}
      aria-labelledby={headingId}
      className="settings-section space-y-6"
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="sr-only focus:not-sr-only focus:mb-4 focus:font-semibold"
      >
        {label}
      </h2>
      {children}
    </section>
  )
}
