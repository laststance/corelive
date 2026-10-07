/**
 * @fileoverview Narrow an unknown value to a plain (non-array, non-null) object.
 *
 * Exists because `typeof x === 'object'` is true for `null` and arrays too, so a
 * hand-edited / corrupted config.json whose `behavior` is `[]` slips past a bare
 * typeof guard and later boots zero windows or throws on property assignment.
 * Called by ConfigManager's startup-config guards before treating a parsed JSON
 * value as a keyed record.
 *
 * @module electron/utils/isPlainObject
 */

/**
 * Type guard: true only when `value` is a plain object (excludes null & arrays).
 * Use before reading/writing keyed properties on a value parsed from untrusted
 * JSON, so an array or primitive can be rejected instead of silently mishandled.
 *
 * @param value - Any value, typically freshly parsed from disk JSON.
 * @returns
 * - true: `value` is a non-null, non-array object usable as `Record<string, unknown>`
 * - false: `value` is null, an array, or a primitive (string/number/boolean)
 * @example
 * isPlainObject({ startup: {} }) // => true
 * isPlainObject([])              // => false  (typeof [] === 'object', but rejected)
 * isPlainObject('corrupted')     // => false
 * isPlainObject(null)            // => false
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
