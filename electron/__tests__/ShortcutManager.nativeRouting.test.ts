import { globalShortcut } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createNativeBinding } from '../nativeBinding'
import type { NativeShortcutEngine } from '../nativeShortcutEngine'
import ShortcutManager from '../ShortcutManager'
import type { WindowManager } from '../WindowManager'

/**
 * Routing coverage for #111: a lone-modifier binding (e.g. Right ⌥ alone) must
 * travel through the injected native tap, NOT Electron's globalShortcut (which
 * can only bind modifier+key chords). These specs prove the chokepoint branches
 * correctly, the read-back map sees the native binding so a rebind is confirmed,
 * unregister routes back to the tap, and an unavailable tap degrades cleanly.
 *
 * `vi.mock` is hoisted above the imports, so `globalShortcut` resolves to the
 * mock below even though it is imported at the top.
 */

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  globalShortcut: {
    isRegistered: vi.fn(() => false),
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
}))

/** The mocked Electron registrars — asserted to prove a bind did NOT chord-route. */
const globalRegisterMock = vi.mocked(globalShortcut.register)
const globalUnregisterMock = vi.mocked(globalShortcut.unregister)

/** Right Option as a persisted native binding — the value the tap must receive. */
const RIGHT_OPTION_BINDING = createNativeBinding('rightOption')

/** A representative chord accelerator that must still go through globalShortcut. */
const NEW_TASK_ACCELERATOR = 'CommandOrControl+N'

/**
 * Builds an available native tap whose register/unregister are spies, so a test
 * can assert the lone-modifier binding reached the engine with the right id.
 * @returns the engine plus its register/unregister/unregisterAll spies.
 */
function createAvailableNativeEngineHarness() {
  const register = vi.fn(() => true)
  const unregister = vi.fn(() => true)
  const unregisterAll = vi.fn()
  const engine: NativeShortcutEngine = {
    isAvailable: () => true,
    register,
    unregister,
    unregisterAll,
  }
  return { engine, register, unregister, unregisterAll }
}

/** Minimal WindowManager stand-in — only the constructor chokepoint hook is read. */
function createWindowManagerStub(): WindowManager {
  return {
    setOnFloatingNavigatorCreated: vi.fn(),
  } as unknown as WindowManager
}

describe('ShortcutManager routing of native lone-modifier bindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('binds a lone-modifier shortcut through the native tap and never through globalShortcut', () => {
    // Arrange
    const { engine, register } = createAvailableNativeEngineHarness()
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )
    const callback = vi.fn()

    // Act
    const didRegister = shortcutManager.registerShortcut(
      RIGHT_OPTION_BINDING,
      'toggleBrainDump',
      callback,
    )

    // Assert
    expect(didRegister).toBe(true)
    expect(register).toHaveBeenCalledWith(
      'rightOption',
      'toggleBrainDump',
      callback,
    )
    expect(globalRegisterMock).not.toHaveBeenCalled()
  })

  it('exposes the native binding in the read-back map so a rebind is confirmed', () => {
    // Arrange
    const { engine } = createAvailableNativeEngineHarness()
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )

    // Act
    shortcutManager.registerShortcut(
      RIGHT_OPTION_BINDING,
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert
    expect(shortcutManager.getRegisteredShortcuts()['toggleBrainDump']).toBe(
      'lone-modifier:rightOption',
    )
  })

  it('unbinds a native shortcut through the tap, leaving globalShortcut untouched', () => {
    // Arrange
    const { engine, unregister } = createAvailableNativeEngineHarness()
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )
    shortcutManager.registerShortcut(
      RIGHT_OPTION_BINDING,
      'toggleBrainDump',
      vi.fn(),
    )

    // Act
    const didUnregister = shortcutManager.unregisterShortcut('toggleBrainDump')

    // Assert
    expect(didUnregister).toBe(true)
    expect(unregister).toHaveBeenCalledWith('toggleBrainDump')
    expect(globalUnregisterMock).not.toHaveBeenCalled()
    expect(
      shortcutManager.getRegisteredShortcuts()['toggleBrainDump'],
    ).toBeUndefined()
  })

  it('refuses a lone-modifier bind when the native tap is unavailable so the caller can fall back to a chord', () => {
    // Arrange: an unavailable tap (module missing / no Accessibility permission).
    const unavailableEngine: NativeShortcutEngine = {
      isAvailable: () => false,
      register: vi.fn(() => true),
      unregister: vi.fn(() => true),
      unregisterAll: vi.fn(),
    }
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      unavailableEngine,
    )

    // Act
    const didRegister = shortcutManager.registerShortcut(
      RIGHT_OPTION_BINDING,
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert
    expect(didRegister).toBe(false)
    expect(unavailableEngine.register).not.toHaveBeenCalled()
    expect(
      shortcutManager.getRegisteredShortcuts()['toggleBrainDump'],
    ).toBeUndefined()
  })

  it('still binds a chord accelerator through globalShortcut even when a native tap is present', () => {
    // Arrange
    const { engine, register } = createAvailableNativeEngineHarness()
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )
    const callback = vi.fn()

    // Act
    shortcutManager.registerShortcut(NEW_TASK_ACCELERATOR, 'newTask', callback)

    // Assert
    expect(globalRegisterMock).toHaveBeenCalledWith(
      NEW_TASK_ACCELERATOR,
      callback,
    )
    expect(register).not.toHaveBeenCalled()
  })
})
