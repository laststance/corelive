import { describe, expect, it, vi } from 'vitest'

// Simulate a pino-pretty thread-stream worker that has exited: every write
// method throws "the worker has exited" — the exact failure that bricks a
// packaged Electron main process (see electron/logger.ts). The factory is
// self-contained because Vitest hoists vi.mock() above the imports below.
vi.mock('pino', () => {
  const makeThrowingLogger = () => {
    const fail = (): never => {
      throw new Error('the worker has exited')
    }
    const throwingLogger = {
      info: fail,
      error: fail,
      warn: fail,
      debug: fail,
      trace: fail,
      fatal: fail,
      child: () => throwingLogger,
    }
    return throwingLogger
  }
  return { default: () => makeThrowingLogger() }
})

// Imported after the mock so the module-load `pino(...)` resolves to the
// throwing logger above, making every appLogger.* call fail on write.
import { computeShouldUsePrettyTransport, log } from '../logger'

describe('log.* is crash-safe when the pino transport has died', () => {
  // Regression for the v0.8.0 prod crash: a packaged build enabled the
  // pino-pretty worker, the worker exited inside the asar, and the first
  // log.info() threw "the worker has exited" — uncaught in the main process,
  // so Electron showed the fatal "A JavaScript error occurred" dialog and the
  // window was stranded on about:blank. Logging must never crash the app.

  it('does not throw when info() hits a dead transport', () => {
    // Arrange: appLogger.info is mocked to throw "the worker has exited".
    // Act + Assert: the wrapper swallows it instead of propagating.
    expect(() => log.info('Application started')).not.toThrow()
  })

  it('keeps every log level crash-safe (error, warn, info, debug, trace)', () => {
    // Arrange: every appLogger level method throws on write.

    // Act + Assert: none of the public log.* methods propagate the failure.
    expect(() => log.error('boom')).not.toThrow()
    expect(() => log.warn('careful')).not.toThrow()
    expect(() => log.info('fyi')).not.toThrow()
    expect(() => log.debug('details')).not.toThrow()
    expect(() => log.trace('verbose')).not.toThrow()
  })

  it('keeps a catch-then-log error path safe (logging with a context object)', () => {
    // Arrange: this mirrors settings:setHideAppIcon, whose catch block logs the
    // caught error — the double-throw that originally defeated try/catch.

    // Act + Assert: logging an error WITH a context object stays non-fatal.
    expect(() =>
      log.error('Failed to change dock icon visibility:', new Error('nope')),
    ).not.toThrow()
  })
})

describe('computeShouldUsePrettyTransport (pino-pretty worker gate)', () => {
  // Guards the root-cause decision: the worker transport may only spawn in the
  // genuine local-dev main process, never in a packaged build, test, or
  // renderer — otherwise the worker exits and bricks the app.

  it('enables pretty transport only in the development main process', () => {
    // Arrange: NODE_ENV=development (set by scripts/dev.js) + main process.
    const result = computeShouldUsePrettyTransport(
      { NODE_ENV: 'development' },
      'browser',
    )

    // Assert
    expect(result).toBe(true)
  })

  it('disables pretty transport in a packaged build where NODE_ENV is unset', () => {
    // Arrange: packaged Electron leaves NODE_ENV undefined — the exact prod case
    // that crashed. The old `!== 'production'` gate wrongly returned true here.
    const result = computeShouldUsePrettyTransport(
      { NODE_ENV: undefined },
      'browser',
    )

    // Assert
    expect(result).toBe(false)
  })

  it('disables pretty transport under production and test', () => {
    // Arrange + Act + Assert: neither explicit non-dev env spawns the worker.
    expect(
      computeShouldUsePrettyTransport({ NODE_ENV: 'production' }, 'browser'),
    ).toBe(false)
    expect(
      computeShouldUsePrettyTransport({ NODE_ENV: 'test' }, 'browser'),
    ).toBe(false)
  })

  it('disables pretty transport outside the main process (renderer/preload)', () => {
    // Arrange: dev env but NOT the main process — no SharedArrayBuffer there.
    expect(
      computeShouldUsePrettyTransport({ NODE_ENV: 'development' }, 'renderer'),
    ).toBe(false)
    expect(
      computeShouldUsePrettyTransport({ NODE_ENV: 'development' }, undefined),
    ).toBe(false)
  })

  it('honors DISABLE_PINO_PRETTY=true as an explicit opt-out', () => {
    // Arrange: dev main process, but the escape hatch is set.
    const result = computeShouldUsePrettyTransport(
      { NODE_ENV: 'development', DISABLE_PINO_PRETTY: 'true' },
      'browser',
    )

    // Assert
    expect(result).toBe(false)
  })
})
