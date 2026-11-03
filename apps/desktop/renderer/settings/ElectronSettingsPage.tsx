import { Button } from '@corelive/live-editor/ui/button'
import { Label } from '@corelive/live-editor/ui/label'
import { ThemeSelector } from '@corelive/live-editor/ui/ThemeSelector'
import { useTransition } from 'react'

import { AppUpdateSettings } from './AppUpdateSettings'
import { LiveEditorAppearance } from './LiveEditorAppearance'
import { LiveEditorSettings } from './LiveEditorSettings'
import { LiveEditorStatusSetting } from './LiveEditorStatusSetting'
import { NativeSwitchRow } from './NativeSwitchRow'
import { OfflineCategoryManagement } from './OfflineCategoryManagement'
import {
  LIVE_EDITOR_PIN_SETTING,
  PanelToggle,
  VISIBLE_ON_ALL_WORKSPACES_SETTING,
} from './PanelToggle'
import { SettingsSection } from './SettingsSection'
import { ShortcutOpeningSoundSetting } from './ShortcutOpeningSoundSetting'
import { TodayEmberSetting } from './TodayEmberSetting'
import { useThemePersistence } from './useThemePersistence'

/**
 * Reads the confirmed "hide app icon" value from config.json (#112).
 * @returns Whether the Dock icon is hidden.
 */
const loadHideAppIcon = async (): Promise<boolean> =>
  (await window.settingsAPI?.config.get('behavior.hideAppIcon', false)) === true

/** Applies and persists "hide app icon" through main. */
const saveHideAppIcon = async (hide: boolean): Promise<boolean> =>
  (await window.settingsAPI?.settings.setHideAppIcon(hide)) ?? false

/**
 * Reads the confirmed "show in menu bar" value; the key defaults to visible (#216 D5).
 * @returns Whether the tray icon is shown.
 */
const loadShowInMenuBar = async (): Promise<boolean> =>
  (await window.settingsAPI?.config.get('behavior.showInMenuBar', true)) !==
  false

/** Applies and persists "show in menu bar" through main. */
const saveShowInMenuBar = async (show: boolean): Promise<boolean> =>
  (await window.settingsAPI?.settings.setShowInMenuBar(show)) ?? false

/** Reads the macOS login item, the single source of truth for start at login. */
const loadStartAtLogin = async (): Promise<boolean> =>
  (await window.settingsAPI?.settings.getLoginItemSettings())?.openAtLogin ===
  true

/** Applies "start at login" to the macOS login item. */
const saveStartAtLogin = async (enabled: boolean): Promise<boolean> =>
  (await window.settingsAPI?.settings.setStartAtLogin(enabled)) ?? false

/**
 * The bundled Settings window's page (#216 D5, DA1).
 *
 * Sections, in order: LiveEditor, Appearance, Shortcuts & Sound, Application, Categories,
 * Updates (Account comes last and is added with the Account section in the follow-up step).
 * Every control talks to main through `window.settingsAPI`; there is no Redux, no next-themes
 * and no network. Mounted by `renderer/settings/main.tsx` inside {@link SettingsProvider}.
 *
 * @returns The single-column Settings page.
 * @example
 * <SettingsProvider api={api}><ElectronSettingsPage /></SettingsProvider>
 */
export const ElectronSettingsPage = function ElectronSettingsPage() {
  const themePersistence = useThemePersistence()
  const [isResettingPopoverSize, startResetSizeTransition] = useTransition()

  /** Resets the Settings popover to 360×380 via IPC. */
  const handleResetPopoverSize = (): void => {
    startResetSizeTransition(async () => {
      await window.settingsAPI?.settings.resetPopoverSize()
    })
  }

  // The Spaces toggle only applies on macOS.
  const isMac = window.settingsAPI?.platform === 'darwin'

  return (
    <LiveEditorSettings>
      {({ opacity, shortcuts, config }) => (
        <>
          <SettingsSection label="LiveEditor">
            <LiveEditorStatusSetting />
            <TodayEmberSetting />
            <LiveEditorAppearance />
            {opacity}
            <PanelToggle
              setting={LIVE_EDITOR_PIN_SETTING}
              label="Keep on top"
              description="Pin LiveEditor above your other windows so it stays visible."
            />
          </SettingsSection>
          <SettingsSection label="Appearance">
            <ThemeSelector persistence={themePersistence} />
          </SettingsSection>
          <SettingsSection label="Shortcuts & Sound">
            {shortcuts}
            <ShortcutOpeningSoundSetting />
          </SettingsSection>

          {/* APPLICATION — dock, menu bar and login presence, Spaces, and the window size. */}
          <SettingsSection label="Application">
            <NativeSwitchRow
              id="hide-app-icon"
              label="Hide App Icon"
              description="Hide the CoreLive icon from the Dock"
              defaultValue={false}
              load={loadHideAppIcon}
              save={saveHideAppIcon}
            />
            <NativeSwitchRow
              id="show-in-menu-bar"
              label="Show in Menu Bar"
              description="Display CoreLive in the system menu bar"
              defaultValue
              load={loadShowInMenuBar}
              save={saveShowInMenuBar}
            />
            <NativeSwitchRow
              id="start-at-login"
              label="Start at Login"
              description="Automatically launch CoreLive when you log in"
              defaultValue={false}
              load={loadStartAtLogin}
              save={saveStartAtLogin}
            />
            <PanelToggle
              setting={VISIBLE_ON_ALL_WORKSPACES_SETTING}
              label="Show on all desktops"
              description="Keep LiveEditor visible while switching Spaces, including fullscreen Spaces."
              disabled={!isMac}
              note={
                !isMac && (
                  <p className="type-small leading-5 text-muted-foreground">
                    This option only applies on macOS.
                  </p>
                )
              }
            />
            <div className="settings-action-row flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <Label className="settings-label">Window size</Label>
                <p className="type-small leading-5 text-muted-foreground">
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
            {config}
          </SettingsSection>

          <SettingsSection label="Categories">
            <OfflineCategoryManagement />
          </SettingsSection>

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
      )}
    </LiveEditorSettings>
  )
}
