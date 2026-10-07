/**
 * Compares two accelerators the way Electron resolves them — case-insensitive
 * and ignoring surrounding whitespace — so a duplicate guard cannot be slipped
 * past with `alt+space` vs `Alt+Space` (e.g. from a hand-edited config.json).
 * An empty/absent accelerator means "unset" and never matches anything.
 *
 * @param left - Accelerator to compare, or a non-string when the slot is unset.
 * @param right - Accelerator to compare against.
 * @returns
 * - `true` when both name the same non-empty accelerator
 * - `false` when either is empty, missing, or they differ
 * @example
 * isSameAccelerator('Alt+Space', ' alt+space ') // => true
 * isSameAccelerator('Alt+Space', 'Control+3')   // => false
 * isSameAccelerator('', '')                     // => false
 */
export function isSameAccelerator(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false

  const normalizedLeft = left.trim().toLowerCase()
  // An unset slot is not a duplicate of another unset slot.
  if (normalizedLeft === '') return false

  return normalizedLeft === right.trim().toLowerCase()
}
