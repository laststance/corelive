import type { Metadata } from 'next'
import * as React from 'react'

/**
 * Settings Page
 *
 * The single settings home across web and Electron (D15). Everyone sees the
 * shared Settings section; the Electron window-chrome settings render only
 * under the desktop app (ElectronSettingsPage returns null on web).
 *
 * @module app/settings/page
 */
import { ElectronSettingsPage } from '@/components/electron/ElectronSettingsPage'
import { SettingsBackButton } from '@/components/settings/SettingsBackButton'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SoundSettings } from '@/components/settings/SoundSettings'
import { TaskSettings } from '@/components/settings/TaskSettings'
import { ThemeSelector } from '@/components/ThemeSelector'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'CoreLive and desktop app settings',
}

/**
 * Settings page component.
 *
 * Renders the web-common Settings section for all users, followed by the
 * Electron-only window-chrome settings (which self-gate to the desktop app).
 *
 * @returns Settings page
 */
const SettingsPage = function SettingsPage(): React.ReactNode {
  return (
    <div className="mx-auto h-full max-w-2xl">
      {/* Standalone /settings has no sidebar; this is the only way back
           (essential in Electron, which has no browser chrome). */}
      <SettingsBackButton />
      {/* Concern-based sections, web-common first. 48px (space-y-12) between
           sections per DESIGN.md. Only the 3 web-common headers live here;
           ElectronSettingsPage appends its own Electron sections (or renders
           nothing on web) — keeping Electron labels out of this server page
           avoids orphaned headers with no content under them on web. */}
      <div className="space-y-12 px-4 pb-12 pt-2">
        <SettingsSection label="Tasks">
          <TaskSettings />
        </SettingsSection>
        <SettingsSection label="Sound">
          <SoundSettings />
        </SettingsSection>
        <SettingsSection label="Appearance">
          <ThemeSelector />
        </SettingsSection>
        <ElectronSettingsPage />
      </div>
    </div>
  )
}

export default SettingsPage
