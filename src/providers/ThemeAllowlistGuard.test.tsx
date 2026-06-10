import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

  it('resets a stale colored-family id (dark utilities, no token block) to the default', () => {
    // Arrange — a *-dark id left after a downgrade that dropped the family
    useThemeMock.mockReturnValue({
      theme: 'harbor-dark',
      setTheme: setThemeSpy,
    })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).toHaveBeenCalledWith('light')
  })

  it('resets a tampered garbage id to the default', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: 'bogus', setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).toHaveBeenCalledWith('light')
  })

  it('leaves a registered theme untouched so a real choice is never clobbered', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: 'dark', setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).not.toHaveBeenCalled()
  })

  it('leaves the system sentinel untouched so OS-follow keeps working', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: 'system', setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).not.toHaveBeenCalled()
  })

  it('does nothing before hydration when the theme is undefined', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: undefined, setTheme: setThemeSpy })

    // Act
    render(<ThemeAllowlistGuard />)

    // Assert
    expect(setThemeSpy).not.toHaveBeenCalled()
  })
})
