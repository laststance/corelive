// @vitest-environment node
import { DrizzleQueryError } from 'drizzle-orm'
import pino from 'pino'
import { describe, expect, test } from 'vitest'

import { db } from '@/db'
import { categoryTable } from '@/db/schema'
import { describeIfDb } from '@/server/procedures/describeIfDb'

import { logSerializers } from './serializeLogError'

/**
 * Builds a pino logger wired with the production serializers that captures each line in memory.
 * @returns The logger and a function that parses the last line it wrote.
 * @example
 * const { logger, lastLine } = createCapturingLogger()
 * logger.error({ error }, 'boom')
 * lastLine().error // => the serialized error
 */
function createCapturingLogger() {
  const lines: string[] = []
  const logger = pino(
    { serializers: logSerializers },
    { write: (line: string) => void lines.push(line) },
  )
  return {
    logger,
    lastLine: () => JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>,
    lastRawLine: () => lines.at(-1) ?? '',
  }
}

/**
 * Builds an error shaped like node-postgres' `DatabaseError` for a unique violation whose `detail` quotes a user-typed title.
 * @returns The server error.
 * @example
 * makeUniqueViolation().code // => '23505'
 */
function makeUniqueViolation(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "Category_name_userId_key"',
    ),
    {
      name: 'error',
      severity: 'ERROR',
      code: '23505',
      detail:
        'Key (name, "userId")=(Quarterly plan for Acme, 7) already exists.',
      schema: 'public',
      table: 'Category',
      constraint: 'Category_name_userId_key',
      routine: '_bt_check_unique',
    },
  )
}

describe('logSerializers', () => {
  test('logs a plain Error with its message and stack instead of an empty object', () => {
    // Arrange
    const { logger, lastLine } = createCapturingLogger()

    // Act
    logger.error(
      { error: new Error('pool exhausted') },
      'Error in listCategories',
    )

    // Assert
    expect(lastLine().error).toMatchObject({
      type: 'Error',
      message: 'pool exhausted',
      stack: expect.stringContaining('Error: pool exhausted'),
    })
  })

  test('keeps the SQLSTATE and constraint of a failed query but drops its SQL text, bound params and row detail', () => {
    // Arrange
    const { logger, lastLine, lastRawLine } = createCapturingLogger()
    const failedQuery = new DrizzleQueryError(
      'insert into "Category" ("name", "userId") values ($1, $2)',
      ['Quarterly plan for Acme', 7],
      makeUniqueViolation(),
    )

    // Act
    logger.error({ error: failedQuery }, 'Error in createCategory')

    // Assert
    expect(lastLine().error).toMatchObject({
      type: 'Error',
      cause: {
        type: 'error',
        code: '23505',
        severity: 'ERROR',
        schema: 'public',
        table: 'Category',
        constraint: 'Category_name_userId_key',
        routine: '_bt_check_unique',
      },
    })
    expect(lastRawLine()).not.toContain('Quarterly plan for Acme')
    expect(lastRawLine()).not.toContain('insert into')
    expect(lastRawLine()).not.toContain('Failed query')
  })

  test('sanitizes errors handed to the log facade as extra arguments', () => {
    // Arrange
    const { logger, lastLine, lastRawLine } = createCapturingLogger()
    const failedQuery = new DrizzleQueryError(
      'insert into "Completed" ("title") values ($1)',
      ['buy oat milk for grandma'],
      makeUniqueViolation(),
    )

    // Act
    logger.error(
      { context: [failedQuery, { userId: 7 }] },
      'Error in getHeatmap:',
    )

    // Assert
    expect(lastLine().context).toMatchObject([
      { type: 'Error', cause: { code: '23505' } },
      { userId: 7 },
    ])
    expect(lastRawLine()).not.toContain('buy oat milk for grandma')
  })

  test('routes the err key through the same sanitizer as error, so the pool listener cannot leak params either', () => {
    // Arrange
    const { logger, lastRawLine } = createCapturingLogger()
    const failedQuery = new DrizzleQueryError(
      'select $1',
      ['secret-param'],
      makeUniqueViolation(),
    )

    // Act
    logger.error({ err: failedQuery }, 'Idle PostgreSQL client error')

    // Assert
    expect(lastRawLine()).not.toContain('secret-param')
  })

  test('drops a bound parameter that contains a line break and a fake stack frame, so a user-typed value cannot smuggle itself into the logged stack', () => {
    // Arrange
    const { logger, lastRawLine } = createCapturingLogger()
    const failedQuery = new DrizzleQueryError(
      'insert into "Completed" ("title") values ($1)',
      ['first line\n    at leaked-value (secret.ts:1:1)'],
      makeUniqueViolation(),
    )

    // Act
    logger.error({ error: failedQuery }, 'Error in createCompleted')

    // Assert
    expect(lastRawLine()).not.toContain('leaked-value')
    expect(lastRawLine()).not.toContain('secret.ts')
  })

  test('keeps the message of a network error and its errno-style code', () => {
    // Arrange
    const { logger, lastLine } = createCapturingLogger()
    const refused = Object.assign(
      new Error('connect ECONNREFUSED 127.0.0.1:5491'),
      {
        code: 'ECONNREFUSED',
        syscall: 'connect',
      },
    )

    // Act
    logger.error({ error: refused }, 'Idle PostgreSQL client error')

    // Assert
    expect(lastLine().error).toMatchObject({
      message: 'connect ECONNREFUSED 127.0.0.1:5491',
      code: 'ECONNREFUSED',
      syscall: 'connect',
    })
  })

  test('leaves values that are not errors untouched', () => {
    // Arrange
    const { logger, lastLine } = createCapturingLogger()

    // Act
    logger.error({ error: 'plain string', context: 'not an array' }, 'msg')

    // Assert
    expect(lastLine()).toMatchObject({
      error: 'plain string',
      context: 'not an array',
    })
  })

  test('stops walking a cyclic cause chain instead of recursing forever', () => {
    // Arrange
    const { logger, lastLine } = createCapturingLogger()
    const first = new Error('first')
    const second = new Error('second', { cause: first })
    Object.assign(first, { cause: second })

    // Act
    logger.error({ error: first }, 'cycle')

    // Assert
    expect(JSON.stringify(lastLine().error).length).toBeLessThan(20_000)
  })
})

describeIfDb('logSerializers against a real PostgreSQL failure', () => {
  test('logs a foreign-key violation from a live insert without the typed title or the offending id', async () => {
    // Arrange
    const { logger, lastLine, lastRawLine } = createCapturingLogger()
    const insertion = db
      .insert(categoryTable)
      .values({ name: 'SECRET_TITLE_XYZ', userId: 987_654_321 })

    // Act
    const failure = await insertion.then(
      () => undefined,
      (error: unknown) => error,
    )
    logger.error({ error: failure }, 'Error in createCategory')

    // Assert
    expect(lastLine().error).toMatchObject({
      cause: { code: '23503', table: 'Category' },
    })
    expect(lastRawLine()).not.toContain('SECRET_TITLE_XYZ')
    expect(lastRawLine()).not.toContain('987654321')
  })
})
