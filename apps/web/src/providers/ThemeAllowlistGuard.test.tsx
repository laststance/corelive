import { render } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Drive the guard with a controlled next-themes state + a spy setter, so each
// case asserts the corrective behavior without next-themes' real localStorage /
// matchMedia machinery (mirrors src/components/ui/sonner.test.tsx).
const setThemeSpy = vi.fn()
const useThemeMock = vi.fn()
vi.mock('next-themes', () => ({ useTheme: () => useThemeMock() }))

import { ThemeAllowlistGuard } from './ThemeAllowlistGuard'

describe('ThemeAllowlistGuard — heals an unregistered persisted theme', () => {
  beforeEach(() => {
    setThemeSpy.mockClear()
    useThemeMock.mockReset()
  })

  test('resets a stale colored-family id (dark utilities, no token block) to the default', () => {
    // Arrange — a *-dark id left after a downgrade that dropped the family
    useThemeMock.mockReturnValue({
      theme: 'sunset-dark',
      setTheme: setThemeSpy,
    })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).toHaveBeenCalledWith('light')
  })

  test('resets a tampered garbage id to the default', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: 'bogus', setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).toHaveBeenCalledWith('light')
  })

  test('leaves a registered theme untouched so a real choice is never clobbered', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: 'dark', setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).not.toHaveBeenCalled()
  })

  test('leaves the system sentinel untouched so OS-follow keeps working', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: 'system', setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).not.toHaveBeenCalled()
  })

  test('does nothing before hydration when the theme is undefined', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: undefined, setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).not.toHaveBeenCalled()
  })
})
