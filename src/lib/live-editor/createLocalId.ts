/** Creates identifiers for local keeps and merge batches, including browsers without secure-context UUIDs.
 * @returns A UUID when available, otherwise a time-and-random local identifier.
 * @example createLocalId()
 */
export function createLocalId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  // Local-only fallback preserves capture on insecure LAN development origins.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
