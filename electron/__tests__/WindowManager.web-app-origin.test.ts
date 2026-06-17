/**
 * @fileoverview WindowManager.getWebAppOrigin resolution tests.
 *
 * The sentinel: the native OAuth flow targets whatever `getWebAppOrigin()`
 * returns, and with the main window retired there is no window URL left to read
 * — so this getter is the SOLE source of the system-browser sign-in origin. It
 * must resolve to the dev origin when a server URL is configured, and degrade to
 * the production origin (never throw, never an empty/relative origin) when the
 * server URL is unset or unparseable. A regression here would point OAuth at the
 * wrong origin (or crash the flow), so these pin all three branches.
 *
 * Triggered when: `pnpm test:electron` (Vitest, node env).
 *
 * @example
 *   pnpm test:electron -- WindowManager.web-app-origin
 */
import { describe, expect, it, vi } from 'vitest'

import { WindowManager } from '../WindowManager'

// getWebAppOrigin constructs no window — these mocks exist only so importing
// WindowManager (which imports `electron` + the logger at module load) resolves
// in the node test env. The getter itself touches none of them.
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  },
  dialog: { showMessageBox: vi.fn() },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('WindowManager.getWebAppOrigin', () => {
  it('defaults to the production origin when no server URL is configured', () => {
    // Arrange: no server URL (the packaged app passes null — it points at prod).
    const windowManager = new WindowManager(null)

    // Act
    const origin = windowManager.getWebAppOrigin()

    // Assert: OAuth targets the production web app.
    expect(origin).toBe('https://corelive.app')
  })

  it("uses the dev server's origin, stripping any path, when a server URL is configured", () => {
    // Arrange: dev passes the full local URL (with a path) as the server URL.
    const windowManager = new WindowManager('http://localhost:4991/home')

    // Act
    const origin = windowManager.getWebAppOrigin()

    // Assert: just the origin (scheme + host + port) — the /home path is dropped,
    // so OAuth URL building appends its own path to a clean origin.
    expect(origin).toBe('http://localhost:4991')
  })

  it('falls back to the production origin when the configured server URL is unparseable', () => {
    // Arrange: a malformed server URL that `new URL()` cannot parse.
    const windowManager = new WindowManager('not a url')

    // Act
    const origin = windowManager.getWebAppOrigin()

    // Assert: degrades to prod rather than throwing or returning a bad origin.
    expect(origin).toBe('https://corelive.app')
  })
})
