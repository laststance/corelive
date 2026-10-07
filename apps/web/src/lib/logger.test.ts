// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

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

  test('logs a fixed placeholder instead of throwing when the logged object cannot be inspected, and never writes the error next to it', () => {
    // Arrange
    const { logger, lastLine, lastRawLine } = createCapturingProductionLogger()
    const logged = {
      failure: makeFailedQuery(),
      get details(): never {
        throw new Error('getter exploded')
      },
    }

    // Act
    const logging = () => logger.error(logged, 'Operation failed')

    // Assert
    expect(logging).not.toThrow()
    expect(lastLine()).toMatchObject({
      msg: 'Operation failed',
      logObject: '[unable to inspect the logged object]',
    })
    expect(lastRawLine()).not.toContain('secret-title')
    expect(lastRawLine()).not.toContain('insert into')
  })

  test('keeps database packages out of the logger import graph, because Client Components import the logger and a server-only package fails to initialize in the browser', () => {
    // Arrange — every module the logger loads from this folder.
    const sources = ['logger.ts', 'serializeLogError.ts'].map((file) =>
      readFileSync(path.resolve(process.cwd(), 'src/lib', file), 'utf8'),
    )

    // Act
    const importedPackages = sources.flatMap((source) =>
      [...source.matchAll(/^import .* from '([^'.][^']*)'/gm)].map(
        (match) => match[1],
      ),
    )

    // Assert
    expect(importedPackages).toEqual(['pino'])
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
