import { sql } from 'drizzle-orm'

import type { db } from '@/db'

/**
 * Serializes the `public` schema's columns (with physical position), indexes and constraints, so two databases, or one database before and after an operation, can be compared with a string equality.
 *
 * The previous ORM's own history table `_prisma_migrations` is left out everywhere: it exists only in databases that ORM built, and is not part of the application schema.
 * Called by the schema-parity test (drizzle-built database vs. the committed fingerprint of the previous ORM's schema) and by the baseline-migration test (before/after `migrate`).
 *
 * @param executor - Anything with `execute`: the shared {@link db}, a transaction, or a client wired for a one-off script.
 * @returns One sorted line per column, index and constraint, joined with `\n`.
 * @example
 * const fingerprint = await fingerprintPublicSchema(db)
 */
export async function fingerprintPublicSchema(
  executor: Pick<typeof db, 'execute'>,
): Promise<string> {
  const { rows } = await executor.execute<{ item: string }>(sql`
    SELECT 'column ' || table_name || '.' || column_name || ' pos=' || ordinal_position
           || ' ' || data_type || ' default=' || coalesce(column_default, '')
           || ' nullable=' || is_nullable AS item
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    UNION ALL
    SELECT 'index ' || indexdef
      FROM pg_indexes
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    UNION ALL
    SELECT 'constraint ' || conrelid::regclass::text || ' ' || pg_get_constraintdef(oid)
      FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace
       AND conrelid::regclass::text NOT LIKE '%_prisma_migrations%'
    ORDER BY 1
  `)
  return rows.map((row) => row.item).join('\n')
}
