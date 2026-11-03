import { expect, test, vi } from 'vitest'

import { applyDevUserData } from './devUserData'

test('an unpackaged run gets a userData folder that differs from the installed app so it never touches the owner workspace', () => {
  // Arrange
  const setPath = vi.fn()
  const fakeApp = {
    isPackaged: false,
    getPath: vi.fn(() => '/Users/test/Library/Application Support'),
    setPath,
  }

  // Act
  const devPath = applyDevUserData(fakeApp)

  // Assert
  expect(devPath).toBe('/Users/test/Library/Application Support/CoreLive Dev')
  expect(setPath).toHaveBeenCalledWith('userData', devPath)
  expect(devPath).not.toBe('/Users/test/Library/Application Support/CoreLive')
})

test('a packaged build keeps its own userData path', () => {
  // Arrange
  const setPath = vi.fn()
  const fakeApp = {
    isPackaged: true,
    getPath: vi.fn(() => '/Users/test/Library/Application Support'),
    setPath,
  }

  // Act
  const devPath = applyDevUserData(fakeApp)

  // Assert
  expect(devPath).toBeNull()
  expect(setPath).not.toHaveBeenCalled()
})
