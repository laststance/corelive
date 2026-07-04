import { shell } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openConfigFile } from '../utils/openConfigFile'

vi.mock('electron', () => ({
  shell: { openPath: vi.fn(async () => '') },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('openConfigFile', () => {
  const configPath =
    '/Users/me/Library/Application Support/CoreLive/config.json'

  beforeEach(() => {
    vi.mocked(shell.openPath).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when shell.openPath resolves with an empty string', async () => {
    // Arrange
    vi.mocked(shell.openPath).mockResolvedValueOnce('')

    // Act
    const result = await openConfigFile(configPath)

    // Assert
    expect(result).toBe(true)
    expect(shell.openPath).toHaveBeenCalledTimes(1)
    expect(shell.openPath).toHaveBeenCalledWith(configPath)
  })

  it('returns false without throwing when shell.openPath reports an error', async () => {
    // Arrange
    vi.mocked(shell.openPath).mockResolvedValueOnce('Failed to open path')

    // Act
    const result = await openConfigFile(configPath)

    // Assert
    expect(result).toBe(false)
    expect(shell.openPath).toHaveBeenCalledWith(configPath)
  })
})
