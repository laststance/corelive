// @vitest-environment node
import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

/**
 * Contract tests for the fail-closed local-DB gate (`scripts/assert-local-db.cjs`).
 * The gate is the single chokepoint that keeps destructive ops (`db:reset`,
 * `db:truncate`, `prisma:migrate`, `prisma:seed`, and — via `describeIfDb` — the
 * real-DB integration suites) from running against a non-local Postgres. It had
 * no tests; now that `describeIfDb` shells out to it and depends on its
 * exit-code contract, lock that contract here. These never touch a database —
 * the gate only inspects the connection string — so they run unconditionally.
 */

/**
 * Runs the gate with a crafted `POSTGRES_PRISMA_URL` and returns its exit code.
 * @param databaseUrl - The connection string the gate should judge.
 * @returns 0 when the gate proves the URL local (allows the op), 1 when it aborts.
 * @example runGate('postgresql://postgres@localhost:5491/db') // => 0
 */
function runGate(databaseUrl: string): number {
  try {
    // Same node as the test runner; cwd = repo root, so the relative path
    // resolves. Override only POSTGRES_PRISMA_URL so the verdict is deterministic
    // (dotenv won't clobber an already-set var, and it takes precedence anyway).
    execFileSync(process.execPath, ['scripts/assert-local-db.cjs'], {
      env: { ...process.env, POSTGRES_PRISMA_URL: databaseUrl },
      stdio: 'pipe',
    })
    return 0
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return Number(error.status)
    }
    throw error
  }
}

describe('assert-local-db gate (fail-closed local-DB chokepoint)', () => {
  it('allows the local Docker connection string', () => {
    // Arrange / Act
    const exitCode = runGate(
      'postgresql://postgres:password@localhost:5491/corelive?schema=public',
    )
    // Assert — provably local, so the destructive op is permitted.
    expect(exitCode).toBe(0)
  })

  it('aborts on a remote Neon production host', () => {
    // Arrange / Act
    const exitCode = runGate(
      'postgresql://user:pass@ep-cool-name-123.us-east-2.aws.neon.tech/db',
    )
    // Assert — a misdirected prod URL must stop the destructive op.
    expect(exitCode).toBe(1)
  })

  it('aborts when a localhost authority hides a prod ?host= (parser fail-open)', () => {
    // Arrange / Act — WHATWG reads "localhost"; libpq dials the ?host=. The gate
    // must close this divergence or it would wipe prod thinking it was local.
    const exitCode = runGate('postgresql://localhost/db?host=prod.neon.tech')
    // Assert
    expect(exitCode).toBe(1)
  })

  it('still allows a ?host= that is itself local (does not over-block)', () => {
    // Arrange / Act
    const exitCode = runGate('postgresql://localhost/db?host=127.0.0.1')
    // Assert — every host the driver could dial is local, so it is permitted.
    expect(exitCode).toBe(0)
  })

  it('aborts on a backslash URL where the two parsers disagree on the authority', () => {
    // Arrange / Act
    const exitCode = runGate('postgres\\evil@localhost/db')
    // Assert — ambiguous parse → fail closed.
    expect(exitCode).toBe(1)
  })

  it('aborts on an unparseable connection string (cannot prove local)', () => {
    // Arrange / Act
    const exitCode = runGate('not a connection string')
    // Assert
    expect(exitCode).toBe(1)
  })
})
