/** Reads quoted config values for token resolution and CSS synchronization without executing the config.
 * @param source - The text inside a colors or border-radius object.
 * @returns Statically declared string values keyed by their config names.
 * @example parseConfigStringEntries("primary: 'var(--primary)'")
 */
export function parseConfigStringEntries(
  source: string,
): Record<string, string> {
  const values: Record<string, string> = {}
  const pairs = source.matchAll(
    /['"]?([a-zA-Z0-9_-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g,
  )
  for (const [, key, value] of pairs) {
    // Malformed entries have no complete key/value pair to retain.
    if (key !== undefined && value !== undefined) values[key] = value
  }
  return values
}
