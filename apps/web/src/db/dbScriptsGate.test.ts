// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/** The fail-closed local-database check every database-writing script must run first. */
const GATE_COMMAND = 'node scripts/assert-local-db.cjs'

// Resolve installed tools independently of the workspace's hoisted layout.
const require = createRequire(import.meta.url)
const drizzleCli = path.join(
  path.dirname(require.resolve('drizzle-kit')),
  'bin.cjs',
)
const tsxCli = require.resolve('tsx/cli')

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
  const result = spawnSync(process.execPath, [drizzleCli, subcommand], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    // `spawnSync` blocks the test worker, so a gate that failed open and left drizzle-kit waiting on a
    // connection must end the child instead of hanging the run.
    timeout: 25_000,
  })
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

  test('refuses a raw drizzle-kit push whose remote URL comes from the environment, so skipping the package scripts with a production URL in .env cannot run DDL on production', () => {
    // Arrange — a remote URL and no opt-in, as in a developer .env that points at production. (Credential flags
    // typed on the command line, `--url` and friends, put drizzle-kit in a mode that never loads the config:
    // that is an explicit act the gate does not try to stop.)

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

  test('lets the deploy job through the gate when it opts out on a GitHub Actions runner, so the production migration is not blocked by its own guard', () => {
    // Arrange — exactly what db-migrate.yml sets: the opt-out plus the runner's own variable. The target is
    // unreachable (`.invalid`), so drizzle-kit fails to connect; what matters is that the gate stayed silent.

    // Act
    const { output } = runDrizzleKit('migrate', {
      POSTGRES_PRISMA_URL: REMOTE_DATABASE_URL,
      DRIZZLE_ALLOW_REMOTE: '1',
      GITHUB_ACTIONS: 'true',
    })

    // Assert — the config was loaded (drizzle-kit names it), and the gate did not refuse.
    expect(output).toContain('drizzle.config.ts')
    expect(output).not.toContain('[assert-local-db]')
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
    // Arrange — an empty URL, which dotenv leaves alone. PGHOST points at an unreachable `.invalid` host, so a
    // guard that regressed would fail to connect instead of writing to whatever database the developer's PG* variables name.
    const seedEntry = 'src/db/seed/seed.ts'

    // Act
    const result = spawnSync(process.execPath, [tsxCli, seedEntry], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        POSTGRES_PRISMA_URL: '',
        PGHOST: 'seed-guard.invalid',
      },
      timeout: 25_000,
    })

    // Assert
    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toContain(
      '[db:seed] POSTGRES_PRISMA_URL is not set: refusing to seed',
    )
  }, 30_000)

  test('refuses to define real-database suites when POSTGRES_PRISMA_URL is unset, because the local-database check would approve a database the shared client never connects to', () => {
    // Arrange — the opt-in is on, the URL is empty and no .env is read, so the shared client would follow PGHOST.
    // `--eval` is CommonJS, so no top-level await: the rejected import ends the process with the gate's message.
    const importGate = "import('./src/server/procedures/describeIfDb.ts')"

    // Act
    const result = spawnSync(process.execPath, [tsxCli, '--eval', importGate], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        RUN_DB_INTEGRATION_TESTS: '1',
        POSTGRES_PRISMA_URL: '',
        PGHOST: 'suite-guard.invalid',
        DOTENV_CONFIG_PATH: path.resolve(process.cwd(), 'no-such.env'),
      },
      timeout: 25_000,
    })

    // Assert
    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Refusing to run destructive DB integration tests: POSTGRES_PRISMA_URL is not set',
    )
  }, 30_000)
})
