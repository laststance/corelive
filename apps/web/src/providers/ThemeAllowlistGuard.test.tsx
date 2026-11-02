import { render } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Drive the guard with a controlled next-themes state + a spy setter, so each
// case asserts the corrective behavior without next-themes' real localStorage /
// matchMedia machinery (mirrors src/components/ui/sonner.test.tsx).
const setThemeSpy = vi.fn()
const useThemeMock = vi.fn()
const { logDebugSpy } = vi.hoisted(() => ({ logDebugSpy: vi.fn() }))
vi.mock('next-themes', () => ({ useTheme: () => useThemeMock() }))
vi.mock('@/lib/logger', () => ({ log: { debug: logDebugSpy } }))

import { ThemeAllowlistGuard } from './ThemeAllowlistGuard'

describe('ThemeAllowlistGuard — normalizes the persisted theme', () => {
  beforeEach(() => {
    setThemeSpy.mockClear()
    logDebugSpy.mockClear()
    useThemeMock.mockReset()
  })

  test('resets a stale colored-family id (dark utilities, no token block) to system', () => {
    // Arrange — a *-dark id left after a downgrade that dropped the family
    useThemeMock.mockReturnValue({
      theme: 'sunset-dark',
      setTheme: setThemeSpy,
    })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).toHaveBeenCalledWith('system')
  })

  test('resets a tampered garbage id to system', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: 'bogus', setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).toHaveBeenCalledWith('system')
  })

  test('rewrites the legacy default-dark alias to dark so the pick keeps its palette', () => {
    // Arrange
    useThemeMock.mockReturnValue({
      theme: 'default-dark',
      setTheme: setThemeSpy,
    })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).toHaveBeenCalledWith('dark')
  })

  test('rewrites the legacy default-light alias to light', () => {
    // Arrange
    useThemeMock.mockReturnValue({
      theme: 'default-light',
      setTheme: setThemeSpy,
    })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).toHaveBeenCalledWith('light')
  })

  test('logs the raw and healed values when it rewrites storage', () => {
    // Arrange
    useThemeMock.mockReturnValue({
      theme: 'cathedral-lite',
      setTheme: setThemeSpy,
    })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(logDebugSpy).toHaveBeenCalledWith('[theme] rewriting stored theme', {
      storedTheme: 'cathedral-lite',
      healedTheme: 'system',
    })
  })

  test('does not log or rewrite a registered cathedral theme', () => {
    // Arrange
    useThemeMock.mockReturnValue({
      theme: 'cathedral-dark',
      setTheme: setThemeSpy,
    })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).not.toHaveBeenCalled()
    expect(logDebugSpy).not.toHaveBeenCalled()
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
