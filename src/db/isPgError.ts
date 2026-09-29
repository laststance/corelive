import { MAX_ERROR_CAUSE_DEPTH } from './constants'

/**
 * Tells whether a thrown value is (or wraps) a PostgreSQL error with the given SQLSTATE.
 *
 * drizzle-orm wraps every failed query in `DrizzleQueryError` and keeps the
 * driver's error in `.cause`, so a bare `error.code === '23505'` never matches.
 * Every catch site that used to test an ORM-specific `P2002` / `P2003` code calls this instead.
 * Never surface `error.message` to clients: the wrapper embeds the SQL and the bound params.
 *
 * @param error - Anything a `catch` clause received.
 * @param code - SQLSTATE to look for, e.g. {@link PG_UNIQUE_VIOLATION}.
 * @returns
 * - `true` when the value, or any error on its `.cause` chain, carries `code`
 * - `false` for other errors, non-objects, and chains longer than {@link MAX_ERROR_CAUSE_DEPTH}
 * @example
 * try {
 *   await db.insert(category).values(row)
 * } catch (error) {
 *   if (isPgError(error, PG_UNIQUE_VIOLATION)) return // duplicate name
 *   throw error
 * }
 */
export function isPgError(error: unknown, code: string): boolean {
  let current: unknown = error
  for (
    let depth = 0;
    depth < MAX_ERROR_CAUSE_DEPTH && typeof current === 'object' && current;
    depth++
  ) {
    if ('code' in current && current.code === code) return true
    // Step to the wrapped error (DrizzleQueryError → pg DatabaseError).
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}
