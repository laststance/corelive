/**
 * @fileoverview The uiohook-napi adapter — a concrete {@link NativeShortcutEngine}
 * that recognizes a lone modifier (e.g. Right ⌥ alone) via a system-wide
 * libuiohook key tap, the path Electron's `globalShortcut` can't take. It owns a
 * small press/release state machine so a modifier counts as "pressed alone" only
 * when nothing else intervened, and lazily starts/stops the global tap around the
 * first/last binding. The native module is INJECTED (a loader thunk) so the
 * adapter unit-tests with a fake and `main.ts` supplies the real `require`.
 *
 * Freeze-safety (#125): the tap stays in the main process (a `utilityProcess`
 * child proved non-viable on macOS — a CGEventTap with no Cocoa run loop delivers
 * one event then goes silent). Instead the adapter (a) dispatches the toggle via
 * `setImmediate` so heavy window work never runs on the tap's emit path, (b)
 * exposes `reArm()` to revive a possibly-silent tap on sleep/wake without
 * duplicating listeners (attached once, ever), and (c) wraps `start()` in a
 * brick-proof launch latch so a tap that crashes/wedges during arming starts
 * INACTIVE next launch instead of re-bricking.
 *
 * macOS needs Accessibility/Input-Monitoring (TCC) permission for the tap to
 * deliver events; `isAvailable()` only reports that the module LOADED — whether
 * events actually flow is proven at runtime (and on a signed build), which is why
 * a lone-modifier bind degrades to a chord if the tap stays silent.
 *
 * @module electron/uiohookEngine
 */

