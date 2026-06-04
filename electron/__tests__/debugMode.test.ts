import { describe, expect, it } from 'vitest'

import {
  isCoreliveDebugEnabled,
  isDevToolsEnabled,
  resolveRemoteDebuggingPort,
} from '../utils/debugMode'

describe('isCoreliveDebugEnabled (the CORELIVE_DEBUG launch opt-in)', () => {
  // The single env predicate behind both debug capabilities. A packaged build
  // must stay non-debuggable unless this is explicitly turned on.

  it('treats CORELIVE_DEBUG="1" as enabled', () => {
    // Arrange + Act + Assert
    expect(isCoreliveDebugEnabled({ CORELIVE_DEBUG: '1' })).toBe(true)
  })

  it('treats CORELIVE_DEBUG="true" (any case, padded) as enabled', () => {
    // Arrange + Act + Assert: trimmed + case-insensitive so shell quoting/casing
    // does not silently disable debugging.
    expect(isCoreliveDebugEnabled({ CORELIVE_DEBUG: 'true' })).toBe(true)
    expect(isCoreliveDebugEnabled({ CORELIVE_DEBUG: 'TRUE' })).toBe(true)
    expect(isCoreliveDebugEnabled({ CORELIVE_DEBUG: '  true  ' })).toBe(true)
  })

  it('treats "0", "false", "", and unset as disabled (packaged default)', () => {
    // Arrange + Act + Assert: explicit-off and absent both read as off.
    expect(isCoreliveDebugEnabled({ CORELIVE_DEBUG: '0' })).toBe(false)
    expect(isCoreliveDebugEnabled({ CORELIVE_DEBUG: 'false' })).toBe(false)
    expect(isCoreliveDebugEnabled({ CORELIVE_DEBUG: '' })).toBe(false)
    expect(isCoreliveDebugEnabled({})).toBe(false)
  })
})

describe('isDevToolsEnabled (secure-by-default per-window DevTools gate)', () => {
  // Shared by every production window (main, floating, braindump, settings).
  // Regression for Issue #61: a default packaged build must NOT expose DevTools
  // on any window, but each opt-in path must re-enable it.

  it('enables DevTools in the local-dev main process', () => {
    // Arrange: NODE_ENV=development → isDev true.

    // Act + Assert
    expect(isDevToolsEnabled(true, false, {})).toBe(true)
  })

  it('enables DevTools when the advanced.enableDevTools config is on', () => {
    // Arrange: packaged (isDev false), no env flag, but the persisted config opt-in.

    // Act + Assert
    expect(isDevToolsEnabled(false, true, {})).toBe(true)
  })

  it('enables DevTools under the CORELIVE_DEBUG launch opt-in', () => {
    // Arrange: packaged, config off, but launched with CORELIVE_DEBUG=1.

    // Act + Assert
    expect(isDevToolsEnabled(false, false, { CORELIVE_DEBUG: '1' })).toBe(true)
  })

  it('disables DevTools in a default packaged build (all opt-ins off)', () => {
    // Arrange: packaged main process, no config opt-in, no env flag — the exact
    // default a notarized user runs.

    // Act
    const result = isDevToolsEnabled(false, false, {})

    // Assert: secure-by-default — DevTools cannot be opened on any window.
    expect(result).toBe(false)
  })

  it('stays disabled when CORELIVE_DEBUG is explicitly off', () => {
    // Arrange + Act + Assert: CORELIVE_DEBUG=0 must not enable anything.
    expect(isDevToolsEnabled(false, false, { CORELIVE_DEBUG: '0' })).toBe(false)
  })
})

describe('resolveRemoteDebuggingPort (CDP port — env-only, off by default)', () => {
  // Drives whether main.ts opens a --remote-debugging-port. The persisted config
  // can NEVER reach here; only env levers open the port.

  it('passes the Playwright E2E port through unchanged (highest precedence)', () => {
    // Arrange: the existing E2E lever set by the dev-runner.

    // Act + Assert: preserved verbatim so the Electron E2E suite is unaffected.
    expect(
      resolveRemoteDebuggingPort({ PLAYWRIGHT_REMOTE_DEBUGGING_PORT: '9222' }),
    ).toBe('9222')
  })

  it('prefers the Playwright port over a CORELIVE_DEBUG override', () => {
    // Arrange: both levers set; the E2E lever wins.

    // Act + Assert
    expect(
      resolveRemoteDebuggingPort({
        PLAYWRIGHT_REMOTE_DEBUGGING_PORT: '9000',
        CORELIVE_DEBUG: '1',
        CORELIVE_REMOTE_DEBUGGING_PORT: '9333',
      }),
    ).toBe('9000')
  })

  it('opens the default port 9222 under CORELIVE_DEBUG=1', () => {
    // Arrange: prod debug opt-in with no explicit port.

    // Act + Assert
    expect(resolveRemoteDebuggingPort({ CORELIVE_DEBUG: '1' })).toBe('9222')
  })

  it('honors CORELIVE_REMOTE_DEBUGGING_PORT as a port override', () => {
    // Arrange: prod debug opt-in with an explicit custom port.

    // Act + Assert
    expect(
      resolveRemoteDebuggingPort({
        CORELIVE_DEBUG: '1',
        CORELIVE_REMOTE_DEBUGGING_PORT: '9333',
      }),
    ).toBe('9333')
  })

  it('opens no port in a default packaged build', () => {
    // Arrange: no debug lever of any kind — the notarized default.

    // Act
    const result = resolveRemoteDebuggingPort({})

    // Assert: secure-by-default — the prod app exposes no CDP surface.
    expect(result).toBeNull()
  })

  it('does not open a port from CORELIVE_REMOTE_DEBUGGING_PORT alone', () => {
    // Arrange: a port is set but the CORELIVE_DEBUG opt-in is NOT — the port
    // override is inert without the deliberate debug opt-in.

    // Act + Assert
    expect(
      resolveRemoteDebuggingPort({ CORELIVE_REMOTE_DEBUGGING_PORT: '9333' }),
    ).toBeNull()
  })

  it('throws on an out-of-range custom port', () => {
    // Arrange: CORELIVE_DEBUG on, but the override is above the TCP max.

    // Act + Assert: surfaced loudly (mirrors the strict ELECTRON_RENDERER_URL guard).
    expect(() =>
      resolveRemoteDebuggingPort({
        CORELIVE_DEBUG: '1',
        CORELIVE_REMOTE_DEBUGGING_PORT: '70000',
      }),
    ).toThrow(/CORELIVE_REMOTE_DEBUGGING_PORT/)
  })

  it('throws on a non-integer custom port', () => {
    // Arrange: CORELIVE_DEBUG on, but the override is not a plain integer.

    // Act + Assert
    expect(() =>
      resolveRemoteDebuggingPort({
        CORELIVE_DEBUG: '1',
        CORELIVE_REMOTE_DEBUGGING_PORT: '9e3',
      }),
    ).toThrow(/CORELIVE_REMOTE_DEBUGGING_PORT/)
  })
})
