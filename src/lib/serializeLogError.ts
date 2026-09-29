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

/** Error fields that name the failing object or system call but never hold a row value: PostgreSQL's location fields plus Node's `syscall` (`ECONNREFUSED`, …). */
const SAFE_ERROR_FIELDS = [
  'severity',
  'schema',
  'table',
  'column',
  'constraint',
  'routine',
  'syscall',
] as const

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
 * Keeps only the call frames of a V8 stack. The header repeats the error message, which for a drizzle failed query holds the bound parameters, and a parameter can itself contain a line break followed by `    at …`.
 *
 * The header is therefore cut off by position: everything up to the end of the message is dropped, and only the lines after it that look like frames are kept. A stack whose header cannot be located (rewritten `stack`, unusual runtime) yields nothing rather than risk a value.
 * @param error - Error whose `stack` to reduce.
 * @returns The frame lines, or `undefined` when there are none or the header cannot be located.
 * @example
 * framesOnly(failedQuery) // => '    at fn (file.ts:1:1)'
 */
function framesOnly(error: Error): string | undefined {
  const { stack, message } = error
  if (!stack) return undefined
  // V8 writes `Name: message` (or just `Name` for an empty message) and then one frame per line.
  const marker = message === '' ? '' : `: ${message}`
  const headerAt = stack.indexOf(marker)
  if (headerAt === -1) return undefined
  const frames = stack
    .slice(headerAt + marker.length)
    .split('\n')
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
  const stack = carriesRowData ? framesOnly(error) : error.stack
  if (stack) shaped.stack = stack

  const code = readProperty(error, 'code')
  if (typeof code === 'string' || typeof code === 'number') shaped.code = code

  for (const field of SAFE_ERROR_FIELDS) {
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

/** How many levels of plain objects and arrays {@link shapeErrorsUnderAnyKey} looks into; anything deeper is passed through unchanged. */
const MAX_LOG_VALUE_DEPTH = 4

/**
 * Replaces every {@link Error} found in a value with its log-safe shape, looking through plain objects and arrays up to {@link MAX_LOG_VALUE_DEPTH} levels.
 *
 * A container is rebuilt only when an error sits somewhere inside it; every other value is returned as the very same object, so custom `toJSON` redaction and lazy getters keep working exactly as before. A rebuilt object keeps its own enumerable data properties: accessors are never invoked (a getter that throws must not turn a log call into a failure) and are shown as `'[Getter]'`. An object with a `toJSON` method is left to that method.
 * @param value - Any value a call site put in a log object.
 * @param depth - How many containers were entered to reach `value`.
 * @returns The value with its errors shaped, or `value` itself when it holds none.
 * @example
 * shapeErrorsDeep({ details: { error: new Error('boom') } }, 0)
 * // => { details: { error: { type: 'Error', message: 'boom', stack: '…' } } }
 */
function shapeErrorsDeep(value: unknown, depth: number): unknown {
  if (value instanceof Error) return shapeError(value, 0)
  if (depth >= MAX_LOG_VALUE_DEPTH) return value
  if (Array.isArray(value)) {
    const shaped = value.map((item) => shapeErrorsDeep(item, depth + 1))
    return shaped.some((item, index) => item !== value[index]) ? shaped : value
  }
  if (typeof value !== 'object' || value === null) return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  if ('toJSON' in value) return value

  let changed = false
  const entries: [string, unknown][] = []
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined) continue
    if (!('value' in descriptor)) {
      entries.push([key, '[Getter]'])
      continue
    }
    const shaped = shapeErrorsDeep(descriptor.value, depth + 1)
    if (shaped !== descriptor.value) changed = true
    entries.push([key, shaped])
  }
  return changed ? Object.fromEntries(entries) : value
}

/**
 * pino `formatters.log` hook for {@link createLogger}: shapes an {@link Error} that sits under ANY key of a log object, however deeply it is nested in plain objects and arrays.
 *
 * pino applies {@link logSerializers} by key name, so `log.error({ failure: error }, …)` or `log.error({ details: { errors: [error] } }, …)` would reach the log line through `JSON.stringify`, which includes a failed query's own enumerable `query` and `params`. This hook runs before the serializers (pino's `asJson` calls `formatters.log` first), so the rule "no SQL or bound value in the logs" no longer depends on what a call site names its key or how it groups its values.
 * @param object - The object a call site passed to the logger.
 * @returns A copy in which every {@link Error} value is replaced by its log-safe shape; other values are unchanged.
 * @example
 * shapeErrorsUnderAnyKey({ failure: new Error('boom'), userId: 7 })
 * // => { failure: { type: 'Error', message: 'boom', stack: '…' }, userId: 7 }
 */
export function shapeErrorsUnderAnyKey(
  object: Record<string, unknown>,
): Record<string, unknown> {
  const shaped = shapeErrorsDeep(object, 0)
  return typeof shaped === 'object' && shaped !== null && !Array.isArray(shaped)
    ? (shaped as Record<string, unknown>)
    : object
}
