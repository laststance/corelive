/**
 * Copy and formatting helpers for the Account section and the Sync details page (#216 DA3-DA7).
 *
 * Kept as pure functions so the exact wording lives in one place and tests can assert it.
 *
 * @module accountCopy
 */

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/**
 * Formats a past moment relative to now, for "checked <relative>" (DA3).
 *
 * @param at - Epoch milliseconds of the last complete sync pass.
 * @param now - Epoch milliseconds to measure from.
 * @returns "just now", "5 minutes ago", "3 hours ago" or "yesterday" style text.
 * @example
 * formatRelativeTime(Date.now() - 5 * 60_000, Date.now()) // "5 minutes ago"
 */
export function formatRelativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return RELATIVE.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return RELATIVE.format(-hours, 'hour')
  return RELATIVE.format(-Math.round(hours / 24), 'day')
}

/**
 * Counts keeps with a correct singular ("1 keep", "3 keeps").
 *
 * @param count - Number of keeps.
 * @returns The counted phrase.
 * @example keepsPhrase(1) // "1 keep"
 */
export function keepsPhrase(count: number): string {
  return count === 1 ? '1 keep' : `${count} keeps`
}

/**
 * The "changes need a look" link text of DA3.
 *
 * @param count - Number of "Needs a look" rows (above 0).
 * @returns "1 change needs a look" or "<N> changes need a look".
 * @example needsALookLabel(2) // "2 changes need a look"
 */
export function needsALookLabel(count: number): string {
  return count === 1 ? '1 change needs a look' : `${count} changes need a look`
}

/**
 * Shortens a long email or category path in the middle, keeping both ends readable (DA13).
 *
 * @param text - Full text.
 * @param max - Longest result length before shortening.
 * @returns The text, or `head…tail` when it exceeds `max`.
 * @example middleTruncate('a-very-long-address@example.com', 16) // "a-very-…ample.com"
 */
export function middleTruncate(text: string, max = 32): string {
  if (text.length <= max) return text
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`
}

/** Display label of a Sync details field (DA7). */
export function fieldLabel(field: string): string {
  switch (field) {
    case 'name':
      return 'Name'
    case 'color':
      return 'Color'
    case 'parentLocalId':
      return 'Parent'
    case 'delete':
      return 'Removal'
    default:
      return field
  }
}
