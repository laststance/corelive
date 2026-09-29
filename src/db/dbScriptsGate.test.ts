// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/** The fail-closed local-database check every database-writing script must run first. */
const GATE_COMMAND = 'node scripts/assert-local-db.cjs'

/** `db:*` scripts that never connect to a database: `db:generate` only reads the schema file and writes SQL files. (`db:studio` is gated: its UI can edit and delete rows.) */
const UNGATED_SCRIPTS = new Set(['db:generate'])

/** A production-looking target on the reserved `.invalid` TLD: the gate must reject it before any connection is attempted, and even a broken gate could not reach a real server. */
const REMOTE_DATABASE_URL = 'postgresql://user:pass@prod-db.invalid:5432/db'

/**
 * Runs the installed drizzle-kit binary directly, the way a developer skips the package scripts with `pnpm exec drizzle-kit …`.
 * @param subcommand - drizzle-kit subcommand, e.g. `push`.
 * @param env - Environment overrides on top of the parent's; the default is a remote URL with no opt-in. A key set to `undefined` is removed from the child's environment.
 * @returns Exit status and the combined stdout/stderr.
 * @example
 * runDrizzleKit('push') // => { status: 1, output: '🛑 [assert-local-db] …' }
 */
function runDrizzleKit(
  subcommand: string,
  env: Record<string, string | undefined> = {
    POSTGRES_PRISMA_URL: REMOTE_DATABASE_URL,
    DRIZZLE_ALLOW_REMOTE: '',
  },
): {
  status: number | null
  output: string
} {
  const result = spawnSync(
    process.execPath,
    ['node_modules/drizzle-kit/bin.cjs', subcommand],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ...env },
      // `spawnSync` blocks the test worker, so a gate that failed open and left drizzle-kit waiting on a
      // connection must end the child instead of hanging the run.
      timeout: 25_000,
    },
  )
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

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

  test('refuses a raw drizzle-kit push against a remote database, so bypassing the package scripts cannot run DDL on production', () => {
    // Arrange — a remote URL and no opt-in, as in a developer .env that points at production.

    // Act
    const { status, output } = runDrizzleKit('push')

    // Assert
    expect(status).toBe(1)
    expect(output).toContain('[assert-local-db]')
    expect(output).toContain('prod-db.invalid')
  }, 30_000)

  test('ignores the remote-database opt-out outside a GitHub Actions runner, so a developer .env copied from the deploy job cannot switch the gate off', () => {
    // Arrange — the opt-out is set, but the runner's own variable is not. drizzle-kit loads .env before it
    // evaluates the config, so a `DRIZZLE_ALLOW_REMOTE=1` line in a .env file looks exactly like this.

    // Act
    const { status, output } = runDrizzleKit('push', {
      POSTGRES_PRISMA_URL: REMOTE_DATABASE_URL,
      DRIZZLE_ALLOW_REMOTE: '1',
      GITHUB_ACTIONS: undefined,
    })

    // Assert
    expect(status).toBe(1)
    expect(output).toContain('[assert-local-db]')
    expect(output).toContain('prod-db.invalid')
  }, 30_000)

  test('still lets the offline drizzle-kit check run against a remote URL, so validating the migration folder needs no local database', () => {
    // Arrange — same remote URL; `check` only reads the drizzle/ folder.

    // Act
    const { status, output } = runDrizzleKit('check')

    // Assert
    expect(status).toBe(0)
    expect(output).not.toContain('[assert-local-db]')
  }, 30_000)

  test('falls back to the same local connection string as the gate and the reset script, so all three judge and reach one database', () => {
    // Arrange — the config is TypeScript that drizzle-kit loads itself, so it spells the fallback out; this pins the two copies together.
    const { LOCAL_FALLBACK_DATABASE_URL } = createRequire(import.meta.url)(
      '../../scripts/local-db-port.cjs',
    ) as { LOCAL_FALLBACK_DATABASE_URL: string }

    // Act
    const configSource = readFileSync(
      path.resolve(process.cwd(), 'drizzle.config.ts'),
      'utf8',
    )

    // Assert
    expect(configSource).toContain(`'${LOCAL_FALLBACK_DATABASE_URL}'`)
  })

  test('refuses to seed when POSTGRES_PRISMA_URL is unset, because the shared client would then connect wherever PGHOST points instead of the database the gate approved', () => {
    // Arrange — an empty URL, which dotenv leaves alone; nothing is reachable at the default host.
    const seedEntry = 'src/db/seed/seed.ts'

    // Act
    const result = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', seedEntry],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, POSTGRES_PRISMA_URL: '' },
      },
    )

    // Assert
    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toContain(
      '[db:seed] POSTGRES_PRISMA_URL is not set: refusing to seed',
    )
  }, 30_000)
})
