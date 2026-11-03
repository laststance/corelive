/**
 * @fileoverview Sandboxed preload of the bundled Settings window (#216 D5).
 *
 * Exposes `window.settingsAPI`: only named capabilities, no generic IPC, no token, no remote
 * URL and no filesystem path. Loaded exclusively by the Settings window at
 * `corelive-editor://app/settings.html`; any other document receives nothing. Built as one
 * dependency-free file (see `scripts/build-offline-preloads.mjs`) so it runs under `sandbox: true`.
 *
 * @module electron/preload-settings
 */

import {
  SHORTCUT_OPEN_SOUND_CONFIG_PATH,
  SHORTCUT_OPEN_SOUND_SELECTION_CONFIG_PATH,
} from '@corelive/desktop-contract/constants'
import type { SettingsWindowAPI } from '@corelive/desktop-contract/offline-editor-api'
import { contextBridge } from 'electron'

import { subscribeToMain } from './ipc/subscribeToMain'
import { typedInvoke } from './ipc/typedInvoke'
import { isLocalSettingsDocument } from './offline/localEditorOrigin'

/** Config paths the Settings window may read or write; every other path is refused in the preload. */
const SETTINGS_CONFIG_PATHS: ReadonlySet<string> = new Set([
  SHORTCUT_OPEN_SOUND_CONFIG_PATH,
  SHORTCUT_OPEN_SOUND_SELECTION_CONFIG_PATH,
  'behavior.hideAppIcon',
  'behavior.showInMenuBar',
])

/**
 * Refuses a config path outside the Settings allowlist.
 * @param path - Dot-notation config path requested by the renderer.
 * @returns The same path when allowed.
 * @throws When the path is not one of the Settings paths.
 * @example assertSettingsConfigPath('behavior.hideAppIcon')
 */
function assertSettingsConfigPath(path: string): string {
  if (!SETTINGS_CONFIG_PATHS.has(path))
    throw new Error('Configuration path is not available to Settings')
  return path
}

/**
 * Builds the capability bridge. Separate from the exposure guard so tests can inspect it.
 * @returns The Settings capabilities backed by typed IPC invokes.
 * @example const api = createSettingsBridge()
 */
export function createSettingsBridge(): SettingsWindowAPI {
  return {
    version: 1,
    platform: process.platform,
    snapshot: async () => typedInvoke('settings-window-snapshot'),
    onChanged: (listener) =>
      subscribeToMain('settings-window-changed', listener),
    preferences: {
      patch: async (generation, command) =>
        typedInvoke('settings-window-preferences-patch', generation, command),
    },
    categories: {
      command: async (generation, command) =>
        typedInvoke('settings-window-category-command', generation, command),
    },
    account: {
      status: async () => typedInvoke('settings-window-account-status'),
      connect: async () => typedInvoke('settings-window-account-connect'),
      notNow: async () => typedInvoke('settings-window-account-not-now'),
      signIn: async () => typedInvoke('settings-window-account-sign-in'),
      cancelSignIn: async (): Promise<void> =>
        typedInvoke('settings-window-account-cancel-sign-in'),
      signOut: async () => typedInvoke('settings-window-account-sign-out'),
      clearAgain: async () =>
        typedInvoke('settings-window-account-clear-again'),
      acknowledgeFirstUpload: async (): Promise<void> =>
        typedInvoke('settings-window-account-ack-first-upload'),
      openDashboard: async () =>
        typedInvoke('settings-window-account-open-dashboard'),
    },
    syncDetails: async (generation) =>
      typedInvoke('settings-window-sync-details', generation),
    config: {
      get: async <T = unknown>(path: string, defaultValue?: T): Promise<T> =>
        (await typedInvoke(
          'config-get',
          assertSettingsConfigPath(path),
          defaultValue,
        )) as T,
      set: async (path, value) =>
        typedInvoke('config-set', assertSettingsConfigPath(path), value),
      open: async () => typedInvoke('config-open'),
    },
    app: { getVersion: async () => typedInvoke('app-version') },
    updater: {
      checkForUpdates: async () => typedInvoke('updater-check-for-updates'),
      quitAndInstall: async () => typedInvoke('updater-quit-and-install'),
      // A failed poll must reject so the renderer keeps its last successful snapshot; main's
      // error text stays out of the renderer and its logs.
      getStatus: async () => {
        try {
          return await typedInvoke('updater-get-status')
        } catch {
          throw new Error('Update status unavailable')
        }
      },
    },
    settings: {
      setHideAppIcon: async (hide) =>
        typedInvoke('settings:setHideAppIcon', hide),
      setShowInMenuBar: async (show) =>
        typedInvoke('settings:setShowInMenuBar', show),
      setStartAtLogin: async (enabled) =>
        typedInvoke('settings:setStartAtLogin', enabled),
      getLoginItemSettings: async () =>
        typedInvoke('settings:getLoginItemSettings'),
      resetPopoverSize: async () => typedInvoke('settings:resetPopoverSize'),
    },
    floatingPanels: {
      getVisibleOnAllWorkspaces: async () =>
        typedInvoke('live-editor-get-visible-on-all-workspaces'),
      setVisibleOnAllWorkspaces: async (enabled) =>
        typedInvoke('live-editor-set-visible-on-all-workspaces', enabled),
      getLiveEditorAlwaysOnTop: async () =>
        typedInvoke('live-editor-window-get-always-on-top'),
      setLiveEditorAlwaysOnTop: async (enabled) =>
        typedInvoke('live-editor-window-set-always-on-top', enabled),
    },
    liveEditor: {
      show: async (): Promise<void> => typedInvoke('live-editor-window-show'),
      getOpacity: async () => typedInvoke('live-editor-window-get-opacity'),
      setOpacity: async (value) =>
        typedInvoke('live-editor-window-set-opacity', value),
      getShortcut: async () => typedInvoke('live-editor-config-get-shortcut'),
      setShortcut: async (accelerator) =>
        typedInvoke('live-editor-config-set-shortcut', accelerator),
      getShortcutSecondary: async () =>
        typedInvoke('live-editor-config-get-shortcut-secondary'),
      setShortcutSecondary: async (accelerator) =>
        typedInvoke('live-editor-config-set-shortcut-secondary', accelerator),
    },
  }
}

// Only the exact bundled Settings document receives the bridge (D5, EA16).
if (process.isMainFrame && isLocalSettingsDocument(window.location.href))
  contextBridge.exposeInMainWorld('settingsAPI', createSettingsBridge())
