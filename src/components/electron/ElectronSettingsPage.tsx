'use client'

import * as React from 'react'
import { useTransition } from 'react'

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
import { useIsElectron } from '@/components/auth/ElectronLoginForm'
import { AppUpdateSettings } from '@/components/electron/AppUpdateSettings'
import { BrainDumpAppearance } from '@/components/electron/BrainDumpAppearance'
import { BrainDumpSettings } from '@/components/electron/BrainDumpSettings'
import { FloatingNavigatorSettings } from '@/components/electron/FloatingNavigatorSettings'
import {
  BRAIN_DUMP_PIN_PREFERENCE,
  FloatingPanelToggle,
  VISIBLE_ON_ALL_WORKSPACES_PREFERENCE,
} from '@/components/electron/FloatingPanelToggle'
import { StartupWindowSettings } from '@/components/electron/StartupWindowSettings'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
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
export const ElectronSettingsPage =
  function ElectronSettingsPage(): React.ReactElement | null {
    const dispatch = useAppDispatch()
    const isElectron = useIsElectron() // SSR-safe via useSyncExternalStore

    const [isResettingPopoverSize, startResetSizeTransition] = useTransition()

    // Redux selectors
    const hideAppIcon = useAppSelector(selectHideAppIcon)
    const showInMenuBar = useAppSelector(selectShowInMenuBar)
    const startAtLogin = useAppSelector(selectStartAtLogin)

    /**
     * Handles the Hide App Icon toggle change.
     * Updates Redux state only after successful IPC call to maintain consistency.
     *
     * @param checked - New toggle state
     */
    const handleHideAppIconChange = async (checked: boolean): Promise<void> => {
      // Notify Electron main process via settings API first
      if (typeof window !== 'undefined' && window.electronAPI?.settings) {
        try {
          const success =
            await window.electronAPI.settings.setHideAppIcon(checked)
          if (success) {
            dispatch(setHideAppIcon(checked))
          } else {
            // IPC call failed - log error but don't update state
            if (process.env.NODE_ENV === 'development') {
              console.error(
                'Failed to update dock icon visibility: IPC returned false',
              )
            }
          }
        } catch (error) {
          // IPC call threw - log error but don't update state
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to update dock icon visibility:', error)
          }
        }
      } else {
        // Not in Electron - update Redux state anyway for local storage
        dispatch(setHideAppIcon(checked))
      }
    }

    /**
     * Handles the Show in Menu Bar toggle change.
     * Updates Redux state only after successful IPC call to maintain consistency.
     *
     * @param checked - New toggle state
     */
    const handleShowInMenuBarChange = async (
      checked: boolean,
    ): Promise<void> => {
      // Notify Electron main process via settings API first
      if (typeof window !== 'undefined' && window.electronAPI?.settings) {
        try {
          const success =
            await window.electronAPI.settings.setShowInMenuBar(checked)
          if (success) {
            dispatch(setShowInMenuBar(checked))
          } else {
            // IPC returned false: the tray could not be created (e.g.
            // createTray failed), so don't persist a "shown" state that
            // never actually appeared. ElectronStartupSync re-pushes the
            // persisted value at next launch, keeping the toggle truthful.
            if (process.env.NODE_ENV === 'development') {
              console.error(
                'Failed to update menu bar visibility: IPC returned false',
              )
            }
          }
        } catch (error) {
          // IPC call threw - log error but don't update state
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to update menu bar visibility:', error)
          }
        }
      } else {
        // Not in Electron - update Redux state anyway for local storage
        dispatch(setShowInMenuBar(checked))
      }
    }

    /**
     * Handles the Start at Login toggle change.
     * Updates Redux state only after successful IPC call to maintain consistency.
     *
     * @param checked - New toggle state
     */
    const handleStartAtLoginChange = async (
      checked: boolean,
    ): Promise<void> => {
      // Notify Electron main process via settings API first
      if (typeof window !== 'undefined' && window.electronAPI?.settings) {
        try {
          const success =
            await window.electronAPI.settings.setStartAtLogin(checked)
          if (success) {
            dispatch(setStartAtLogin(checked))
          } else {
            // IPC call failed - log error but don't update state
            if (process.env.NODE_ENV === 'development') {
              console.error(
                'Failed to update start at login setting: IPC returned false',
              )
            }
          }
        } catch (error) {
          // IPC call threw - log error but don't update state
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to update start at login setting:', error)
          }
        }
      } else {
        // Not in Electron - update Redux state anyway for local storage
        dispatch(setStartAtLogin(checked))
      }
    }

    /**
     * Resets the Settings popover to 360×380 via IPC. Guards on method existence
     * so older preloads (version-skew) do not throw.
     */
    const handleResetPopoverSize = () => {
      const resetFn = window.electronAPI?.settings?.resetPopoverSize
      if (!resetFn) return
      startResetSizeTransition(async () => {
        const success = await resetFn()
        if (!success) {
          if (process.env.NODE_ENV === 'development') {
            console.error(
              'Failed to reset Settings popover size: IPC returned false',
            )
          }
        }
      })
    }

    // Web users see the shared Preferences section (rendered by the settings
    // page); the Electron window-chrome settings below are desktop-only, so
    // render nothing here off-Electron (D15 — one settings home, prefs for all).
    if (!isElectron) {
      return null
    }

    // Electron is macOS-only in production, but keep the defensive guard the old
    // Floating windows card carried: the Spaces toggle only applies on macOS.
    const platform =
      typeof window === 'undefined' ? undefined : window.electronEnv?.platform
    const isMac = !platform || platform === 'darwin'

    return (
      // A fragment, NOT a wrapper div: these Electron sections become direct
      // siblings of the web-common sections in page.tsx's `space-y-12` flow, so
      // all seven settings sections share one 48px rhythm (DESIGN.md 2xl).
      <>
        {/* BRAIN DUMP — note behavior, look-and-feel, and its keep-on-top pin.
            Three independent siblings (advisor): the note card degrades on the
            `brainDump` preload, the appearance is pure Redux, and the pin lives
            on `floatingPanels` — nesting the pin in the card would let a stale
            `brainDump` preload hide a working pin. */}
        <SettingsSection label="Brain Dump">
          <BrainDumpSettings />
          <BrainDumpAppearance />
          <FloatingPanelToggle
            preference={BRAIN_DUMP_PIN_PREFERENCE}
            label="Keep on top"
            description="Pin Brain Dump above your other windows so it stays visible."
          />
        </SettingsSection>

        {/* FLOATING NAVIGATOR — Floating-Navigator-only behavior. */}
        <SettingsSection label="Floating Navigator">
          <FloatingNavigatorSettings />
        </SettingsSection>

        {/* APPLICATION — app-wide chrome: dock/menu-bar/login presence, the
            on-launch sub-group, the shared Spaces toggle, and the Settings
            window size (folded from its old standalone card, DR-D2). */}
        <SettingsSection label="Application">
          {/* Hide App Icon */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="hide-app-icon" className="text-sm font-medium">
                Hide App Icon
              </Label>
              <p className="text-xs text-muted-foreground">
                Hide the CoreLive icon from the Dock
              </p>
            </div>
            <Switch
              id="hide-app-icon"
              checked={hideAppIcon}
              onCheckedChange={handleHideAppIconChange}
            />
          </div>

          {/*
           Show in Menu Bar — the IPC handler shows/hides the tray live
           (SystemTrayManager.setMenuBarVisible), and ElectronStartupSync
           re-pushes the persisted value at every launch so an "off" choice
           survives restarts (boot creates the tray, then the startup sync
           hides it — same correct-after-boot pattern as Hide App Icon).
          */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-in-menu-bar" className="text-sm font-medium">
                Show in Menu Bar
              </Label>
              <p className="text-xs text-muted-foreground">
                Display CoreLive in the system menu bar
              </p>
            </div>
            <Switch
              id="show-in-menu-bar"
              checked={showInMenuBar}
              onCheckedChange={handleShowInMenuBarChange}
            />
          </div>

          {/* Start at Login */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="start-at-login" className="text-sm font-medium">
                Start at Login
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically launch CoreLive when you log in
              </p>
            </div>
            <Switch
              id="start-at-login"
              checked={startAtLogin}
              onCheckedChange={handleStartAtLoginChange}
            />
          </div>

          {/* On launch — sub-group (StartupWindowSettings renders its own caption). */}
          <StartupWindowSettings />

          {/* Show on all desktops — one OS-level flag shared by both panels,
              relocated here from the retired Floating windows card. */}
          <FloatingPanelToggle
            preference={VISIBLE_ON_ALL_WORKSPACES_PREFERENCE}
            label="Show on all desktops"
            description="Keep CoreLive's panels visible while switching Spaces, including fullscreen Spaces."
            disabled={!isMac}
            note={
              !isMac && (
                <p className="text-xs text-muted-foreground">
                  This option only applies on macOS.
                </p>
              )
            }
          />

          {/* Settings window size — folded in from its own "Settings Window" card. */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Window size</Label>
              <p className="text-xs text-muted-foreground">
                Drag the window edge to resize. Default: 360×380.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isResettingPopoverSize}
              onClick={handleResetPopoverSize}
            >
              Restore default size
            </Button>
          </div>
        </SettingsSection>

        {/* UPDATES */}
        <SettingsSection label="Updates">
          <AppUpdateSettings />
        </SettingsSection>

        {/* Visible resize grip — pointer-events:none so native edge resize still works */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed bottom-1 right-1 h-4 w-4 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '3px 3px',
          }}
        />
      </>
    )
  }

export default ElectronSettingsPage
