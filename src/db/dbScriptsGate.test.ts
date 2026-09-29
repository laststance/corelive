// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/** The fail-closed local-database check every database-writing script must run first. */
const GATE_COMMAND = 'node scripts/assert-local-db.cjs'

/** `db:*` scripts that never connect to a database: `db:generate` only reads the schema file and writes SQL files. (`db:studio` is gated: its UI can edit and delete rows.) */
const UNGATED_SCRIPTS = new Set(['db:generate'])

/**
 * Reads the package.json `scripts` table.
 * @returns Script name → command line.
 * @example
 * readPackageScripts()['db:reset'] // => 'node scripts/assert-local-db.cjs && …'
 */
function readPackageScripts(): Record<string, string> {
  const packageJson: unknown = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
  )
  if (
    typeof packageJson !== 'object' ||
    packageJson === null ||
    !('scripts' in packageJson) ||
    typeof packageJson.scripts !== 'object' ||
    packageJson.scripts === null
  ) {
    throw new Error('package.json has no scripts table')
  }
  return Object.fromEntries(
    Object.entries(packageJson.scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

describe('database package scripts', () => {
  test('run the local-database check before anything that can write to a database, so a production URL can never be reset, seeded or edited through the studio', () => {
    // Arrange — every db:* script plus seed:dev, minus the one that never connects.
    const scripts = readPackageScripts()
    const databaseScripts = Object.entries(scripts).filter(
      ([name]) =>
        (name.startsWith('db:') || name === 'seed:dev') &&
        !UNGATED_SCRIPTS.has(name),
    )

    // Act
    const ungatedScriptNames = databaseScripts
      .filter(([, command]) => !command.startsWith(`${GATE_COMMAND} &&`))
      .map(([name]) => name)

    // Assert
    expect(databaseScripts.map(([name]) => name).sort()).toEqual([
      'db:migrate',
      'db:reset',
      'db:seed',
      'db:studio',
      'db:truncate',
      'seed:dev',
    ])
    expect(ungatedScriptNames).toEqual([])
  })

  test('run the schema wipe only after the gate and before migrating, in reset and truncate', () => {
    // Arrange
    const scripts = readPackageScripts()

    // Act & Assert
    expect(scripts['db:reset']).toBe(
      `${GATE_COMMAND} && node scripts/reset-local-db.cjs && pnpm db:migrate && pnpm db:seed`,
    )
    expect(scripts['db:truncate']).toBe(
      `${GATE_COMMAND} && node scripts/reset-local-db.cjs && pnpm db:migrate`,
    )
  })

  test('has no postinstall step and no ORM consent-variable prefix on any script', () => {
    // Arrange
    const scripts = readPackageScripts()

    // Act
    const commands = Object.values(scripts).join('\n')

    // Assert
    expect(scripts.postinstall).toBeUndefined()
    expect(commands).not.toContain('CONSENT_FOR_DANGEROUS_AI_ACTION')
  })
})
