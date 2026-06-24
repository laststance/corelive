import * as React from 'react'

/**
 * Caption-tier section-label class (DESIGN.md Caption token): 12px Inter Tight 500,
 * uppercase, 0.05em tracking. `text-foreground` keeps the section `<h2>` one step
 * STRONGER than the muted in-section sub-group captions (e.g. "On launch"), so the
 * hierarchy reads Section `<h2>` ＞ sub-group caption ＞ row. Pairs with
 * {@link SETTINGS_SUBGROUP_LABEL_CLASS}, which is the same token but muted.
 */
export const SETTINGS_SECTION_LABEL_CLASS =
  'text-xs font-medium uppercase tracking-[0.05em] text-foreground'

/**
 * Sub-group caption class — the same Caption token as {@link SETTINGS_SECTION_LABEL_CLASS}
 * but `text-muted-foreground`, so a labelled group nested inside a section (the
 * "On launch" toggles within Application) sits one tier BELOW the section `<h2>`.
 * Used for the lone in-section sub-caption left after the regroup dissolved the
 * old shared "Keep on top" group into per-section single pins.
 */
export const SETTINGS_SUBGROUP_LABEL_CLASS =
  'text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground'

/**
 * Turns a human label into a stable DOM id (hook-free, so this wrapper renders in
 * BOTH the server `page.tsx` and client `ElectronSettingsPage` without a `useId`
 * client boundary). "Brain Dump" → "settings-section-brain-dump".
 *
 * @param label - The section's display label.
 * @returns A slugified `settings-section-*` id.
 * @example
 * slugifySectionId('Floating Navigator') // => 'settings-section-floating-navigator'
 */
function slugifySectionId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `settings-section-${slug}`
}

/**
 * Presentational settings-section wrapper — a Caption-style `<h2>` landmark over its
 * content, giving the now-headered /settings page screen-reader landmark navigation
 * for free (`<section aria-labelledby>`). Replaces the old per-card `CardTitle text-lg`
 * (design-review D1 flatten). Hook-free on purpose so it composes into the server
 * settings page and the client Electron page alike.
 *
 * @param label - Section heading text (rendered uppercase via the Caption token).
 * @param children - The section's controls/cards.
 * @param id - Optional explicit id for the `<h2>`/`aria-labelledby` pair; defaults to a slug of `label`.
 * @returns A labelled `<section>` landmark.
 * @example
 * <SettingsSection label="Sound"><SoundPreferences /></SettingsSection>
 */
export const SettingsSection = function SettingsSection({
  label,
  children,
  id,
}: {
  label: string
  children: React.ReactNode
  id?: string
}): React.ReactNode {
  const headingId = id ?? slugifySectionId(label)
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className={SETTINGS_SECTION_LABEL_CLASS}>
        {label}
      </h2>
      {children}
    </section>
  )
}

export default SettingsSection
