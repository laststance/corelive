// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'
import { fingerprintPublicSchema } from '@/test/schemaFingerprint'

import { db } from './index'

/**
 * Real-database guard for the cutover's central promise: zero DDL on the application tables.
 *
 * Every real-DB suite runs against a database built from `drizzle/0000_init.sql`, while production's tables
 * were built by the previous ORM's 16 migrations (now deleted). The fixture is the schema fingerprint of a
 * database those migrations built (columns with their physical position, indexes, constraints and foreign-key
 * actions, read with {@link fingerprintPublicSchema}); this test proves the drizzle-built schema is identical.
 * If it fails after a deliberate schema change, regenerate `drizzle/` with `pnpm db:generate` and update the
 * fixture in the same commit.
 */
const PREVIOUS_ORM_FINGERPRINT_PATH = path.resolve(
  process.cwd(),
  'src',
  'db',
  '__fixtures__',
  'prismaBuiltSchemaFingerprint.txt',
)

describeIfDb('schema built by drizzle/0000_init.sql (real PostgreSQL)', () => {
  test('matches column for column, index for index and constraint for constraint the schema the previous ORM built in production', async () => {
    // Arrange
    const previousOrmFingerprint = readFileSync(
      PREVIOUS_ORM_FINGERPRINT_PATH,
      'utf8',
    ).trimEnd()

    // Act
    const drizzleBuiltFingerprint = await fingerprintPublicSchema(db)

    // Assert
    expect(drizzleBuiltFingerprint).toBe(previousOrmFingerprint)
  })
})
