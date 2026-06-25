/**
 * @fileoverview The uiohook-napi adapter — a concrete {@link NativeShortcutEngine}
 * that recognizes a lone modifier (e.g. Right ⌥ alone) via a system-wide
 * libuiohook key tap, the path Electron's `globalShortcut` can't take. It owns a
 * small press/release state machine so a modifier counts as "pressed alone" only
 * when nothing else intervened, and lazily starts/stops the global tap around the
 * first/last binding. The native module is INJECTED (a loader thunk) so the
 * adapter unit-tests with a fake and `main.ts` supplies the real `require`.
 *
 * macOS needs Accessibility/Input-Monitoring (TCC) permission for the tap to
 * deliver events; `isAvailable()` only reports that the module LOADED — whether
 * events actually flow is proven at runtime (and on a signed build), which is why
 * a lone-modifier bind degrades to a chord if the tap stays silent.
 *
 * @module electron/uiohookEngine
 */

import { log } from './logger'
import type { LoneModifierId } from './nativeBinding'
import type { NativeShortcutEngine } from './nativeShortcutEngine'

/**
 * Lone-modifier id → libuiohook keycode (left/right distinct). Values are the
 * `UiohookKey` constants — a data table, not inline magic numbers.
 */
const LONE_MODIFIER_KEYCODES: Record<LoneModifierId, number> = {
  leftOption: 0x0038, // UiohookKey.Alt
  rightOption: 0x0e38, // UiohookKey.AltRight
  leftControl: 0x001d, // UiohookKey.Ctrl
  rightControl: 0x0e1d, // UiohookKey.CtrlRight
  leftShift: 0x002a, // UiohookKey.Shift
  rightShift: 0x0036, // UiohookKey.ShiftRight
  leftCommand: 0x0e5b, // UiohookKey.Meta
  rightCommand: 0x0e5c, // UiohookKey.MetaRight
}

/** A keyboard event from libuiohook — only the keycode is needed here. */
export interface UiohookKeyboardEvent {
  keycode: number
}

/**
 * The slice of the `uiohook-napi` `uIOhook` singleton this adapter drives — kept
 * minimal so a test fake is a few lines and the adapter never hard-depends on the
 * native module's full surface.
 */
export interface UiohookModule {
  on(
    event: 'keydown' | 'keyup',
    listener: (uiohookEvent: UiohookKeyboardEvent) => void,
  ): void
  start(): void
  stop(): void
}

/** One registered lone-modifier binding: which shortcut id, and what to fire. */
interface KeycodeBinding {
  id: string
  callback: () => void
}

/**
 * Build the uiohook-backed native engine. The loader is called ONCE; if it
 * returns `null` (module missing / wrong arch / load threw) the engine is
 * permanently unavailable and every op is a safe no-op, so callers degrade to a
 * chord exactly as with {@link createUnavailableNativeShortcutEngine}.
 * @param loadUiohook - Thunk returning the `uIOhook` singleton, or `null` on failure.
 * @returns A {@link NativeShortcutEngine} backed by the global key tap.
 * @example
 * const engine = createUiohookShortcutEngine(() => {
 *   try { return require('uiohook-napi').uIOhook } catch { return null }
 * })
 */
export function createUiohookShortcutEngine(
  loadUiohook: () => UiohookModule | null,
): NativeShortcutEngine {
  const uiohook = safeLoad(loadUiohook)

  // id → keycode and keycode → binding, kept in lockstep so unregister can find
  // a binding by id while the tap dispatches by keycode.
  const keycodeById = new Map<string, number>()
  const bindingByKeycode = new Map<number, KeycodeBinding>()

  // Press/release tracking for the "pressed alone" rule.
  const pressedKeycodes = new Set<number>()
  let armedKeycode: number | null = null

  // The tap is started lazily on the first bind and stopped on the last, so the
  // app holds no global hook (and triggers no permission prompt) until needed.
  let isTapRunning = false

  /** Fire a lone-modifier callback without letting a throw kill the tap. */
  const invokeBindingSafely = (binding: KeycodeBinding): void => {
    try {
      binding.callback()
    } catch (error) {
      log.error(`[uiohookEngine] Shortcut callback ${binding.id} threw:`, error)
    }
  }

  // A modifier "pressed alone" = it became the SOLE key down, and stayed armed
  // (no other key pressed) until its own release. Any other key-down disarms it.
  const handleKeyDown = (uiohookEvent: UiohookKeyboardEvent): void => {
    const keycode = uiohookEvent.keycode
    pressedKeycodes.add(keycode)
    armedKeycode =
      pressedKeycodes.size === 1 && bindingByKeycode.has(keycode)
        ? keycode
        : null
  }

  const handleKeyUp = (uiohookEvent: UiohookKeyboardEvent): void => {
    const keycode = uiohookEvent.keycode
    // Commit only when the still-armed modifier is the key being released.
    if (armedKeycode === keycode) {
      const binding = bindingByKeycode.get(keycode)
      armedKeycode = null
      pressedKeycodes.delete(keycode)
      if (binding) invokeBindingSafely(binding)
      return
    }
    pressedKeycodes.delete(keycode)
  }

  /** Attach listeners + start the tap once; on failure the engine stays silent. */
  const ensureTapRunning = (): void => {
    if (uiohook === null || isTapRunning) return
    try {
      uiohook.on('keydown', handleKeyDown)
      uiohook.on('keyup', handleKeyUp)
      uiohook.start()
      isTapRunning = true
      log.info('[uiohookEngine] Global key tap started')
    } catch (error) {
      log.error('[uiohookEngine] Failed to start global key tap:', error)
    }
  }

  /** Stop the tap when no bindings remain so the app releases the global hook. */
  const stopTapIfIdle = (): void => {
    if (uiohook === null || !isTapRunning || bindingByKeycode.size > 0) return
    try {
      uiohook.stop()
    } catch (error) {
      log.error('[uiohookEngine] Failed to stop global key tap:', error)
    }
    isTapRunning = false
    pressedKeycodes.clear()
    armedKeycode = null
  }

  return {
    isAvailable: () => uiohook !== null,

    register: (
      modifier: LoneModifierId,
      id: string,
      callback: () => void,
    ): boolean => {
      if (uiohook === null) return false

      // Drop any prior binding for this id before re-binding it.
      const previousKeycode = keycodeById.get(id)
      if (previousKeycode !== undefined)
        bindingByKeycode.delete(previousKeycode)

      const keycode = LONE_MODIFIER_KEYCODES[modifier]
      keycodeById.set(id, keycode)
      bindingByKeycode.set(keycode, { id, callback })
      ensureTapRunning()
      return true
    },

    unregister: (id: string): boolean => {
      const keycode = keycodeById.get(id)
      if (keycode === undefined) return false
      keycodeById.delete(id)
      bindingByKeycode.delete(keycode)
      stopTapIfIdle()
      return true
    },

    unregisterAll: (): void => {
      keycodeById.clear()
      bindingByKeycode.clear()
      stopTapIfIdle()
    },
  }
}

/**
 * Run the injected loader, downgrading ANY failure (throw or null) to `null` so
 * construction never throws and the engine simply reports unavailable.
 * @param loadUiohook - The native-module loader thunk.
 * @returns The loaded module, or `null` when it could not be loaded.
 */
function safeLoad(
  loadUiohook: () => UiohookModule | null,
): UiohookModule | null {
  try {
    return loadUiohook()
  } catch (error) {
    log.warn(
      '[uiohookEngine] uiohook-napi unavailable; lone-modifier shortcuts disabled:',
      error,
    )
    return null
  }
}
