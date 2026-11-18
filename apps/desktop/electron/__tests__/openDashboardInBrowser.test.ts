import { shell } from 'electron'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { openDashboardInBrowser } from '../utils/openDashboardInBrowser'

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn(async () => undefined) },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('openDashboardInBrowser', () => {
  beforeEach(() => {
    vi.mocked(shell.openExternal).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('opens an absolute path on an http(s) origin in the external browser', async () => {
    // Arrange + Act: a normal tray/menu/deep-link call.
    const opened = await openDashboardInBrowser(
      'https://corelive.app',
      '/home?focus=42',
    )

    // Assert: the exact origin+path is handed to the system browser, unchanged.
    expect(opened).toBe(true)
    expect(shell.openExternal).toHaveBeenCalledTimes(1)
    expect(shell.openExternal).toHaveBeenCalledWith(
      'https://corelive.app/home?focus=42',
    )
  })

  test('refuses a path that is not leading-slash, so the authority cannot be hijacked', async () => {
    // Arrange + Act: a path missing its leading slash would re-interpret the host
    // (e.g. corelive.app@evil.com) once concatenated onto the origin.
    const opened = await openDashboardInBrowser(
      'https://corelive.app',
      '@evil.com/phish',
    )

    // Assert: nothing is opened.
    expect(opened).toBe(false)
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  test('refuses to open a URL whose protocol is not http(s)', async () => {
    // Arrange + Act: a non-http(s) origin must never reach the OS-handoff sink.
    const opened = await openDashboardInBrowser('file://host', '/home')

    // Assert: the file: URL is rejected before shell.openExternal.
    expect(opened).toBe(false)
    expect(shell.openExternal).not.toHaveBeenCalled()
  })
})
