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
 * The observable health of the native tap, surfaced to the renderer so a
 * latch-blocked launch can show a "re-enable" affordance (#125). `available`
 * mirrors {@link NativeShortcutEngine.isAvailable}; `latchBlocked` mirrors
 * {@link NativeShortcutEngine.isLatchBlocked}. Kept here (next to the engine)
 * so `ShortcutManager`'s status method and the IPC layer share one shape.
 */
export interface NativeTapStatus {
  /** Whether the tap can run right now (module loaded + permission). */
  available: boolean
  /** Whether a prior unconfirmed arming is blocking a re-arm (needs manual re-enable). */
  latchBlocked: boolean
  /**
   * Whether a lone-modifier binding is actually registered and live in the tap
   * right now (codex #5). Distinct from `!latchBlocked`: a manual re-enable can
   * clear the block yet still fail to arm/start, leaving the binding inactive —
   * the renderer must not hide the recovery affordance in that case.
   */
  active: boolean
}

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

  /**
   * Whether a prior launch armed this tap but never confirmed stability (the
   * brick-proof launch latch is still set — #125). `true` means {@link register}
   * will refuse to start the tap; the caller binds the shortcut INACTIVE and
   * offers a manual re-enable instead of re-arming a possible brick loop.
   */
  isLatchBlocked(): boolean

  /**
   * Clear the latch-block state so the next {@link register} may arm the tap —
   * the manual "re-enable" path taken after a latch-blocked launch.
   */
  clearLatchBlock(): void

  /**
   * Stop then restart the running tap, resetting the pressed-alone state, to
   * revive a tap that may have gone silent across sleep/lock (powerMonitor
   * `resume`/`unlock-screen`) or on a manual re-enable. No-op when unavailable
   * or when no binding is active.
   */
  reArm(): void

  /**
   * Drop any in-flight pressed-alone state WITHOUT restarting the tap — used on
   * `suspend`/`lock-screen` so a modifier "held across sleep" can't leave a
   * stale pressed key that mis-fires or never re-fires after wake.
   */
  resetPressedState(): void

  /**
   * Whether the tap is LIVE right now — a binding is registered AND the OS-level
   * tap is actually running (#125 codex review). This is RUNTIME truth, distinct
   * from registration intent: after a failed {@link reArm} (stop succeeded but
   * the restart failed) a binding stays registered while the tap is down, so the
   * caller must read this — not "a binding exists" — to decide `active`, or the
   * renderer would hide the recovery affordance over a dead tap.
   */
  isActive(): boolean
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
    isLatchBlocked: () => false,
    clearLatchBlock: () => {},
    reArm: () => {},
    resetPressedState: () => {},
    isActive: () => false,
  }
}
