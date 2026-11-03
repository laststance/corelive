import * as React from 'react'

/**
 * Section-heading class using the DESIGN.md 18px semibold tier. `text-foreground` keeps the section `<h2>` the
 * strongest caption on the page, so the hierarchy reads Section `<h2>` ＞ row.
 */
const SETTINGS_SECTION_LABEL_CLASS = 'type-h3 leading-7 text-foreground'

/**
 * Turns a human label into a stable DOM id (hook-free, so this wrapper renders in
 * BOTH the server `page.tsx` and client `ElectronSettingsPage` without a `useId`
 * client boundary). "LiveEditor" → "settings-section-live-editor".
 *
 * @param label - The section's display label.
 * @returns A slugified `settings-section-*` id.
 * @example
 * slugifySectionId('Application') // => 'settings-section-application'
 */
function slugifySectionId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `settings-section-${slug}`
}

/**
 * Presentational settings-section wrapper — a readable `<h2>` landmark over its
 * content, giving the now-headered /settings page screen-reader landmark navigation
 * for free (`<section aria-labelledby>`). Replaces the old per-card `CardTitle text-lg`
 * (design-review D1 flatten). Hook-free on purpose so it composes into the server
 * settings page and the client Electron page alike.
 *
 * @param label - Section heading text.
 * @param children - The section's controls/cards.
 * @param id - Optional explicit id for the `<h2>`/`aria-labelledby` pair; defaults to a slug of `label`.
 * @param headingRef - Optional ref to the `<h2>`; the heading is programmatically focusable (`tabIndex=-1`).
 * @returns A labelled `<section>` landmark.
 * @example
 * <SettingsSection label="Tasks"><TaskSettings /></SettingsSection>
 */
export const SettingsSection = function SettingsSection({
  label,
  children,
  id,
  headingRef,
}: {
  label: string
  children: React.ReactNode
  id?: string
  /** Lets a caller move focus to the heading (DA14: focus returns to the Account heading). */
  headingRef?: React.Ref<HTMLHeadingElement>
}): React.ReactNode {
  const headingId = id ?? slugifySectionId(label)
  return (
    <section aria-labelledby={headingId} className="settings-section space-y-6">
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className={`${SETTINGS_SECTION_LABEL_CLASS} outline-none`}
      >
        {label}
      </h2>
      {children}
    </section>
  )
}
