/**
 * End-to-end coverage for the Settings IPC surface (settings namespace).
 *
 * Tests the renderer→IPC→main-process round-trip for settings-related calls,
 * verifying the full stack is wired correctly across login-item, startup-config,
 * and app-visibility settings. After main-window retirement the settings
 * bridge is driven from the Settings window itself (`setupElectronTest`).
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import { setupElectronTest } from './_helpers/launch'

let electronApp: ElectronApplication
let settingsWindow: Page

test.beforeAll(async () => {
  ;({ electronApp, settingsWindow } =
    await setupElectronTest('settings-popover'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('hiding the menu bar icon setting reaches main process without error', async () => {
  // Arrange + Act: pass false (hide) — safe, does not affect test session
  const result = await settingsWindow.evaluate(async () => {
    const setFn = window.electronAPI?.settings?.setShowInMenuBar
    if (!setFn) throw new Error('setShowInMenuBar not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns a boolean (true=applied, false=tray unavailable in test env)
  expect(typeof result).toBe('boolean')
})

test('reading startup config exposes both window flags', async () => {
  // Arrange + Act
  const config = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.settings?.getStartupConfig
    if (!getFn) throw new Error('getStartupConfig not in preload bridge')
    return getFn()
  })

  // Assert: both boolean fields are present
  expect(typeof config.showBraindump).toBe('boolean')
  expect(typeof config.showFloating).toBe('boolean')
  // Assert: the retired `showMain` flag is gone from the IPC payload (T18 main-window retirement)
  expect('showMain' in config).toBe(false)
})

test('updating the startup window flags persists successfully', async () => {
  // Arrange
  const newConfig = {
    showBraindump: false,
    showFloating: true,
  }

  // Act
  const success = await settingsWindow.evaluate(async (config) => {
    const setFn = window.electronAPI?.settings?.setStartupConfig
    if (!setFn) throw new Error('setStartupConfig not in preload bridge')
    return setFn(config)
  }, newConfig)

  // Assert: IPC handler returns true when config is written
  expect(success).toBe(true)

  // Assert: the write actually persisted — read it back through the same bridge
  // (the Settings window, since the main window is retired in T18) and confirm
  // both flags round-tripped, not just that the setter returned true.
  const persisted = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.settings?.getStartupConfig
    if (!getFn) throw new Error('getStartupConfig not in preload bridge')
    return getFn()
  })
  expect(persisted.showBraindump).toBe(false)
  expect(persisted.showFloating).toBe(true)
})

test('shortcut opening sound defaults to shuffle and round-trips explicit choices through config IPC', async () => {
  // Arrange / Act: a fresh Electron user-data directory reads both product defaults.
  const initialValues = await settingsWindow.evaluate(async () => {
    const getConfig = window.electronAPI?.config?.get
    if (!getConfig) throw new Error('config.get not in preload bridge')
    return {
      isEnabled: await getConfig<boolean>('behavior.shortcutOpenSoundEnabled'),
      selection: await getConfig<string>('behavior.shortcutOpenSoundSelection'),
    }
  })

  // Assert
  expect(initialValues).toEqual({
    isEnabled: true,
    selection: 'shuffle',
  })

  try {
    // Act: persist an opt-out and one representative fixed cue through renderer → IPC → main.
    const fixedChoice = await settingsWindow.evaluate(async () => {
      const setConfig = window.electronAPI?.config?.set
      const getConfig = window.electronAPI?.config?.get
      if (!setConfig) throw new Error('config.set not in preload bridge')
      if (!getConfig) throw new Error('config.get not in preload bridge')
      const didDisable = await setConfig(
        'behavior.shortcutOpenSoundEnabled',
        false,
      )
      const didSelectCue = await setConfig(
        'behavior.shortcutOpenSoundSelection',
        'three-key-flourish',
      )
      return {
        didDisable,
        didSelectCue,
        isEnabled: await getConfig<boolean>(
          'behavior.shortcutOpenSoundEnabled',
        ),
        selection: await getConfig<string>(
          'behavior.shortcutOpenSoundSelection',
        ),
      }
    })

    // Assert: both writes and their subsequent reads reflect the explicit choices.
    expect(fixedChoice).toEqual({
      didDisable: true,
      didSelectCue: true,
      isEnabled: false,
      selection: 'three-key-flourish',
    })
  } finally {
    // Act: restore shipping defaults even when an assertion fails, protecting later specs.
    const restoredValues = await settingsWindow.evaluate(async () => {
      const setConfig = window.electronAPI?.config?.set
      const getConfig = window.electronAPI?.config?.get
      if (!setConfig) throw new Error('config.set not in preload bridge')
      if (!getConfig) throw new Error('config.get not in preload bridge')
      await setConfig('behavior.shortcutOpenSoundEnabled', true)
      await setConfig('behavior.shortcutOpenSoundSelection', 'shuffle')
      return {
        isEnabled: await getConfig<boolean>(
          'behavior.shortcutOpenSoundEnabled',
        ),
        selection: await getConfig<string>(
          'behavior.shortcutOpenSoundSelection',
        ),
      }
    })

    // Assert
    expect(restoredValues).toEqual({
      isEnabled: true,
      selection: 'shuffle',
    })
  }
})

test('toggling dock icon visibility reaches main process without error', async () => {
  // Arrange + Act: pass false — "show dock icon" is the safe non-destructive state
  const result = await settingsWindow.evaluate(async () => {
    const setFn = window.electronAPI?.settings?.setHideAppIcon
    if (!setFn) throw new Error('setHideAppIcon not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns boolean success flag
  expect(typeof result).toBe('boolean')
})
