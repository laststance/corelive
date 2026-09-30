-- Serializes the `public` schema to one line per column, index and constraint, so two databases
-- (or one database before and after an operation) can be compared. The rows come back unordered on
-- purpose: `ORDER BY` follows the server's collation, which differs between Docker and a hosted
-- database, so each consumer sorts the lines itself.
--
-- Shared by `src/test/schemaFingerprint.ts` (schema-parity and baseline tests) and
-- `scripts/baseline-drizzle-migrations.mjs` (`--apply` refuses a production schema that differs from
-- the fixture). The previous ORM's history table `_prisma_migrations` is left out everywhere: it exists
-- only in databases that ORM built and is not part of the application schema.
--
-- Columns carry every type modifier that changes what the database accepts or stores (varchar length,
-- timestamp precision, numeric precision/scale, the underlying type name) and constraints carry their
-- names, because a later migration may `DROP CONSTRAINT` by name.
SELECT 'column ' || table_name || '.' || column_name || ' pos=' || ordinal_position
       || ' ' || data_type || ' udt=' || udt_name
       || ' len=' || coalesce(character_maximum_length::text, '')
       || ' datetime_precision=' || coalesce(datetime_precision::text, '')
       || ' numeric=' || coalesce(numeric_precision::text, '') || '.' || coalesce(numeric_scale::text, '')
       || ' default=' || coalesce(column_default, '')
       || ' nullable=' || is_nullable AS item
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
UNION ALL
SELECT 'index ' || indexdef
  FROM pg_indexes
 WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
UNION ALL
SELECT 'constraint ' || conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace
   AND conrelid::regclass::text NOT LIKE '%_prisma_migrations%'
   -- PostgreSQL 18 lists NOT NULL as a constraint; older servers do not, and `nullable=` already covers it
   AND contype <> 'n'