import { NATIVE_TAP_STABILITY_WINDOW_MS } from './constants'
import { log } from './logger'
import type { LoneModifierId } from './nativeBinding'
import type { NativeShortcutEngine } from './nativeShortcutEngine'
import {
  defaultNativeTapLatch,
  type NativeTapLatch,
} from './utils/nativeTapLatch'

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
 * @param latch - Injectable brick-proof latch (#125); defaults to the fsync-backed
 *   marker file. Tests pass an in-memory fake to drive the latch-blocked path.
 * @returns A {@link NativeShortcutEngine} backed by the global key tap.
 * @example
 * const engine = createUiohookShortcutEngine(() => {
 *   try { return require('uiohook-napi').uIOhook } catch { return null }
 * })
 */
export function createUiohookShortcutEngine(
  loadUiohook: () => UiohookModule | null,
  latch: NativeTapLatch = defaultNativeTapLatch,
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

  // Listeners are attached EXACTLY ONCE, ever (codex #4). They used to be added
  // inside the start path; a reArm() (stop+start) would then stack duplicate
  // keydown/keyup listeners and fire each binding twice (then thrice, …).
  let listenersAttached = false

  // Brick-proof launch latch (#125): clear-after-stability timer, and whether a
  // PRIOR launch armed the tap but never confirmed (→ start INACTIVE this run).
  let stabilityTimer: ReturnType<typeof setTimeout> | null = null
  let blockedByStaleLatch = uiohook !== null && latch.isSet()
  if (blockedByStaleLatch) {
    log.warn(
      '[uiohookEngine] freeze-safety latch set from a prior unconfirmed arming — tap starts INACTIVE until re-enabled',
    )
  }

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
      // Schedule the toggle off the tap's dispatch path (codex #1): heavy window
      // work must NOT run synchronously where the native thread delivers events.
      // `setImmediate` defers to the next main-loop tick — NOT a microtask, which
      // would still drain on this tick. (This shrinks, not removes, the wedge
      // surface — a hang INSIDE the callback still freezes main; see AC#3.)
      if (binding)
        setImmediate(() => {
          // Re-resolve at fire time (codex #3): an unregister / unregisterAll /
          // rebind between this tick and the next must cancel a now-stale
          // callback. Fire ONLY if this exact binding is still the live one for
          // the keycode — a replaced or removed binding bails.
          if (bindingByKeycode.get(keycode) === binding)
            invokeBindingSafely(binding)
        })
      return
    }
    pressedKeycodes.delete(keycode)
  }

  /** Wire keydown/keyup to the singleton exactly once for the engine's lifetime. */
  const attachListenersOnce = (): void => {
    if (uiohook === null || listenersAttached) return
    uiohook.on('keydown', handleKeyDown)
    uiohook.on('keyup', handleKeyUp)
    listenersAttached = true
  }

  /** Drop in-flight pressed-alone state (used around reArm and on suspend/lock). */
  const resetPressedState = (): void => {
    pressedKeycodes.clear()
    armedKeycode = null
  }

  /**
   * Clear the latch marker once the tap has run a stability window without
   * crashing/wedging the process. A crash/wedge before this fires leaves the
   * marker set → next launch starts INACTIVE (the brick-loop break).
   */
  const scheduleLatchClear = (): void => {
    if (stabilityTimer) clearTimeout(stabilityTimer)
    stabilityTimer = setTimeout(() => {
      stabilityTimer = null
      latch.clear()
    }, NATIVE_TAP_STABILITY_WINDOW_MS)
    stabilityTimer.unref()
  }

  /**
   * Arm the brick-guard, attach listeners once, start the tap, schedule the
   * latch clear. Shared by the first lazy start and every reArm so the
   * freeze-safety wrapper is identical on each (re)start.
   * @returns `true` when the tap is running; `false` if the latch couldn't be
   *   armed (refuse to start unguarded) or `start()` threw.
   */
  const startTapGuarded = (): boolean => {
    if (uiohook === null) return false
    // Persist the brick-guard BEFORE start(); a freeze with no on-disk guard
    // would brick the next launch, so refuse to start if it didn't land.
    if (!latch.arm()) {
      log.error(
        '[uiohookEngine] could not arm freeze-safety latch; refusing to start tap',
      )
      return false
    }
    attachListenersOnce()
    try {
      uiohook.start()
      isTapRunning = true
      scheduleLatchClear()
      return true
    } catch (error) {
      log.error('[uiohookEngine] Failed to start global key tap:', error)
      // A synchronous start() failure is not a freeze — clear the guard so the
      // next launch isn't falsely blocked.
      latch.clear()
      return false
    }
  }

  /**
   * Attach listeners + start the tap once.
   * @returns `true` when the tap is running (already running, or just started);
   *   `false` when the module is absent or `start()` threw — the caller then rolls
   *   the binding back so the lone-modifier shortcut degrades to a chord.
   */
  const ensureTapRunning = (): boolean => {
    if (uiohook === null) return false
    if (isTapRunning) return true
    const started = startTapGuarded()
    if (started) log.info('[uiohookEngine] Global key tap started')
    return started
  }

  /** Stop the tap when no bindings remain so the app releases the global hook. */
  const stopTapIfIdle = (): void => {
    if (uiohook === null || !isTapRunning || bindingByKeycode.size > 0) return
    // Stop FIRST. A thrown stop() leaves the old tap in an UNKNOWN state, so bail
    // WITHOUT flipping isTapRunning or clearing the brick-guard (codex review):
    // keeping isTapRunning=true makes a later register() see the tap as still up
    // and skip a second start() — the same double-start reArm() already avoids.
    try {
      uiohook.stop()
    } catch (error) {
      log.error('[uiohookEngine] Failed to stop global key tap:', error)
      return
    }
    // Clean stop only — now safe to drop the stability timer, mark the tap down,
    // reset pressed-state, and clear the brick-guard (a confirmed-healthy session).
    if (stabilityTimer) {
      clearTimeout(stabilityTimer)
      stabilityTimer = null
    }
    isTapRunning = false
    resetPressedState()
    latch.clear()
  }

  return {
    isAvailable: () => uiohook !== null,

    isLatchBlocked: () => blockedByStaleLatch,

    clearLatchBlock: () => {
      blockedByStaleLatch = false
    },

    register: (
      modifier: LoneModifierId,
      id: string,
      callback: () => void,
    ): boolean => {
      if (uiohook === null) return false
      // #125: a prior unconfirmed arming → do NOT re-arm (possible brick loop).
      // The caller reads isLatchBlocked() to bind INACTIVE + offer re-enable.
      if (blockedByStaleLatch) return false

      // Drop any prior binding for this id before re-binding it.
      const previousKeycode = keycodeById.get(id)
      if (previousKeycode !== undefined)
        bindingByKeycode.delete(previousKeycode)

      const keycode = LONE_MODIFIER_KEYCODES[modifier]
      keycodeById.set(id, keycode)
      bindingByKeycode.set(keycode, { id, callback })

      // If the tap can't start, roll the binding back and report failure so
      // ShortcutManager treats it as unregistered and degrades to a chord —
      // rather than recording a native bind that can never fire.
      if (!ensureTapRunning()) {
        keycodeById.delete(id)
        bindingByKeycode.delete(keycode)
        return false
      }
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

    reArm: (): void => {
      // Revive a possibly-silent tap (resume / unlock-screen / manual re-enable).
      // Only meaningful when a binding exists; attach-once means stop+start never
      // duplicates listeners (codex #4). Reset pressed-state on BOTH sides so a
      // modifier "held across sleep" can't leave a stale armed key (codex #5).
      if (uiohook === null || bindingByKeycode.size === 0) return
      resetPressedState()
      // Stop the old tap FIRST. If stop() throws, the old singleton's state is
      // unknown — starting again could double-start a CGEventTap (codex #4). Bail
      // BEFORE touching the stability timer / isTapRunning so state stays exactly
      // as it was; the still-armed latch self-heals on a later clean stop / next
      // launch rather than this turning a stop failure into a double-start.
      if (isTapRunning) {
        try {
          uiohook.stop()
        } catch (error) {
          log.error(
            '[uiohookEngine] stop during re-arm failed; skipping restart to avoid double-start:',
            error,
          )
          return
        }
      }
      // Stop succeeded (or the tap wasn't running) — now safe to drop the old
      // stability timer and re-arm a fresh tap.
      if (stabilityTimer) {
        clearTimeout(stabilityTimer)
        stabilityTimer = null
      }
      isTapRunning = false
      if (startTapGuarded()) log.info('[uiohookEngine] Global key tap re-armed')
      resetPressedState()
    },

    resetPressedState,

    // RUNTIME truth for the renderer's `active` flag (#125 codex review): a
    // binding is registered AND the tap is actually running. After a failed
    // reArm() the binding map is still populated but `isTapRunning` is false, so
    // this correctly reports inactive while registration intent persists.
    isActive: () => isTapRunning && bindingByKeycode.size > 0,
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
