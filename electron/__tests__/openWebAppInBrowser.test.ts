import { shell } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openWebAppInBrowser } from '../utils/openWebAppInBrowser'

// vitest hoists vi.mock above the imports, so `shell.openExternal` is a spy by
// the time openWebAppInBrowser resolves it. openExternal must be thenable — the
// helper `.catch`es the result.
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn(async () => true) },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('openWebAppInBrowser', () => {
  beforeEach(() => {
    vi.mocked(shell.openExternal).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens an absolute path on an http(s) origin in the external browser', () => {
    // Arrange + Act: a normal tray/menu/deep-link call.
    openWebAppInBrowser('https://corelive.app', '/home?focus=42')

    // Assert: the exact origin+path is handed to the system browser, unchanged.
    expect(shell.openExternal).toHaveBeenCalledTimes(1)
    expect(shell.openExternal).toHaveBeenCalledWith(
      'https://corelive.app/home?focus=42',
    )
  })

  it('refuses a path that is not leading-slash, so the authority cannot be hijacked', () => {
    // Arrange + Act: a path missing its leading slash would re-interpret the host
    // (e.g. corelive.app@evil.com) once concatenated onto the origin.
    openWebAppInBrowser('https://corelive.app', '@evil.com/phish')

    // Assert: nothing is opened.
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  it('refuses to open a URL whose protocol is not http(s)', () => {
    // Arrange + Act: a non-http(s) origin must never reach the OS-handoff sink.
    openWebAppInBrowser('file://host', '/home')

    // Assert: the file: URL is rejected before shell.openExternal.
    expect(shell.openExternal).not.toHaveBeenCalled()
  })
})
