import '@corelive/live-editor/styles/settings.css'

import type { Metadata } from 'next'
import * as React from 'react'

/**
 * Settings Page
 *
 * The Dashboard settings page controls Appearance. CoreLive for Mac has its own
 * Settings window.
 *
 * @module app/settings/page
 */
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { SettingsBackButton } from '@/components/settings/SettingsBackButton'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Customize the appearance of CoreLive Dashboard.',
}

/**
 * Settings page component.
 *
 * @returns Settings page with the Appearance section
 */
const SettingsPage = function SettingsPage(): React.ReactNode {
  return (
    <div className="mx-auto h-full max-w-2xl">
      <SettingsBackButton />
      <div className="space-y-12 px-4 pb-12 pt-4 sm:px-6">
        <AppearanceSettings />
      </div>
    </div>
  )
}

export default SettingsPage
