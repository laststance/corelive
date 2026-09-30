// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { readMigrationFiles } from 'drizzle-orm/migrator'
import { expect, test } from 'vitest'

/**
 * Guard for the migrator's ordering rule. drizzle applies a migration file only when its journal `when` is newer than
 * the newest timestamp already recorded in the database, so an entry whose `when` is not greater than its
 * predecessor's is skipped WITHOUT an error on every database that already ran the newer one. Needs no database, so
 * it runs in every CI lane; `drizzle-kit generate` always writes increasing values, so it can only fail after a
 * merge or a hand edit of `drizzle/meta/_journal.json`.
 */
const JOURNAL_PATH = path.resolve(
  process.cwd(),
  'drizzle',
  'meta',
  '_journal.json',
)

test('lists the migration files with strictly increasing timestamps, so the migrator can never skip one that was merged late', () => {
  // Arrange
  const { entries } = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
    entries: { idx: number; when: number; tag: string }[]
  }

  // Act
  const outOfOrder = entries.filter(
    (entry, position) =>
      entry.idx !== position ||
      (position > 0 && entry.when <= (entries[position - 1]?.when ?? 0)),
  )

  // Assert
  expect(outOfOrder).toEqual([])
})

test('keeps drizzle/0000_init.sql byte-identical to the file whose hash the production baseline row records, because one edited byte would fail every later deploy', () => {
  // Arrange
  const [init] = readMigrationFiles({
    migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
  })

  // Act
  const hash = init?.hash

  // Assert
  expect(hash).toBe(
    'c74b835ea8b3fc89b265d9dc5ce7b5f079267073724f1bd7fb07cef18b0af3d9',
  )
})
