import { MAX_ERROR_CAUSE_DEPTH } from '../db/constants'

/** Shape an error takes in a log line: identifies the failure without carrying row data. */
type LoggedError = {
  type: string
  message?: string
  stack?: string
  code?: string | number
  severity?: string
  schema?: string
  table?: string
  column?: string
  constraint?: string
  routine?: string
  syscall?: string
  cause?: LoggedError
}

/** PostgreSQL error fields that name the failing object but never hold a row value. */
const PG_LOCATION_FIELDS = [
  'severity',
  'schema',
  'table',
  'column',
  'constraint',
  'routine',
] as const

/** Node system-error fields (`ECONNREFUSED`, …) worth keeping on an otherwise plain error. */
const SYSTEM_ERROR_FIELDS = ['syscall'] as const

/**
 * Reads one property off an error-like object without a cast.
 * @param error - Object to read from.
 * @param key - Property name.
 * @returns The property value, or `undefined` when absent.
 * @example
 * readProperty(new Error('x'), 'code') // => undefined
 */
function readProperty(error: Error, key: string): unknown {
  return key in error
    ? (error as unknown as Record<string, unknown>)[key]
    : undefined
}

/**
 * Tells whether an error is drizzle's failed-query wrapper, whose message, `query` and `params` embed the SQL text and every bound value.
 * @param error - Error to inspect.
 * @returns `true` for the wrapper.
 * @example
 * isQueryWrapper(new DrizzleQueryError('select $1', ['x'])) // => true
 */
function isQueryWrapper(error: Error): boolean {
  return (
    typeof readProperty(error, 'query') === 'string' &&
    Array.isArray(readProperty(error, 'params'))
  )
}

/**
 * Tells whether an error is a PostgreSQL server error (node-postgres `DatabaseError`), whose `message`, `detail` and `where` can quote row values.
 * @param error - Error to inspect.
 * @returns `true` for a server-reported error.
 * @example
 * isPgDatabaseError(uniqueViolation) // => true
 */
function isPgDatabaseError(error: Error): boolean {
  return (
    typeof readProperty(error, 'severity') === 'string' &&
    typeof readProperty(error, 'routine') === 'string'
  )
}

/**
 * Keeps only the `at …` frames of a V8 stack. The header line repeats the error message, which for a drizzle failed query holds the bound parameters.
 * @param stack - Raw `error.stack`.
 * @returns The frame lines, or `undefined` when there are none.
 * @example
 * framesOnly('Error: Failed query: … params: secret\n    at fn (file.ts:1:1)') // => '    at fn (file.ts:1:1)'
 */
function framesOnly(stack: string | undefined): string | undefined {
  const frames = stack
    ?.split('\n')
    .filter((line) => /^\s+at /.test(line))
    .join('\n')
  return frames || undefined
}

/**
 * Shapes one error and its `.cause` chain into a log-safe object.
 * @param error - Error to shape.
 * @param depth - Current position in the cause chain.
 * @returns The log-safe shape; the cause chain stops at {@link MAX_ERROR_CAUSE_DEPTH}.
 * @example
 * shapeError(new Error('boom'), 0) // => { type: 'Error', message: 'boom', stack: '…' }
 */
function shapeError(error: Error, depth: number): LoggedError {
  // Drizzle's wrapper and PostgreSQL's own errors can quote user-typed values: drop message/detail for them.
  const carriesRowData = isQueryWrapper(error) || isPgDatabaseError(error)
  const shaped: LoggedError = { type: error.name }

  if (!carriesRowData) shaped.message = error.message
  const stack = carriesRowData ? framesOnly(error.stack) : error.stack
  if (stack) shaped.stack = stack

  const code = readProperty(error, 'code')
  if (typeof code === 'string' || typeof code === 'number') shaped.code = code

  for (const field of PG_LOCATION_FIELDS) {
    const value = readProperty(error, field)
    if (typeof value === 'string') shaped[field] = value
  }
  for (const field of SYSTEM_ERROR_FIELDS) {
    const value = readProperty(error, field)
    if (typeof value === 'string') shaped[field] = value
  }

  const cause = readProperty(error, 'cause')
  if (cause instanceof Error && depth + 1 < MAX_ERROR_CAUSE_DEPTH) {
    shaped.cause = shapeError(cause, depth + 1)
  }
  return shaped
}

/**
 * pino serializer for the `error` and `err` log keys. Turns an {@link Error} into an object that names the failure (type, SQLSTATE, constraint, table, stack frames) without the SQL text, bound parameters or PostgreSQL `detail` a raw database error carries, so user-typed titles, names and ids never reach the logs. pino's own `err` serializer prints `message` and would leak them, and with no serializer at all an Error serializes as `{}`.
 * Wired into the logger by {@link logSerializers}.
 * @param value - Whatever a call site put under the key.
 * @returns The log-safe shape for an {@link Error}; any other value unchanged.
 * @example
 * log.error({ error }, 'Error in createCategory')
 * // => { "error": { "type": "Error", "code": "23505", "constraint": "Category_name_userId_key", … } }
 */
function serializeLogError(value: unknown): unknown {
  return value instanceof Error ? shapeError(value, 0) : value
}

/**
 * pino serializer for the `context` key the `log` facade fills with its extra arguments (`log.error('msg:', error)`), sanitizing every {@link Error} among them.
 * @param value - The facade's argument array.
 * @returns The array with each error shaped by {@link serializeLogError}.
 * @example
 * log.error('Error in getHeatmap:', error) // => { "context": [{ "type": "Error", … }] }
 */
function serializeLogContext(value: unknown): unknown {
  return Array.isArray(value) ? value.map(serializeLogError) : value
}

/**
 * pino `serializers` table for {@link createLogger}: routes every error-bearing key through the log-safe shaper.
 * @example
 * pino({ serializers: logSerializers })
 */
export const logSerializers = {
  error: serializeLogError,
  err: serializeLogError,
  context: serializeLogContext,
}
