/**
 * Clamps a raw config value to [min, max]; returns defaultValue for non-finite
 * or non-positive inputs (NaN, 0, negative, undefined). Called at window
 * creation time to sanitize persisted width/height from config.json.
 *
 * @param value - Raw value from config (may be NaN, negative, or missing).
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @param defaultValue - Fallback for invalid inputs.
 * @returns Clamped integer in [min, max], or defaultValue.
 * @example
 * clampDimension(500, 320, 800, 360)   // => 500
 * clampDimension(99999, 320, 800, 360) // => 800
 * clampDimension(NaN, 320, 800, 360)   // => 360
 * clampDimension(-1, 320, 800, 360)    // => 360
 */
export function clampDimension(
  value: unknown,
  min: number,
  max: number,
  defaultValue: number,
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue
  return Math.min(Math.max(Math.round(parsed), min), max)
}
