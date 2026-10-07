/**
 * Builds the URL the heatmap day-dialog selection should mirror into the address
 * bar, preserving any other query params. Powers ContributionGraph's OUTBOUND
 * `?date=` sync (open / day-nav ← → / close → URL) so the open day is shareable
 * and back-button-navigable; the INBOUND counterpart (`/home?date=YYYY-MM-DD`
 * opens the dialog) already exists. Kept pure (no `window` access — the caller
 * passes the current location parts) so the param-preservation is unit-tested
 * and the function never thrashes by rewriting an already-correct URL.
 * @param currentSearch - `window.location.search` (may be `''` or start with `?`)
 * @param pathname - `window.location.pathname` (no query string)
 * @param date - The selected day as `YYYY-MM-DD`, or `null` when the dialog is closed
 * @returns
 * - `${pathname}?${params}` with `date` set, when a day is selected
 * - `${pathname}` (no query) when `date` is null and no other params remain
 * - other params preserved, and `date` replaced in place, in every case
 * @example
 * buildDateSyncUrl('', '/home', '2026-05-10')                  // => '/home?date=2026-05-10'
 * buildDateSyncUrl('?date=2026-05-01', '/home', '2026-05-10')  // => '/home?date=2026-05-10'
 * buildDateSyncUrl('?date=2026-05-10', '/home', null)          // => '/home'
 * buildDateSyncUrl('?tab=year', '/home', '2026-05-10')         // => '/home?tab=year&date=2026-05-10'
 * buildDateSyncUrl('?tab=year&date=2026-05-10', '/home', null) // => '/home?tab=year'
 */
export function buildDateSyncUrl(
  currentSearch: string,
  pathname: string,
  date: string | null,
): string {
  const params = new URLSearchParams(currentSearch)
  // set() replaces an existing `date` in place; delete() drops it entirely so a
  // closed dialog leaves no stale param. Other keys are untouched either way.
  if (date) {
    params.set('date', date)
  } else {
    params.delete('date')
  }
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
