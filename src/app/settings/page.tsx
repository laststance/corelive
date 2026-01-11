/**
 * Settings Page (Electron Only)
 *
 * This page displays Electron-specific settings and is only
 * accessible when running in the Electron environment.
 * Web users attempting to access this route will be redirected.
 *
 * @module app/settings/page
 */
import type { Metadata } from 'next'

import { ElectronSettingsPage } from '@/components/electron/ElectronSettingsPage'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Electron application settings',
}

/**
 * Settings page component.
 *
 * Renders the ElectronSettingsPage component for Electron users.
 * The component itself handles checking for Electron environment.
 *
 * @returns Settings page
 */
export default function SettingsPage(): React.ReactNode {
  return <ElectronSettingsPage />
}
