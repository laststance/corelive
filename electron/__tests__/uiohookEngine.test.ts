import { beforeEach, describe, expect, it, vi } from 'vitest'

// Silence the real pino logger so tap start/re-arm info lines never spew here.
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  createUiohookShortcutEngine,
  type UiohookKeyboardEvent,
  type UiohookModule,
} from '../uiohookEngine'
import type { NativeTapLatch } from '../utils/nativeTapLatch'

/** libuiohook keycodes used by the specs (UiohookKey constants). */
const RIGHT_OPTION_KEYCODE = 0x0e38 // UiohookKey.AltRight
const LEFT_OPTION_KEYCODE = 0x0038 // UiohookKey.Alt
const LETTER_B_KEYCODE = 0x0030 // UiohookKey.B — a non-modifier intervening key

/**
 * A fake `uIOhook` singleton that records its keydown/keyup listeners and tap
 * lifecycle, and lets a test drive real press/release events into the engine.
 * @returns the module to inject plus emit helpers and lifecycle spies.
 */
function createFakeUiohook() {
  const keydownListeners: ((event: UiohookKeyboardEvent) => void)[] = []
  const keyupListeners: ((event: UiohookKeyboardEvent) => void)[] = []
  const start = vi.fn()
  const stop = vi.fn()

  const module: UiohookModule = {
    on: (event, listener) => {
      if (event === 'keydown') keydownListeners.push(listener)
      else keyupListeners.push(listener)
    },
    start,
    stop,
  }

  return {
    module,
    start,
    stop,
    /** How many keydown listeners are attached — proves attach-once on reArm. */
    keydownListenerCount: () => keydownListeners.length,
    pressKey: (keycode: number) =>
      keydownListeners.forEach((listener) => listener({ keycode })),
    releaseKey: (keycode: number) =>
      keyupListeners.forEach((listener) => listener({ keycode })),
  }
}

/**
 * An in-memory {@link NativeTapLatch} so the engine's freeze-safety wrapper is
 * unit-tested without `electron.app` / fs (the injectable seam mirrors the
 * native-module loader). `arm()` flips the marker on and returns success;
 * `clear()` flips it off; `isSet()` reports the current marker.
 * @param initiallySet - Simulates a prior launch that armed but never confirmed.
 * @returns the latch to inject plus its isSet/arm/clear spies.
 */
function createFakeLatch(initiallySet = false) {
  let isSetValue = initiallySet
  const isSet = vi.fn(() => isSetValue)
  const arm = vi.fn(() => {
    isSetValue = true
    return true
  })
  const clear = vi.fn(() => {
    isSetValue = false
  })
  const latch: NativeTapLatch = { isSet, arm, clear }
  return { latch, isSet, arm, clear }
}

/**
 * Drains the macrotask queue so a `setImmediate`-deferred shortcut callback has
 * run. The engine schedules the toggle off the tap's dispatch path (codex #1),
 * so fire assertions must await this rather than reading synchronously.
 */
