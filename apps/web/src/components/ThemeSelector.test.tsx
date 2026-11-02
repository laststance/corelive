/**
 * @fileoverview ThemeSelector — the Settings Mode × Palette picker.
 *
 * Driven through the REAL ThemeProvider (no next-themes mock) so the stored
 * theme id decides which palette is active, exactly as in the app.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { ThemeSelector } from './ThemeSelector'

const STORAGE_KEY = 'corelive-theme'
const HINT =
  "To follow your device's light or dark setting, choose the Default palette, then select System."

/** Renders the picker with a pre-seeded stored theme and waits for hydration. */
const renderWithStoredTheme = async (stored: string): Promise<void> => {
  window.localStorage.setItem(STORAGE_KEY, stored)
  render(
    <ThemeProvider>
      <ThemeSelector />
    </ThemeProvider>,
  )
  await waitFor(() =>
    expect(
      screen.getByRole('radiogroup', { name: 'Theme mode' }),
    ).toBeVisible(),
  )
}

describe('ThemeSelector', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  test('shows no device-setting helper line while the Default palette is active', async () => {
    // Arrange / Act
    await renderWithStoredTheme('light')

    // Assert: Default owns System, so there is nothing to explain.
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
    expect(
      screen.getByRole('radiogroup', { name: 'Theme mode' }),
    ).not.toHaveAttribute('aria-describedby')
    expect(screen.getByTestId('theme-mode-system')).toBeVisible()
  })

  test.each([
    ['Warm Cathedral', 'cathedral-light'],
    ['Harbor', 'harbor-dark'],
  ])(
    'explains how to follow the device setting and links it to the Mode toggle on %s',
    async (_label, stored) => {
      // Arrange / Act
      await renderWithStoredTheme(stored)

      // Assert: helper line visible, described-by points at it, and System is not offered.
      const hint = screen.getByText(HINT)
      expect(hint).toBeVisible()
      expect(hint).toHaveClass('type-small', 'text-muted-foreground')
      expect(
        screen.getByRole('radiogroup', { name: 'Theme mode' }),
      ).toHaveAttribute('aria-describedby', hint.id)
      expect(screen.queryByTestId('theme-mode-system')).not.toBeInTheDocument()
    },
  )
})
