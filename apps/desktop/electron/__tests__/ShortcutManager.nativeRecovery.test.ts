import { EventEmitter } from 'node:events'

import { describe, expect, test, vi } from 'vitest'

import type { ConfigManager } from '../ConfigManager'
import ShortcutManager from '../ShortcutManager'
import { createUiohookShortcutEngine } from '../uiohookEngine'
import { applyShortcutRebind } from '../utils/applyShortcutRebind'
import type { WindowManager } from '../WindowManager'

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null },
  globalShortcut: {
    isRegistered: () => false,
    register: () => true,
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * Builds a blocked native listener for Settings recovery tests without an OS hook.
 * The tests send key events through the real engine and shortcut manager.
 * @example
 * const { manager, events } = createBlockedShortcutManager()
 */
function createBlockedShortcutManager() {
  const events = new EventEmitter()
  const start = vi.fn()
  const arm = vi.fn(() => true)
  const engine = createUiohookShortcutEngine(
    () => ({ on: events.on.bind(events), start, stop: vi.fn() }),
    { isSet: () => true, arm, clear: vi.fn() },
  )
  const toggleLiveEditor = vi.fn(() => true)
  const config = {
    getSection: () => ({
      toggleLiveEditor: 'Control+J',
      toggleLiveEditorSecondary: 'lone-modifier:rightOption',
    }),
    get: vi.fn(),
    set: vi.fn(),
  } as unknown as ConfigManager
  const manager = new ShortcutManager(
    { toggleLiveEditor } as unknown as WindowManager,
    null,
    config,
    engine,
  )
  return { manager, engine, events, start, arm, toggleLiveEditor }
}

describe('LiveEditor shortcut recovery after an unfinished native start', () => {
  test('opens LiveEditor with Right Option after the user selects the saved key again', async () => {
    // Arrange: startup leaves the saved native shortcut blocked.
    const { manager, engine, events, start, arm, toggleLiveEditor } =
      createBlockedShortcutManager()
    manager.registerGlobalShortcuts()
    expect(start).not.toHaveBeenCalled()

    try {
      // Act: Settings saves the same key, then the user presses it alone.
      const didApply = applyShortcutRebind(
        manager,
        'toggleLiveEditorSecondary',
        'lone-modifier:rightOption',
        'lone-modifier:rightOption',
      )
      events.emit('keydown', { keycode: 0x0e38 })
      events.emit('keyup', { keycode: 0x0e38 })
      await new Promise<void>((resolve) => setImmediate(resolve))

      // Assert: recovery keeps the launch guard and restores the actual toggle.
      expect(didApply).toBe(true)
      expect(arm).toHaveBeenCalledTimes(1)
      expect(start).toHaveBeenCalledTimes(1)
      expect(engine.isActive()).toBe(true)
      expect(manager.getRegisteredShortcuts()).toMatchObject({
        toggleLiveEditor: 'Control+J',
        toggleLiveEditorSecondary: 'lone-modifier:rightOption',
      })
      expect(toggleLiveEditor).toHaveBeenCalledTimes(1)
    } finally {
      engine.unregisterAll()
    }
  })

  test('keeps Right Option blocked during startup and wake recovery', () => {
    // Arrange
    const { manager, engine, start } = createBlockedShortcutManager()

    // Act
    manager.registerGlobalShortcuts()
    manager.reArmNativeTap()
    manager.updateShortcuts({
      toggleLiveEditorSecondary: 'lone-modifier:rightOption',
    })

    // Assert
    expect(start).not.toHaveBeenCalled()
    expect(engine.isLatchBlocked()).toBe(true)
    expect(manager.getRegisteredShortcuts()).toEqual({
      toggleLiveEditor: 'Control+J',
    })
  })

  test('waits for another explicit save after retrying the saved Right Option key fails', () => {
    // Arrange: the native listener fails once, then would accept another start.
    const { manager, engine, start } = createBlockedShortcutManager()
    start.mockImplementationOnce(() => {
      throw new Error('Native listener could not start')
    })

    try {
      // Act
      const didApply = applyShortcutRebind(
        manager,
        'toggleLiveEditorSecondary',
        'lone-modifier:rightOption',
        'lone-modifier:rightOption',
      )

      // Assert: rollback must not silently retry the same native key.
      expect(didApply).toBe(false)
      expect(start).toHaveBeenCalledTimes(1)
      expect(engine.isActive()).toBe(false)
      expect(manager.getRegisteredShortcuts()).toEqual({})

      // Act: a second user save is a new retry request.
      const didRetry = applyShortcutRebind(
        manager,
        'toggleLiveEditorSecondary',
        'lone-modifier:rightOption',
        'lone-modifier:rightOption',
      )

      // Assert
      expect(didRetry).toBe(true)
      expect(start).toHaveBeenCalledTimes(2)
      expect(engine.isActive()).toBe(true)
    } finally {
      engine.unregisterAll()
    }
  })

  test('keeps the native safety block when the user saves a regular shortcut', () => {
    // Arrange
    const { manager, engine, start } = createBlockedShortcutManager()

    // Act
    const didApply = applyShortcutRebind(
      manager,
      'toggleLiveEditorSecondary',
      'Alt+Space',
      'lone-modifier:rightOption',
    )

    // Assert
    expect(didApply).toBe(true)
    expect(start).not.toHaveBeenCalled()
    expect(engine.isLatchBlocked()).toBe(true)
    expect(manager.getRegisteredShortcuts()).toEqual({
      toggleLiveEditorSecondary: 'Alt+Space',
    })
  })

  test('does not restart the blocked prior key when a different native key fails to start', () => {
    // Arrange
    const { manager, engine, start } = createBlockedShortcutManager()
    start.mockImplementationOnce(() => {
      throw new Error('Native listener could not start')
    })

    try {
      // Act: restoring an already inactive key cannot report a live rollback.
      expect(() =>
        applyShortcutRebind(
          manager,
          'toggleLiveEditorSecondary',
          'lone-modifier:leftOption',
          'lone-modifier:rightOption',
        ),
      ).toThrow(
        'Failed to restore previous shortcut for toggleLiveEditorSecondary',
      )
      manager.reArmNativeTap()

      // Assert: rollback and wake leave the prior key inactive.
      expect(start).toHaveBeenCalledTimes(1)
      expect(engine.isActive()).toBe(false)
      expect(engine.isLatchBlocked()).toBe(true)
      expect(manager.getRegisteredShortcuts()).toEqual({})
      expect(manager.getCurrentShortcuts()).toMatchObject({
        toggleLiveEditorSecondary: 'lone-modifier:rightOption',
      })
    } finally {
      engine.unregisterAll()
    }
  })

  test('keeps the native safety block when both toggle slots would use Right Option', () => {
    // Arrange
    const { manager, engine, start } = createBlockedShortcutManager()

    // Act
    const didApply = manager.updateShortcuts(
      { toggleLiveEditor: 'lone-modifier:rightOption' },
      { retryNativeTap: true },
    )

    // Assert
    expect(didApply).toBe(false)
    expect(start).not.toHaveBeenCalled()
    expect(engine.isLatchBlocked()).toBe(true)
  })

  test('does not start Right Option when the shortcut master switch is off', () => {
    // Arrange
    const { manager, engine, start } = createBlockedShortcutManager()
    manager.updateShortcuts({ enabled: false })

    // Act
    const didApply = applyShortcutRebind(
      manager,
      'toggleLiveEditorSecondary',
      'lone-modifier:rightOption',
      'lone-modifier:rightOption',
    )

    // Assert
    expect(didApply).toBe(false)
    expect(start).not.toHaveBeenCalled()
    expect(engine.isLatchBlocked()).toBe(true)
  })
})
