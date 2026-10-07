// @vitest-environment node
import { DrizzleQueryError } from 'drizzle-orm'
import { DatabaseError } from 'pg'
import { describe, expect, test } from 'vitest'

import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from './constants'
import { isPgError } from './isPgError'

/**
 * Builds the error node-postgres raises for a failed statement.
 * @param code - SQLSTATE the server reported, e.g. `'23505'`.
 * @returns A `DatabaseError` carrying `code`.
 * @example
 * makeDriverError('23505').code // => '23505'
 */
function makeDriverError(code: string): DatabaseError {
  const driverError = new DatabaseError(
    'duplicate key value violates unique constraint',
    0,
    'error',
  )
  driverError.code = code
  return driverError
}

describe('isPgError', () => {
  test('matches the driver error when it is thrown without a drizzle wrapper', () => {
    // Arrange
    const driverError = makeDriverError('23505')

    // Act
    const isUniqueViolation = isPgError(driverError, PG_UNIQUE_VIOLATION)

    // Assert
    expect(isUniqueViolation).toBe(true)
  })

  test('matches the driver error drizzle hides in DrizzleQueryError.cause, so unique-violation catch sites still fire', () => {
    // Arrange — drizzle-orm wraps every failed query; the SQLSTATE lives one hop down.
    const wrappedError = new DrizzleQueryError(
      'insert into "Category" ("name") values ($1)',
      ['Work'],
      makeDriverError('23505'),
    )

    // Act
    const isUniqueViolation = isPgError(wrappedError, PG_UNIQUE_VIOLATION)

    // Assert
    expect(isUniqueViolation).toBe(true)
    // The wrapper itself carries no SQLSTATE, which is why a bare `error.code` check breaks.
    expect('code' in wrappedError).toBe(false)
  })

  test('matches a SQLSTATE that sits several causes deep', () => {
    // Arrange
    const deeplyWrappedError = new Error('outer', {
      cause: new Error('middle', {
        cause: new DrizzleQueryError('select 1', [], makeDriverError('23503')),
      }),
    })

    // Act
    const isForeignKeyViolation = isPgError(
      deeplyWrappedError,
      PG_FOREIGN_KEY_VIOLATION,
    )

    // Assert
    expect(isForeignKeyViolation).toBe(true)
  })

  test('rejects other SQLSTATEs, errors without a code, and non-error values', () => {
    // Arrange
    const otherStateError = new DrizzleQueryError(
      'select 1',
      [],
      makeDriverError('22003'),
    )

    // Act & Assert
    expect(isPgError(otherStateError, PG_UNIQUE_VIOLATION)).toBe(false)
    expect(isPgError(new Error('plain'), PG_UNIQUE_VIOLATION)).toBe(false)
    expect(isPgError('23505', PG_UNIQUE_VIOLATION)).toBe(false)
    expect(isPgError(undefined, PG_UNIQUE_VIOLATION)).toBe(false)
  })

  test('gives up on a cyclic cause chain instead of looping forever', () => {
    // Arrange
    const first = new Error('first')
    const second = new Error('second', { cause: first })
    first.cause = second

    // Act
    const isUniqueViolation = isPgError(first, PG_UNIQUE_VIOLATION)

    // Assert
    expect(isUniqueViolation).toBe(false)
  })
})
