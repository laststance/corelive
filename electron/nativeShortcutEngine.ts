/**
 * @fileoverview The engine seam for native lone-modifier shortcuts — the narrow
 * interface `ShortcutManager` calls when a binding fires on a SINGLE modifier key
 * (which Electron's `globalShortcut` cannot express). A concrete engine owns a
 * system-wide key tap (the uiohook-napi adapter, or a signed helper binary) and
 * maps each `LoneModifierId` to a platform keycode; this module stays
 * engine-agnostic so the recognizer can be swapped without touching routing.
 *
 * The DEFAULT engine is {@link createUnavailableNativeShortcutEngine}: every
 * method is a no-op that reports unavailable, so when no tap is wired (or it
 * fails to load / lacks Accessibility permission) native binds register `false`
 * and the caller degrades to a chord — existing accelerator behavior is untouched.
 *
 * @module electron/nativeShortcutEngine
 */

import type { LoneModifierId } from './nativeBinding'

/**
 * A swappable recognizer for lone-modifier key taps. A concrete implementation
 * (uiohook adapter / signed helper) holds the OS-level event tap and invokes the
 * stored callback when its modifier is pressed alone; `ShortcutManager` treats it
 * as an opaque registrar parallel to `globalShortcut`.
 */
export interface NativeShortcutEngine {
  /**
   * Whether the tap can actually run right now — the native module loaded AND
   * the process holds (or can obtain) macOS Accessibility/Input-Monitoring
   * permission. `false` routes the caller to the degrade-to-chord fallback
   * instead of silently registering a binding that can never fire.
   */
  isAvailable(): boolean

  /**
   * Binds a lone modifier to a callback under a stable shortcut id.
   * @param modifier - The canonical lone-modifier id to listen for.
   * @param id - The shortcut id this binding belongs to (e.g. `toggleBrainDump`).
   * @param callback - Invoked when the modifier is pressed alone.
   * @returns
   * - `true` when the tap accepted the binding
   * - `false` when the engine is unavailable or the bind was rejected
   */
  register(modifier: LoneModifierId, id: string, callback: () => void): boolean

  /**
   * Removes the binding for a shortcut id.
   * @param id - The shortcut id to unbind.
   * @returns
   * - `true` when a binding existed and was removed
   * - `false` when no binding was registered under that id
   */
  unregister(id: string): boolean

  /** Removes every binding and releases the tap (called on cleanup/disable). */
  unregisterAll(): void
}

/**
 * Builds the default no-op engine used whenever no native tap is wired or the
 * tap cannot run; every method reports unavailable so lone-modifier binds fail
 * cleanly into the chord fallback and never throw.
 * @returns A `NativeShortcutEngine` that is permanently unavailable.
 * @example
 * const engine = createUnavailableNativeShortcutEngine()
 * engine.isAvailable()                       // => false
 * engine.register('rightOption', 'x', noop)  // => false
 */
export function createUnavailableNativeShortcutEngine(): NativeShortcutEngine {
  return {
    isAvailable: () => false,
    register: () => false,
    unregister: () => false,
    unregisterAll: () => {},
  }
}
