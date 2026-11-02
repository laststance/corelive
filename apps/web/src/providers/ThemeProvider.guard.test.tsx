import { render, screen, waitFor } from '@testing-library/react'
import { useTheme } from 'next-themes'
import { describe, test, expect, beforeEach } from 'vitest'

import { ThemeProvider } from './ThemeProvider'

// End-to-end wiring: the REAL next-themes provider (no mock) reads localStorage,
// and the guard rendered inside it must heal an unregistered value. This is what
// the mocked unit test cannot prove — that the guard is actually wired in.
const STORAGE_KEY = 'corelive-theme'

describe('ThemeProvider — heals a tampered persisted theme end to end', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  test('rewrites an unregistered persisted theme to system after mount', async () => {
    // Arrange — a stale/tampered id next-themes would otherwise apply verbatim
    // ('sunset' is not a registered family — mimics a downgrade that dropped one)
    window.localStorage.setItem(STORAGE_KEY, 'sunset-dark')

    // Act
    render(
      <ThemeProvider>
        <div>app</div>
      </ThemeProvider>,
    )

    // Assert — the guard persists the correction back to storage
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('system')
    })
  })

  test('leaves a registered persisted theme untouched', async () => {
    // Arrange
    window.localStorage.setItem(STORAGE_KEY, 'dark')

    // Act
    render(
      <ThemeProvider>
        <div>app</div>
      </ThemeProvider>,
    )

    // Assert — a real choice is never clobbered by the guard
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark')
    })
  })
})

describe('ThemeProvider — fresh state follows the OS', () => {
  /** Prints the theme preference next-themes currently holds. */
  function ThemeProbe() {
    const { theme } = useTheme()
    return <p data-testid="stored-theme">{theme}</p>
  }

  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  test('starts on system when nothing is stored so a fresh install is not stuck on a fixed palette', async () => {
    // Arrange / Act
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('stored-theme')).toHaveTextContent('system')
    })
  })

  test('rewrites a legacy default-dark preference to dark so the pick survives the id swap', async () => {
    // Arrange
    window.localStorage.setItem(STORAGE_KEY, 'default-dark')

    // Act
    render(
      <ThemeProvider>
        <div>app</div>
      </ThemeProvider>,
    )

    // Assert
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark')
    })
  })
})
