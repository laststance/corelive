import { globalShortcut } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigManager } from '../ConfigManager'
import { createNativeBinding } from '../nativeBinding'
import type { NativeShortcutEngine } from '../nativeShortcutEngine'
import type { NotificationManager } from '../NotificationManager'
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
 * `isLatchBlocked` is a spy defaulting to `false` (healthy) so routing tests are
 * unchanged; a latch-block test overrides it to drive the inactive path (#125).
 * `isActive` is a spy defaulting to `false` (no live tap); the "tap is live" test
 * drives it `true` to prove `getNativeTapStatus` surfaces engine RUNTIME state.
 * @returns the engine plus its register/unregister/unregisterAll/isLatchBlocked/isActive spies.
 */
function createAvailableNativeEngineHarness() {
  const register = vi.fn(() => true)
  const unregister = vi.fn(() => true)
  const unregisterAll = vi.fn()
  const isLatchBlocked = vi.fn(() => false)
  const clearLatchBlock = vi.fn()
  const reArm = vi.fn()
  const resetPressedState = vi.fn()
  const isActive = vi.fn(() => false)
  const engine: NativeShortcutEngine = {
    isAvailable: () => true,
    register,
    unregister,
    unregisterAll,
    isLatchBlocked,
    clearLatchBlock,
    reArm,
    resetPressedState,
    isActive,
  }
  return {
    engine,
    register,
    unregister,
    unregisterAll,
    isLatchBlocked,
    clearLatchBlock,
    reArm,
    resetPressedState,
    isActive,
  }
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

  it('leaves a lone-modifier binding INACTIVE when the freeze-safety latch is blocked', () => {
    // Arrange: a prior launch armed the tap but never confirmed stability (#125),
    // so the engine reports latch-blocked — re-arming could re-freeze every launch.
    const { engine, register, isLatchBlocked } =
      createAvailableNativeEngineHarness()
    isLatchBlocked.mockReturnValue(true)
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )

    // Act
    const didRegister = shortcutManager.registerShortcut(
      RIGHT_OPTION_BINDING,
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert: never re-arms (engine.register untouched), reports inactive, and a
    // lone modifier has NO chord equivalent so globalShortcut stays untouched too.
    expect(didRegister).toBe(false)
    expect(register).not.toHaveBeenCalled()
    expect(globalRegisterMock).not.toHaveBeenCalled()
    expect(
      shortcutManager.getRegisteredShortcuts()['toggleBrainDump'],
    ).toBeUndefined()
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
      isLatchBlocked: () => false,
      clearLatchBlock: vi.fn(),
      reArm: vi.fn(),
      resetPressedState: vi.fn(),
      isActive: () => false,
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

  // ──────────────────────────────────────────────────────────────────────────
  // Freeze-safety recovery surface (#125): status + power-event + manual re-arm
  // ──────────────────────────────────────────────────────────────────────────

  it('reports the native tap status straight from the engine for the renderer affordance', () => {
    // Arrange: a latch-blocked engine (a prior arming never confirmed).
    const { engine, isLatchBlocked } = createAvailableNativeEngineHarness()
    isLatchBlocked.mockReturnValue(true)
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )

    // Act + Assert: latch-blocked, and no lone-modifier binding registered, so
    // the tap is not active — the renderer keeps the recovery affordance (#125).
    expect(shortcutManager.getNativeTapStatus()).toEqual({
      available: true,
      latchBlocked: true,
      active: false,
    })
  })

  it('revives the tap on reArmNativeTap (wired to powerMonitor resume/unlock)', () => {
    // Arrange
    const { engine, reArm } = createAvailableNativeEngineHarness()
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )

    // Act
    shortcutManager.reArmNativeTap()

    // Assert
    expect(reArm).toHaveBeenCalledTimes(1)
  })

  it('drops pressed-alone state on resetNativeTapState (wired to powerMonitor suspend/lock)', () => {
    // Arrange
    const { engine, resetPressedState } = createAvailableNativeEngineHarness()
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )

    // Act
    shortcutManager.resetNativeTapState()

    // Assert
    expect(resetPressedState).toHaveBeenCalledTimes(1)
  })

  it('clears the latch block and returns status on manual reenableNativeTap', () => {
    // Arrange
    const { engine, clearLatchBlock } = createAvailableNativeEngineHarness()
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )

    // Act
    const status = shortcutManager.reenableNativeTap()

    // Assert: the block is cleared (so the next register re-arms) and the
    // post-action status is surfaced back to the caller. With only default chord
    // shortcuts (no lone-modifier binding) nothing arms the tap, so active stays
    // false — the status honestly reflects no live native binding (#125, codex #5).
    expect(clearLatchBlock).toHaveBeenCalledTimes(1)
    expect(status).toEqual({
      available: true,
      latchBlocked: false,
      active: false,
    })
  })

  it('notifies the user only once while the tap stays latch-blocked', () => {
    // Arrange: a latch-blocked engine + a configured lone-modifier binding, so
    // every registerGlobalShortcuts() hits the inactive branch. The OS toast must
    // fire once, not once per attempt (startup + rebinds would spam) — codex #6.
    const { engine, isLatchBlocked } = createAvailableNativeEngineHarness()
    isLatchBlocked.mockReturnValue(true)
    const showNotification = vi.fn()
    const notificationManager = {
      showNotification,
    } as unknown as NotificationManager
    const configManager = {
      getSection: vi.fn((section: string) =>
        section === 'shortcuts'
          ? { toggleBrainDump: 'lone-modifier:rightOption' }
          : {},
      ),
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as ConfigManager
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      notificationManager,
      configManager,
      engine,
    )

    // Act: the chokepoint runs several times while still blocked.
    shortcutManager.registerGlobalShortcuts()
    shortcutManager.registerGlobalShortcuts()
    shortcutManager.registerGlobalShortcuts()

    // Assert: exactly one toast across all attempts.
    expect(showNotification).toHaveBeenCalledTimes(1)
  })

  it('marks the native tap active once a lone-modifier binding is live', () => {
    // Arrange: an available tap that registers the bind AND reports itself live
    // at runtime (#125 codex review). `active` must come from the engine's
    // RUNTIME state, so the harness drives isActive() true here.
    const { engine, isActive } = createAvailableNativeEngineHarness()
    isActive.mockReturnValue(true)
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      null,
      engine,
    )

    // Act: a successful native registration with a live tap.
    shortcutManager.registerShortcut(
      RIGHT_OPTION_BINDING,
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert: getNativeTapStatus surfaces the engine's live runtime state.
    expect(shortcutManager.getNativeTapStatus().active).toBe(true)
  })

  it('keeps the tap INACTIVE after a re-enable whose re-arm still fails', () => {
    // Arrange: a lone-modifier binding is configured, but the engine refuses to
    // register it even once the block is cleared (the tap won't start). The
    // status must NOT claim a healthy tap — the renderer keeps the recovery
    // control because active is false despite latchBlocked clearing (codex #5).
    const { engine, register, clearLatchBlock } =
      createAvailableNativeEngineHarness()
    register.mockReturnValue(false)
    const configManager = {
      getSection: vi.fn((section: string) =>
        section === 'shortcuts'
          ? { toggleBrainDump: 'lone-modifier:rightOption' }
          : {},
      ),
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as ConfigManager
    const shortcutManager = new ShortcutManager(
      createWindowManagerStub(),
      null,
      configManager,
      engine,
    )

    // Act
    const status = shortcutManager.reenableNativeTap()

    // Assert: block cleared and a re-register was attempted, but it failed so the
    // tap is honestly reported inactive.
    expect(clearLatchBlock).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalled()
    expect(status).toEqual({
      available: true,
      latchBlocked: false,
      active: false,
    })
  })
})
