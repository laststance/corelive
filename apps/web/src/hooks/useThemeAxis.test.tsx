import { render, fireEvent, waitFor, screen } from '@testing-library/react'
import { describe, test, expect, beforeEach } from 'vitest'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { useThemeAxis } from './useThemeAxis'

// Drive the hook through the REAL ThemeProvider (no next-themes mock), the same
// end-to-end approach as ThemeProvider.guard.test — these prove the System
// rule and the (family, mode) ↔ stored-id mapping in the Node validate loop.
const STORAGE_KEY = 'corelive-theme'

/** Minimal harness: renders the axis state + a button per family/mode to click. */
function ThemeAxisHarness() {
  const {
    family,
    mode,
    isSystem,
    activeId,
    availableModes,
    families,
    setFamily,
    setMode,
  } = useThemeAxis()

  return (
    <div>
      <span data-testid="active">{activeId}</span>
      <span data-testid="family">{family}</span>
      <span data-testid="mode">{mode}</span>
      <span data-testid="is-system">{String(isSystem)}</span>
      <span data-testid="modes">{availableModes.join(',')}</span>
      {families.map(({ family: familyId }) => (
        <button
          key={familyId}
          data-testid={`fam-${familyId}`}
          onClick={() => setFamily(familyId)}
        >
          {familyId}
        </button>
      ))}
      {availableModes.map((modeChoice) => (
        <button
          key={modeChoice}
          data-testid={`mode-${modeChoice}`}
          onClick={() => setMode(modeChoice)}
        >
          {modeChoice}
        </button>
      ))}
    </div>
  )
}

const renderHarness = () =>
  render(
    <ThemeProvider>
      <ThemeAxisHarness />
    </ThemeProvider>,
  )

/** Reads the mode buttons the harness currently offers, in order. */
const offeredModes = (): string => screen.getByTestId('modes').textContent ?? ''

/** Starts the harness with a pre-seeded stored theme and waits for hydration. */
const renderWithStoredTheme = async (stored: string | null): Promise<void> => {
  if (stored !== null) window.localStorage.setItem(STORAGE_KEY, stored)
  renderHarness()
  await waitFor(() => expect(screen.getByTestId('active')).toBeVisible())
}

describe('useThemeAxis — two-axis (family × mode) theme selection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  test('starts on System in the Default family when nothing is stored, offering Light, Dark and System', async () => {
    // Arrange / Act
    await renderWithStoredTheme(null)

    // Assert
    expect(screen.getByTestId('family')).toHaveTextContent('default')
    expect(screen.getByTestId('is-system')).toHaveTextContent('true')
    expect(offeredModes()).toBe('light,dark,system')
  })

  test('offers only Light and Dark for Warm Cathedral and every other family', async () => {
    // Arrange / Act
    await renderWithStoredTheme('cathedral-light')

    // Assert
    expect(screen.getByTestId('family')).toHaveTextContent('cathedral')
    expect(offeredModes()).toBe('light,dark')
  })

  test('from System, choosing Default stays on System', async () => {
    // Arrange
    await renderWithStoredTheme('system')

    // Act
    fireEvent.click(screen.getByTestId('fam-default'))

    // Assert
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('system'),
    )
  })

  test('from System on a light OS, choosing Warm Cathedral selects cathedral-light', async () => {
    // Arrange
    await renderWithStoredTheme('system')

    // Act
    fireEvent.click(screen.getByTestId('fam-cathedral'))

    // Assert
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('cathedral-light'),
    )
    expect(offeredModes()).toBe('light,dark')
  })

  test('from System, choosing Harbor selects the explicit harbor id at the resolved mode', async () => {
    // Arrange
    await renderWithStoredTheme('system')

    // Act
    fireEvent.click(screen.getByTestId('fam-harbor'))

    // Assert
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('harbor-light'),
    )
    expect(screen.getByTestId('is-system')).toHaveTextContent('false')
  })

  test('from cathedral-light, picking System selects the Default pair on System', async () => {
    // Arrange
    await renderWithStoredTheme('cathedral-light')
    // Warm Cathedral cannot offer System, so go via Default first
    fireEvent.click(screen.getByTestId('fam-default'))
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light'),
    )

    // Act
    fireEvent.click(screen.getByTestId('mode-system'))

    // Assert
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('system'),
    )
    expect(screen.getByTestId('family')).toHaveTextContent('default')
  })

  test('from cathedral-light, toggling to dark selects cathedral-dark', async () => {
    // Arrange
    await renderWithStoredTheme('cathedral-light')

    // Act
    fireEvent.click(screen.getByTestId('mode-dark'))

    // Assert
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('cathedral-dark'),
    )
  })

  test('from light, toggling to dark selects the flat dark id', async () => {
    // Arrange
    await renderWithStoredTheme('light')

    // Act
    fireEvent.click(screen.getByTestId('mode-dark'))

    // Assert
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark'),
    )
  })

  test('from light, choosing Warm Cathedral selects cathedral-light', async () => {
    // Arrange
    await renderWithStoredTheme('light')

    // Act
    fireEvent.click(screen.getByTestId('fam-cathedral'))

    // Assert
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('cathedral-light'),
    )
  })

  test('applies the matching theme id when a family is chosen and keeps the family when the mode is toggled', async () => {
    // Arrange
    await renderWithStoredTheme('light')

    // Act — choose the Harbor family (mode stays light)
    fireEvent.click(screen.getByTestId('fam-harbor'))

    // Assert — (harbor, light) → 'harbor-light'
    await waitFor(() =>
      expect(screen.getByTestId('active')).toHaveTextContent('harbor-light'),
    )
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('harbor-light')

    // Act — toggle the mode to dark
    fireEvent.click(screen.getByTestId('mode-dark'))

    // Assert — (harbor, dark) → 'harbor-dark' (family preserved across the toggle)
    await waitFor(() =>
      expect(screen.getByTestId('active')).toHaveTextContent('harbor-dark'),
    )
    expect(screen.getByTestId('family')).toHaveTextContent('harbor')
  })

  test('maps the Default family back to the FLAT light/dark id and offers System again', async () => {
    // Arrange — a colored family in dark mode
    await renderWithStoredTheme('harbor-dark')

    // Act — return to Default, mode preserved (dark)
    fireEvent.click(screen.getByTestId('fam-default'))

    // Assert — Default uses the flat id 'dark', and System is offered again
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark'),
    )
    expect(screen.getByTestId('active')).toHaveTextContent(/^dark$/)
    expect(screen.getByTestId('family')).toHaveTextContent('default')
    expect(offeredModes()).toBe('light,dark,system')
  })

  test('reads a legacy default-dark preference as the dark Default theme immediately', async () => {
    // Arrange / Act — the guard has not rewritten storage yet on first render
    await renderWithStoredTheme('default-dark')

    // Assert
    await waitFor(() =>
      expect(screen.getByTestId('family')).toHaveTextContent('default'),
    )
    expect(screen.getByTestId('active')).toHaveTextContent(/^dark$/)
  })
})
