import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createUiohookShortcutEngine,
  type UiohookKeyboardEvent,
  type UiohookModule,
} from '../uiohookEngine'

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
    pressKey: (keycode: number) =>
      keydownListeners.forEach((listener) => listener({ keycode })),
    releaseKey: (keycode: number) =>
      keyupListeners.forEach((listener) => listener({ keycode })),
  }
}

describe('createUiohookShortcutEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports available when the native module loads', () => {
    // Arrange
    const fake = createFakeUiohook()

    // Act
    const engine = createUiohookShortcutEngine(() => fake.module)

    // Assert
    expect(engine.isAvailable()).toBe(true)
  })

  it('reports unavailable and refuses to bind when the native module is absent', () => {
    // Arrange: the prebuilt is missing / wrong arch, so the loader returns null.
    const engine = createUiohookShortcutEngine(() => null)

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
    const engine = createUiohookShortcutEngine(() => {
      throw new Error('dlopen failed')
    })

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
    const engine = createUiohookShortcutEngine(() => startThrowingModule)

    // Act
    const didRegister = engine.register(
      'rightOption',
      'toggleBrainDump',
      vi.fn(),
    )

    // Assert: register reports failure so ShortcutManager falls back to a chord.
    expect(didRegister).toBe(false)
  })

  it('fires the shortcut when its lone modifier is pressed and released by itself', () => {
    // Arrange
    const fake = createFakeUiohook()
    const engine = createUiohookShortcutEngine(() => fake.module)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: press and release the right Option key alone.
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)

    // Assert
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does not fire when another key is pressed between the modifier press and release', () => {
    // Arrange
    const fake = createFakeUiohook()
    const engine = createUiohookShortcutEngine(() => fake.module)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: Option down, a letter down (forms a chord), then Option up.
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.pressKey(LETTER_B_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)

    // Assert: the intervening key disarmed the lone-modifier candidate.
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not fire after the binding is unregistered', () => {
    // Arrange
    const fake = createFakeUiohook()
    const engine = createUiohookShortcutEngine(() => fake.module)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act
    engine.unregister('toggleBrainDump')
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)

    // Assert
    expect(callback).not.toHaveBeenCalled()
  })

  it('rebinds an id to a new modifier without the old key still firing it', () => {
    // Arrange
    const fake = createFakeUiohook()
    const engine = createUiohookShortcutEngine(() => fake.module)
    const callback = vi.fn()
    engine.register('rightOption', 'toggleBrainDump', callback)

    // Act: rebind the same id to the LEFT Option, then press each key alone.
    engine.register('leftOption', 'toggleBrainDump', callback)
    fake.pressKey(RIGHT_OPTION_KEYCODE)
    fake.releaseKey(RIGHT_OPTION_KEYCODE)
    fake.pressKey(LEFT_OPTION_KEYCODE)
    fake.releaseKey(LEFT_OPTION_KEYCODE)

    // Assert: only the new (left) modifier fires; the old (right) one is dead.
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('starts the global tap on the first bind and stops it after the last unbind', () => {
    // Arrange
    const fake = createFakeUiohook()
    const engine = createUiohookShortcutEngine(() => fake.module)

    // Act + Assert: first bind starts the tap.
    engine.register('rightOption', 'toggleBrainDump', vi.fn())
    expect(fake.start).toHaveBeenCalledTimes(1)
    expect(fake.stop).not.toHaveBeenCalled()

    // Removing the last binding stops it (the app releases the global hook).
    engine.unregister('toggleBrainDump')
    expect(fake.stop).toHaveBeenCalledTimes(1)
  })
})
