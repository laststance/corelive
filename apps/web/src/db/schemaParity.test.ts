// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'
import { fingerprintPublicSchema } from '@/test/schemaFingerprint'
import { createScratchDatabase } from '@/test/scratchDatabase'

/**
 * Real-database guard for the cutover's central promise: zero DDL on the application tables.
 *
 * Production's tables were built by the previous ORM's 16 migrations (now deleted). The fixture is the schema
 * fingerprint of a database those migrations built (columns with their physical position, indexes, constraints and
 * foreign-key actions, read with {@link fingerprintPublicSchema}). This test builds a scratch database from
 * `drizzle/0000_init.sql` ALONE and proves its schema is identical to the fixture.
 *
 * The fixture is a FROZEN record of the previous ORM's schema:
 * never edit it to make this test pass. Later migrations do not touch this test, because the scratch database only
 * ever receives the first file. It fails only when `0000_init.sql` itself was changed, which must not happen: that file
 * describes what production already runs, so a schema change belongs in a new migration.
 */
const PREVIOUS_ORM_FINGERPRINT_PATH = path.resolve(
  process.cwd(),
  'src',
  'db',
  '__fixtures__',
  'previousOrmSchemaFingerprint.txt',
)

describeIfDb('schema built by drizzle/0000_init.sql (real PostgreSQL)', () => {
  let scratch: Awaited<ReturnType<typeof createScratchDatabase>>

  beforeAll(async () => {
    scratch = await createScratchDatabase({ firstMigrationOnly: true })
  })

  afterAll(async () => {
    await scratch?.drop()
  })

  test('matches column for column, index for index and constraint for constraint the schema the previous ORM built in production', async () => {
    // Arrange
    const previousOrmFingerprint = readFileSync(
      PREVIOUS_ORM_FINGERPRINT_PATH,
      'utf8',
    ).trimEnd()

    // Act
    const drizzleBuiltFingerprint = await fingerprintPublicSchema(scratch.db)

    // Assert
    expect(drizzleBuiltFingerprint).toBe(previousOrmFingerprint)
  })
})
