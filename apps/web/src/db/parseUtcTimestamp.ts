/**
 * Converts a raw `timestamp without time zone` value from a `db.execute()` row into a UTC `Date`.
 *
 * drizzle's node-postgres session hands TIMESTAMP columns through as strings
 * (`"2026-06-03 14:30:00.123"`), and builder columns convert them but raw `sql`
 * rows do not. Every timestamp column in this schema stores UTC wall-clock
 * time, so the string is read as UTC — never as the server's local zone.
 *
 * @param value - Text form of a `timestamp(3)` column, with a space or `T` separator and optional fraction.
 * @returns The UTC instant the string denotes.
 * @throws {Error} When the text is not a parseable timestamp.
 * @example
 * parseUtcTimestamp('2026-06-03 14:30:00.123') // => 2026-06-03T14:30:00.123Z, whatever TZ the process runs in
 */
export function parseUtcTimestamp(value: string): Date {
  const instant = new Date(`${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Unparseable timestamp: ${value}`)
  }
  return instant
}
