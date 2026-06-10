import { render, fireEvent, waitFor, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { useThemeAxis } from './useThemeAxis'

// Drive the hook through the REAL ThemeProvider (no next-themes mock), the same
// end-to-end approach as ThemeProvider.guard.test — these prove the Fork-A System
// rule and the (family, mode) ↔ stored-id mapping that the storybook play-tests
// exercise in a browser, but here in the Node validate loop.
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

describe('useThemeAxis — two-axis (family × mode) theme selection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('applies the matching theme id when a family is chosen and keeps the family when the mode is toggled', async () => {
    // Arrange — default state is Warm Cathedral light
    renderHarness()
    await waitFor(() =>
      expect(screen.getByTestId('family')).toHaveTextContent('cathedral'),
    )

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

  it('treats System as the OS-managed Warm Cathedral pair, offered only for the default family', async () => {
    // Arrange — start on the default family, which exposes System
    renderHarness()
    await waitFor(() =>
      expect(screen.getByTestId('modes')).toHaveTextContent(
        'light,dark,system',
      ),
    )

    // Act — pick System
    fireEvent.click(screen.getByTestId('mode-system'))

    // Assert — System is stored verbatim and resolves to the default family
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('system'),
    )
    expect(screen.getByTestId('is-system')).toHaveTextContent('true')
    expect(screen.getByTestId('family')).toHaveTextContent('cathedral')
  })

  it('drops System for colored families and collapses a System selection to an explicit id', async () => {
    // Arrange — begin on System (default family, OS-managed)
    renderHarness()
    await waitFor(() =>
      expect(screen.getByTestId('mode-system')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByTestId('mode-system'))
    await waitFor(() =>
      expect(screen.getByTestId('is-system')).toHaveTextContent('true'),
    )

    // Act — switch to a colored family while on System
    fireEvent.click(screen.getByTestId('fam-grove'))

    // Assert — System collapses to an explicit grove id, and System is no longer offered
    await waitFor(() =>
      expect(screen.getByTestId('is-system')).toHaveTextContent('false'),
    )
    expect(screen.getByTestId('active')).toHaveTextContent(
      /^grove-(light|dark)$/,
    )
    expect(screen.getByTestId('modes')).toHaveTextContent('light,dark')
    expect(screen.getByTestId('modes')).not.toHaveTextContent('system')
  })
})
