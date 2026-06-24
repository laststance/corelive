/**
 * @fileoverview Re-register one global toggle accelerator, rejecting a silently
 * substituted fallback as a conflict (§6e Design B). Shared by the BrainDump and
 * Floating Navigator set-shortcut IPC handlers in `main.ts`.
 *
 * @module electron/utils/applyShortcutRebind
 */

/**
 * The slice of `ShortcutManager` this helper drives — kept minimal so the unit
 * test can stand in with a two-method mock and so the helper never imports the
 * full manager.
 */
export interface ShortcutRebinder {
  /** Persist + (re)register the given accelerators; false when a global one failed to bind. */
  updateShortcuts(shortcuts: Record<string, string>): boolean
  /** Map of shortcut id → the accelerator ACTUALLY bound (a fallback differs from the request). */
  getRegisteredShortcuts(): Record<string, string>
}

/**
 * Re-register one global toggle accelerator and report whether it bound EXACTLY
 * as requested. `ShortcutManager.updateShortcuts` returns `true` even when
 * `handleShortcutConflict` SILENTLY swapped in a fallback accelerator, so this
 * reads the effective binding back and treats any substitution as a conflict:
 * it restores `previous` and returns `false`, so the caller (and the Settings UI)
 * never shows a key the user did not choose. `handleShortcutConflict` itself is
 * left untouched. An empty `accelerator` ('' = intentional disable) skips the
 * read-back, since nothing is expected to be registered afterwards.
 *
 * @param rebinder - The ShortcutManager, or a structural stand-in in tests.
 * @param id - The toggle's shortcut id, e.g. `'toggleBrainDump'` or `'toggleFloatingNavigator'`.
 * @param accelerator - The requested accelerator, or `''` to disable the shortcut.
 * @param previous - The accelerator to restore when the request cannot bind cleanly.
 * @returns
 * - `true` when `accelerator` bound exactly as requested (or was an intentional `''` disable)
 * - `false` when it failed to bind or was silently substituted (then `previous` is restored)
 * @throws When even restoring `previous` fails — the helper can't honestly report
 *   a clean rollback, so it surfaces the inconsistency for the caller to log
 *   (rather than silently returning `false` with the live registration out of sync).
 * @example
 * applyShortcutRebind(sm, 'toggleFloatingNavigator', 'CommandOrControl+3', 'CommandOrControl+3') // => true
 * applyShortcutRebind(sm, 'toggleBrainDump', 'Alt+Space', 'Alt+Shift+Space') // => false when Alt+Space is taken
 */
export function applyShortcutRebind(
  rebinder: ShortcutRebinder,
  id: string,
  accelerator: string,
  previous: string,
): boolean {
  const didRegister = rebinder.updateShortcuts({ [id]: accelerator })
  if (!didRegister) {
    // Nothing (not even a fallback) bound — restore the prior accelerator so
    // config and live registration stay in sync.
    restorePreviousOrThrow(rebinder, id, previous)
    return false
  }

  // Detect a silently-substituted fallback: the effective registration differs
  // from what the user asked for. Skip when disabling ('' registers nothing).
  if (accelerator !== '') {
    const effectiveAccelerator = rebinder.getRegisteredShortcuts()[id]
    if (effectiveAccelerator !== accelerator) {
      restorePreviousOrThrow(rebinder, id, previous)
      return false
    }
  }

  return true
}

/**
 * Re-apply `previous` on the rollback path and verify it actually took, so a
 * conflict can't silently leave persisted config and the live registration out
 * of sync. `updateShortcuts({ id: '' })` (re-disable) returns `true`, so the
 * empty-`previous` case never spuriously throws.
 * @param rebinder - The ShortcutManager (or test stand-in) to restore through.
 * @param id - The toggle's shortcut id being rolled back.
 * @param previous - The accelerator to restore (`''` re-disables the shortcut).
 * @throws When `updateShortcuts` reports the restore did not bind.
 */
function restorePreviousOrThrow(
  rebinder: ShortcutRebinder,
  id: string,
  previous: string,
): void {
  if (!rebinder.updateShortcuts({ [id]: previous })) {
    throw new Error(`Failed to restore previous shortcut for ${id}`)
  }
}
