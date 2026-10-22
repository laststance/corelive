import type { Metadata } from 'next'
import * as React from 'react'

/**
 * Settings Page
 *
 * The single settings home across web and Electron (D15). Everyone sees the
 * shared Settings section; the Electron window-chrome settings render only
 * under the desktop app.
 *
 * @module app/settings/page
 */
import { ElectronSettingsPage } from '@/components/electron/ElectronSettingsPage'
import { SettingsBackButton } from '@/components/settings/SettingsBackButton'

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
      <div className="space-y-12 px-4 pb-12 pt-4 sm:px-6">
        <ElectronSettingsPage />
      </div>
    </div>
  )
}

export default SettingsPage
