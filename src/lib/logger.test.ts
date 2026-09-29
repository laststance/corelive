// @vitest-environment node
import { DrizzleQueryError } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'

import { createLogger } from './logger'

/**
 * Builds the production logger configuration writing into memory.
 * @returns The logger and a function that parses the last line it wrote.
 * @example
 * const { logger, lastLine } = createCapturingProductionLogger()
 * logger.error({ error }, 'boom')
 * lastLine().msg // => 'boom'
 */
function createCapturingProductionLogger() {
  const lines: string[] = []
  const logger = createLogger({
    write: (line: string) => void lines.push(line),
  })
  return {
    logger,
    lastLine: () => JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>,
    lastRawLine: () => lines.at(-1) ?? '',
  }
}

/**
 * Builds a failed-query error whose message embeds the SQL and a user-typed bound value.
 * @returns The drizzle wrapper around a plain error.
 * @example
 * makeFailedQuery().message // => 'Failed query: insert … params: secret-title'
 */
function makeFailedQuery(): Error {
  return new DrizzleQueryError(
    'insert into "Category" ("name") values ($1)',
    ['secret-title'],
    new Error('boom'),
  )
}

describe('createLogger', () => {
  test('wires the error serializers, so a failed query logged under `error` never prints its SQL or bound values', () => {
    // Arrange
    const { logger, lastRawLine } = createCapturingProductionLogger()

    // Act
    logger.error({ error: makeFailedQuery() }, 'Error in createCategory')

    // Assert
    expect(lastRawLine()).not.toContain('secret-title')
    expect(lastRawLine()).not.toContain('insert into')
  })

  test('logs an Error passed alone under a fixed message, so its own message (SQL and bound values) never becomes the line text', () => {
    // Arrange
    const { logger, lastLine, lastRawLine } = createCapturingProductionLogger()

    // Act
    logger.error(makeFailedQuery())

    // Assert
    expect(lastLine().msg).toBe('Unhandled error')
    expect(lastLine().err).toMatchObject({ type: 'Error' })
    expect(lastRawLine()).not.toContain('secret-title')
  })

  test('logs a bare { err } object under a fixed message, so the error message (SQL and bound values) never becomes the line text', () => {
    // Arrange
    const { logger, lastLine, lastRawLine } = createCapturingProductionLogger()

    // Act
    logger.error({ err: makeFailedQuery() })

    // Assert
    expect(lastLine().msg).toBe('Unhandled error')
    expect(lastRawLine()).not.toContain('secret-title')
    expect(lastRawLine()).not.toContain('insert into')
  })

  test('sanitizes a failed query stored under any key, not only err, error and context', () => {
    // Arrange
    const { logger, lastLine, lastRawLine } = createCapturingProductionLogger()

    // Act
    logger.error({ failure: makeFailedQuery(), userId: 7 }, 'Sync failed')

    // Assert — the line still says what failed and for whom, but not the SQL or the bound title.
    expect(lastLine()).toMatchObject({
      msg: 'Sync failed',
      userId: 7,
      failure: { type: 'Error' },
    })
    expect(lastRawLine()).not.toContain('secret-title')
    expect(lastRawLine()).not.toContain('insert into')
  })

  test('sanitizes a failed query nested inside plain objects and arrays, so grouping values under one key cannot bring the SQL or bound values back', () => {
    // Arrange
    const { logger, lastLine, lastRawLine } = createCapturingProductionLogger()

    // Act
    logger.error(
      { details: { attempts: [{ failure: makeFailedQuery() }] }, userId: 7 },
      'Sync failed',
    )

    // Assert
    expect(lastLine()).toMatchObject({
      msg: 'Sync failed',
      userId: 7,
      details: { attempts: [{ failure: { type: 'Error' } }] },
    })
    expect(lastRawLine()).not.toContain('secret-title')
    expect(lastRawLine()).not.toContain('insert into')
  })

  test('leaves a nested object with its own toJSON redaction alone, so shaping errors never exposes what that object hides', () => {
    // Arrange
    const { logger, lastRawLine } = createCapturingProductionLogger()
    const details = { secret: 'DO-NOT-LOG' }
    Object.defineProperty(details, 'toJSON', {
      value: () => ({ redacted: true }),
    })

    // Act
    logger.error({ details }, 'Operation failed')

    // Assert
    expect(lastRawLine()).toContain('"redacted":true')
    expect(lastRawLine()).not.toContain('DO-NOT-LOG')
  })

  test('does not call a getter inside a logged object, so a getter that throws cannot make the log call fail', () => {
    // Arrange
    const { logger, lastLine } = createCapturingProductionLogger()
    const details = {
      get nested(): never {
        throw new Error('getter exploded')
      },
    }

    // Act
    const logging = () => logger.error({ details }, 'Operation failed')

    // Assert
    expect(logging).not.toThrow()
    expect(lastLine()).toMatchObject({ msg: 'Operation failed' })
  })

  test('keeps the caller message when an Error is logged with one', () => {
    // Arrange
    const { logger, lastLine } = createCapturingProductionLogger()

    // Act
    logger.error(new Error('pool exhausted'), 'Could not reach the database')

    // Assert
    expect(lastLine().msg).toBe('Could not reach the database')
  })
})
