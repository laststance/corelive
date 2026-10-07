/**
 * The viewer's IANA zone, reported with every heatmap query so the server
 * buckets completions by the user's *local* calendar day (L3). One helper so
 * every call site spells the zone identically — a second inline `Intl` call is
 * how an optimistic cache write and its reader drift onto different query keys.
 * @returns The browser's resolved zone; the render environment's zone during SSR.
 * @example
 * getViewerTimeZone() // => 'Asia/Tokyo'
 */
export function getViewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