const flushImmediate = async (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

describe('createUiohookShortcutEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports available when the native module loads', () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()

    // Act
    const engine = createUiohookShortcutEngine(() => fake.module, latch)

    // Assert
    expect(engine.isAvailable()).toBe(true)
  })

  it('reports unavailable and refuses to bind when the native module is absent', () => {
    // Arrange: the prebuilt is missing / wrong arch, so the loader returns null.
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => null, latch)

    // Act
    const didRegister = engine.register(
      'rightOption',
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert
    expect(engine.isAvailable()).toBe(false)
    expect(didRegister).toBe(false)
  })

  it('reports unavailable when loading the native module throws', () => {
    // Arrange: a corrupt binary makes require() throw — must not crash construction.
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => {
      throw new Error('dlopen failed')
    }, latch)

    // Assert
    expect(engine.isAvailable()).toBe(false)
  })

  it('refuses the bind and degrades when the global tap fails to start', () => {
    // Arrange: the module loads, but start() throws (e.g. macOS denied the event
    // tap), so the lone-modifier bind must roll back rather than record a dead bind.
    const startThrowingModule: UiohookModule = {
      on: () => {},
      start: () => {
        throw new Error('tap start failed')
      },
      stop: () => {},
    }
    const { latch, clear } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => startThrowingModule, latch)

    // Act
    const didRegister = engine.register(
      'rightOption',
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert: register reports failure so ShortcutManager falls back to a chord,
    // and the latch is cleared (a sync start() failure is not a freeze).
    expect(didRegister).toBe(false)
    expect(clear).toHaveBeenCalled()
  })

  it('fires the shortcut when its lone modifier is pressed and released by itself', async () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: press and release the right Option key alone, then drain the deferral.
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)
    await flushImmediate()

    // Assert
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('dispatches the shortcut via setImmediate, not synchronously on the tap thread', async () => {
    // Arrange: heavy window work must never run on the native tap's emit path
    // (codex #1) — the callback is deferred to the next main-loop tick.
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)

    // Assert: not yet on the same tick…
    expect(callback).not.toHaveBeenCalled()
    // …only after the macrotask queue drains.
    await flushImmediate()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does not fire when another key is pressed between the modifier press and release', async () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: Option down, a letter down (forms a chord), then Option up.
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.pressKey(LETTER_B_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)
    await flushImmediate()

    // Assert: the intervening key disarmed the lone-modifier candidate.
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not fire after the binding is unregistered', async () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act
    engine.unregister('toggleBrainDump')
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)
    await flushImmediate()

    // Assert
    expect(callback).not.toHaveBeenCalled()
  })

  it('rebinds an id to a new modifier without the old key still firing it', async () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: rebind the same id to the LEFT Option, then press each key alone.
    engine.register('leftOption', 'toggleBrainDump', callback)
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)
    fake.pressKey(LEFT_OPTION_KEYCODE)
    fake.releaseKey(LEFT_OPTION_KEYCODE)
    await flushImmediate()

    // Assert: only the new (left) modifier fires; the old (right) one is dead.
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('starts the global tap on the first bind and stops it after the last unbind', () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)

    // Act + Assert: first bind starts the tap.
    engine.register('rightOption', 'toggleBrainDump', vi.fn())
    expect(fake.start).toHaveBeenCalledTimes(1)
    expect(fake.stop).not.toHaveBeenCalled()

    // Removing the last binding stops it (the app releases the global hook).
    engine.unregister('toggleBrainDump')
    expect(fake.stop).toHaveBeenCalledTimes(1)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Freeze-safety (#125): brick-proof latch, attach-once reArm, pressed reset
  // ──────────────────────────────────────────────────────────────────────────

  it('arms the brick-proof latch before starting the tap', () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch, arm } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)

    // Act
    engine.register('rightOption', 'toggleBrainDump', vi.fn())

    // Assert: the on-disk guard is persisted before the tap runs.
    expect(arm).toHaveBeenCalledTimes(1)
    expect(fake.start).toHaveBeenCalledTimes(1)
  })

  it('refuses to start the tap when the latch cannot be armed', () => {
    // Arrange: arming the brick-guard fails (e.g. fsync write didn't land), so the
    // tap must NOT start unguarded — a freeze with no marker would brick relaunch.
    const fake = createFakeUiohook()
    const { latch, arm } = createFakeLatch()
    arm.mockReturnValue(false)
    const engine = createUiohookShortcutEngine(() => fake.module, latch)

    // Act
    const didRegister = engine.register(
      'rightOption',
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert
    expect(didRegister).toBe(false)
    expect(fake.start).not.toHaveBeenCalled()
  })

  it('starts the lone modifier INACTIVE when a prior arming was left unconfirmed', () => {
    // Arrange: the latch marker is still set from a prior launch that armed but
    // never confirmed stability (it may have wedged the app) — do NOT re-arm.
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch(true)
    const engine = createUiohookShortcutEngine(() => fake.module, latch)

    // Act
    const didRegister = engine.register(
      'rightOption',
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert: the binding is inactive and the tap never started (no brick loop).
    expect(engine.isLatchBlocked()).toBe(true)
    expect(didRegister).toBe(false)
    expect(fake.start).not.toHaveBeenCalled()
  })

  it('re-enables a latch-blocked tap once the block is manually cleared', () => {
    // Arrange: a latch-blocked launch left the binding inactive.
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch(true)
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    expect(engine.register('rightOption', 'toggleBrainDump', vi.fn())).toBe(
      false,
    )

    // Act: the manual "re-enable" path clears the block, then re-registers.
    engine.clearLatchBlock()
    const didRegister = engine.register(
      'rightOption',
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert: the tap now arms and starts.
    expect(engine.isLatchBlocked()).toBe(false)
    expect(didRegister).toBe(true)
    expect(fake.start).toHaveBeenCalledTimes(1)
  })

  it('re-arms without duplicating listeners — 10 reArms still fire the shortcut once', async () => {
    // Arrange: reArm() used to attach listeners on each start, so a stop+start
    // stacked duplicate keydown/keyup handlers and fired each binding N times.
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: revive the tap ten times (as repeated resume/unlock events would).
    for (let i = 0; i < 10; i++) engine.reArm()
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)
    await flushImmediate()

    // Assert: exactly one keydown listener, and the shortcut fires exactly once.
    expect(fake.keydownListenerCount()).toBe(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('stops and restarts the tap on reArm (reviving a possibly-silent tap)', () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch, arm } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    engine.register('rightOption', 'toggleBrainDump', vi.fn())
    expect(fake.start).toHaveBeenCalledTimes(1)
    expect(arm).toHaveBeenCalledTimes(1)

    // Act
    engine.reArm()

    // Assert: a clean stop then a fresh guarded start (arm again).
    expect(fake.stop).toHaveBeenCalledTimes(1)
    expect(fake.start).toHaveBeenCalledTimes(2)
    expect(arm).toHaveBeenCalledTimes(2)
  })

  it('does nothing on reArm when no binding is active', () => {
    // Arrange: an unbound engine has no tap to revive.
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)

    // Act
    engine.reArm()

    // Assert
    expect(fake.start).not.toHaveBeenCalled()
    expect(fake.stop).not.toHaveBeenCalled()
  })

  it('clears a modifier held across sleep so its dangling release does not fire (reArm)', async () => {
    // Arrange: the modifier goes down, then the machine sleeps; reArm() on wake
    // must reset the pressed-alone state so the post-wake release can't mis-fire.
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: press (arms it), reArm (wake), then the dangling release arrives.
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    engine.reArm()
    fake.releaseKey(RIGHT_OPTION_KEYCODE)
    await flushImmediate()

    // Assert: the stale armed key was cleared — no phantom toggle.
    expect(callback).not.toHaveBeenCalled()
  })

  it('drops in-flight pressed state on resetPressedState without restarting the tap', async () => {
    // Arrange: suspend/lock-screen resets pressed-state but leaves the tap running.
    const fake = createFakeUiohook()
    const { latch } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: arm the modifier, reset state (suspend), then the dangling release.
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    engine.resetPressedState()
    fake.releaseKey(RIGHT_OPTION_KEYCODE)
    await flushImmediate()

    // Assert: no fire, and the tap was never stopped (reset ≠ restart).
    expect(callback).not.toHaveBeenCalled()
    expect(fake.stop).not.toHaveBeenCalled()
  })

  it('clears the brick-proof latch on a clean stop (a confirmed-healthy session)', () => {
    // Arrange
    const fake = createFakeUiohook()
    const { latch, clear } = createFakeLatch()
    const engine = createUiohookShortcutEngine(() => fake.module, latch)
    engine.register('rightOption', 'toggleBrainDump', vi.fn())

    // Act: removing the last binding stops the tap cleanly.
    engine.unregister('toggleBrainDump')

    // Assert: a clean stop drops the guard so the next launch isn't false-blocked.
    expect(fake.stop).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalled()
  })
})
