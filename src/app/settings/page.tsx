import type { Metadata } from 'next'
import * as React from 'react'
import { memo } from 'react'

/**
 * Settings Page
 *
 * The single settings home across web and Electron (D15). Everyone sees the
 * shared Preferences section; the Electron window-chrome settings render only
 * under the desktop app (ElectronSettingsPage returns null on web).
 *
 * @module app/settings/page
 */
import { ElectronSettingsPage } from '@/components/electron/ElectronSettingsPage'
import { PreferencesSettings } from '@/components/settings/PreferencesSettings'
import { SettingsBackButton } from '@/components/settings/SettingsBackButton'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'CoreLive preferences and desktop application settings',
}

/**
 * Settings page component.
 *
 * Renders the web-common Preferences section for all users, followed by the
 * Electron-only window-chrome settings (which self-gate to the desktop app).
 *
 * @returns Settings page
 */
const SettingsPage = memo(function SettingsPage(): React.ReactNode {
  return (
    <div className="mx-auto h-full max-w-2xl">
      {/* Standalone /settings has no sidebar; this is the only way back
          (essential in Electron, which has no browser chrome). */}
      <SettingsBackButton />
      <PreferencesSettings />
      <ElectronSettingsPage />
    </div>
  )
})

export default SettingsPage
