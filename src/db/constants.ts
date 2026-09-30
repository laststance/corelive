/**
 * PostgreSQL SQLSTATE codes CoreLive branches on.
 *
 * The former ORM reported these as `P2002` / `P2003`; node-postgres reports the raw
 * SQLSTATE, and drizzle-orm wraps it in `DrizzleQueryError.cause`.
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PG_UNIQUE_VIOLATION = '23505'
export const PG_FOREIGN_KEY_VIOLATION = '23503'

/** Upper bound on `.cause` hops walked by `isPgError`, so a cyclic chain can never loop forever. */
export const MAX_ERROR_CAUSE_DEPTH = 8
