import { readFileSync } from 'node:fs'
import path from 'node:path'

import { sql } from 'drizzle-orm'

import type { db } from '@/db'

/** The query lives in a plain SQL file so the production baseline script, which cannot import TypeScript, runs the very same text. */
const SCHEMA_FINGERPRINT_SQL_PATH = path.resolve(
  process.cwd(),
  'scripts',
  'schema-fingerprint.sql',
)

/**
 * Serializes the `public` schema (columns with physical position and type modifiers, indexes, named constraints), so two databases, or one database before and after an operation, can be compared with a string equality.
 *
 * The previous ORM's own history table `_prisma_migrations` is left out everywhere: it exists only in databases that ORM built, and is not part of the application schema.
 * Called by the schema-parity test (drizzle-built database vs. the committed fingerprint of the previous ORM's schema) and by the baseline-migration test (before/after `migrate`). The query text is `scripts/schema-fingerprint.sql`, shared with `scripts/baseline-drizzle-migrations.mjs`.
 *
 * @param executor - Anything with `execute`: the shared {@link db}, a transaction, or a client wired for a one-off script.
 * @returns One line per column, index and constraint, sorted by code unit (independent of the server's collation) and joined with `\n`.
 * @example
 * const fingerprint = await fingerprintPublicSchema(db)
 */
export async function fingerprintPublicSchema(
  executor: Pick<typeof db, 'execute'>,
): Promise<string> {
  const { rows } = await executor.execute<{ item: string }>(
    sql.raw(readFileSync(SCHEMA_FINGERPRINT_SQL_PATH, 'utf8')),
  )
  return rows
    .map((row) => row.item)
    .sort()
    .join('\n')
}
