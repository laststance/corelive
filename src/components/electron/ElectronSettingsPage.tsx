/**
 * Electron Settings Page Component
 *
 * A settings interface for Electron-specific preferences including
 * dock icon visibility, menu bar presence, and startup behavior.
 *
 * This component integrates with Redux for local state management
 * and communicates with the Electron main process via IPC.
 *
 * @module components/electron/ElectronSettingsPage
 *
 * @example
 * // In a page or modal
 * import { ElectronSettingsPage } from '@/components/electron/ElectronSettingsPage'
 *
 * <ElectronSettingsPage />
 */
'use client'

import { useIsElectron } from '@/components/auth/ElectronLoginForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  setHideAppIcon,
  setShowInMenuBar,
  setStartAtLogin,
  selectHideAppIcon,
  selectShowInMenuBar,
  selectStartAtLogin,
} from '@/lib/redux/slices/electronSettingsSlice'

/**
 * Electron Settings Page Component.
 *
 * Displays toggleable settings for Electron-specific features:
 * - Hide App Icon: Hides the app from the Dock
 * - Show in Menu Bar: Shows/hides the menu bar icon
 * - Start at Login: Launches the app on system startup
 *
 * This component is only accessible in Electron environment.
 * Web users will see a fallback message.
 *
 * State changes are persisted to localStorage via Redux and
 * communicated to the Electron main process via IPC.
 *
 * @returns Settings page with toggle switches, or fallback for web users
 */
export function ElectronSettingsPage(): React.ReactElement {
  const dispatch = useAppDispatch()
  const isElectron = useIsElectron() // SSR-safe via useSyncExternalStore

  // Redux selectors
  const hideAppIcon = useAppSelector(selectHideAppIcon)
  const showInMenuBar = useAppSelector(selectShowInMenuBar)
  const startAtLogin = useAppSelector(selectStartAtLogin)

  /**
   * Handles the Hide App Icon toggle change.
   * Updates Redux state and notifies Electron main process via settings API.
   *
   * @param checked - New toggle state
   */
  const handleHideAppIconChange = async (checked: boolean): Promise<void> => {
    dispatch(setHideAppIcon(checked))

    // Notify Electron main process via settings API
    if (typeof window !== 'undefined' && window.electronAPI?.settings) {
      try {
        await window.electronAPI.settings.setHideAppIcon(checked)
      } catch (error) {
        console.error('Failed to update dock icon visibility:', error)
      }
    }
  }

  /**
   * Handles the Show in Menu Bar toggle change.
   * Updates Redux state and notifies Electron main process via settings API.
   *
   * @param checked - New toggle state
   */
  const handleShowInMenuBarChange = async (checked: boolean): Promise<void> => {
    dispatch(setShowInMenuBar(checked))

    // Notify Electron main process via settings API
    if (typeof window !== 'undefined' && window.electronAPI?.settings) {
      try {
        await window.electronAPI.settings.setShowInMenuBar(checked)
      } catch (error) {
        console.error('Failed to update menu bar visibility:', error)
      }
    }
  }

  /**
   * Handles the Start at Login toggle change.
   * Updates Redux state and notifies Electron main process via settings API.
   *
   * @param checked - New toggle state
   */
  const handleStartAtLoginChange = async (checked: boolean): Promise<void> => {
    dispatch(setStartAtLogin(checked))

    // Notify Electron main process via settings API
    if (typeof window !== 'undefined' && window.electronAPI?.settings) {
      try {
        await window.electronAPI.settings.setStartAtLogin(checked)
      } catch (error) {
        console.error('Failed to update start at login setting:', error)
      }
    }
  }

  // Environment guard: Show fallback for web users
  if (!isElectron) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              These settings are only available in the desktop application.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Hide App Icon */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="hide-app-icon" className="text-base font-medium">
                Hide App Icon
              </Label>
              <p className="text-sm text-muted-foreground">
                Hide the CoreLive icon from the Dock
              </p>
            </div>
            <Switch
              id="hide-app-icon"
              checked={hideAppIcon}
              onCheckedChange={handleHideAppIconChange}
            />
          </div>

          {/* Show in Menu Bar - Not yet implemented */}
          <div className="flex items-center justify-between opacity-60">
            <div className="space-y-0.5">
              <Label
                htmlFor="show-in-menu-bar"
                className="text-base font-medium"
              >
                Show in Menu Bar{' '}
                <span className="text-xs text-muted-foreground">
                  (Coming Soon)
                </span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Display CoreLive in the system menu bar
              </p>
            </div>
            <Switch
              id="show-in-menu-bar"
              checked={showInMenuBar}
              onCheckedChange={handleShowInMenuBarChange}
              disabled
            />
          </div>

          {/* Start at Login */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="start-at-login" className="text-base font-medium">
                Start at Login
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically launch CoreLive when you log in
              </p>
            </div>
            <Switch
              id="start-at-login"
              checked={startAtLogin}
              onCheckedChange={handleStartAtLoginChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ElectronSettingsPage
