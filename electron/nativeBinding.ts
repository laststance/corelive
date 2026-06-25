/**
 * @fileoverview Native lone-modifier binding model — the engine-agnostic source
 * of truth for shortcuts that fire on a SINGLE modifier key (e.g. Right Option
 * alone), which Electron's `globalShortcut`/Accelerator cannot express (it only
 * binds modifier+key chords and can't tell left from right — confirmed against
 * the Electron docs). A lone-modifier binding is persisted as a compat STRING in
 * the same `ShortcutConfig` map as accelerators, marked by a sentinel prefix so
 * it round-trips through config + IPC unchanged, then parsed here into a
 * structured shape for the native tap recognizer. Centralizing the format stops
 * the raw sentinel from leaking into the tray menu, the display formatter, or the
 * conflict read-back. The tap ENGINE (uiohook adapter / signed helper) maps each
 * id to a platform keycode separately — this module stays engine-agnostic.
 *
 * @module electron/nativeBinding
 */

/**
 * Canonical lone-modifier ids: left/right × Option (⌥) / Control (⌃) /
 * Shift (⇧) / Command (⌘). The `as const` tuple is the single source of truth —
 * `LoneModifierId`, the display map, and any recognizer keycode table all derive
 * from it so the id union can never drift from its consumers.
 */
export const LONE_MODIFIER_IDS = [
  'leftOption',
  'rightOption',
  'leftControl',
  'rightControl',
  'leftShift',
  'rightShift',
  'leftCommand',
  'rightCommand',
] as const

/** A single modifier key that can be bound on its own (no accompanying key). */
export type LoneModifierId = (typeof LONE_MODIFIER_IDS)[number]

/** Structured form of a native lone-modifier binding (the parse result). */
export interface LoneModifierBinding {
  kind: 'lone-modifier'
  modifier: LoneModifierId
}

/**
 * Sentinel prefix marking a `ShortcutConfig` value as a native lone-modifier
 * binding rather than an Electron accelerator. Electron accelerators are
 * `+`-separated modifier/key tokens and never contain a colon, so this prefix
 * cannot collide with a real accelerator.
 */
export const NATIVE_BINDING_PREFIX = 'lone-modifier:'

/** Lone-modifier id → macOS display label (side word + modifier glyph). */
export const LONE_MODIFIER_DISPLAY: Record<LoneModifierId, string> = {
  leftOption: 'Left ⌥',
  rightOption: 'Right ⌥',
  leftControl: 'Left ⌃',
  rightControl: 'Right ⌃',
  leftShift: 'Left ⇧',
  rightShift: 'Right ⇧',
  leftCommand: 'Left ⌘',
  rightCommand: 'Right ⌘',
}

/**
 * Builds the persisted compat string for a lone-modifier binding.
 * @param modifier - The canonical lone-modifier id to bind.
 * @returns The sentinel-prefixed string stored in `ShortcutConfig`.
 * @example
 * createNativeBinding('rightOption') // => 'lone-modifier:rightOption'
 */
export function createNativeBinding(modifier: LoneModifierId): string {
  return `${NATIVE_BINDING_PREFIX}${modifier}`
}

/**
 * Whether a `ShortcutConfig` value is a native lone-modifier binding (vs an
 * Electron accelerator or the empty/disabled string). A cheap prefix test used
 * to route registration, display, and conflict checks down the native path.
 * @param value - A persisted shortcut value (accelerator or native binding).
 * @returns
 * - `true` when the value carries the native sentinel prefix
 * - `false` for accelerators and empty strings
 * @example
 * isNativeBinding('lone-modifier:rightOption') // => true
 * isNativeBinding('CommandOrControl+B')        // => false
 */
export function isNativeBinding(value: string): boolean {
  return value.startsWith(NATIVE_BINDING_PREFIX)
}

/**
 * Parses a persisted value into a structured lone-modifier binding, validating
 * the id against the canonical tuple so a corrupt config / IPC string cannot
 * inject an unknown modifier. The `find` over the SSoT tuple both validates and
 * narrows the type, so no `as` cast is needed.
 * @param value - A persisted shortcut value.
 * @returns
 * - the structured `LoneModifierBinding` when the value is a native binding with a known id
 * - `null` when the value is an accelerator, or a native binding with an unknown id
 * @example
 * parseNativeBinding('lone-modifier:rightOption') // => { kind: 'lone-modifier', modifier: 'rightOption' }
 * parseNativeBinding('CommandOrControl+B')         // => null
 * parseNativeBinding('lone-modifier:bogus')        // => null
 */
export function parseNativeBinding(value: string): LoneModifierBinding | null {
  if (!isNativeBinding(value)) return null
  const rawModifier = value.slice(NATIVE_BINDING_PREFIX.length)
  const modifier = LONE_MODIFIER_IDS.find((id) => id === rawModifier)
  if (modifier === undefined) return null
  return { kind: 'lone-modifier', modifier }
}

/**
 * Renders any shortcut value for human display: a native lone-modifier binding
 * becomes its macOS label; anything else (accelerator, empty string) is returned
 * unchanged so callers can pass every binding kind through one formatter without
 * the raw sentinel ever surfacing in the tray menu or settings.
 * @param value - A persisted shortcut value.
 * @returns
 * - the macOS label (e.g. `Right ⌥`) for a known native binding
 * - the input string unchanged for accelerators, empty, or unknown-id natives
 * @example
 * formatNativeBindingForDisplay('lone-modifier:rightOption') // => 'Right ⌥'
 * formatNativeBindingForDisplay('CommandOrControl+B')         // => 'CommandOrControl+B'
 */
export function formatNativeBindingForDisplay(value: string): string {
  const binding = parseNativeBinding(value)
  if (binding === null) return value
  return LONE_MODIFIER_DISPLAY[binding.modifier]
}
