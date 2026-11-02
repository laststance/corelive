/**
 * @fileoverview ThemeSelectorMenuItem — the sidebar "Change Theme" quick switch.
 *
 * Both axes are radio groups, so assistive tech announces the active mode and
 * palette (`menuitemradio` + `aria-checked`) instead of a visual-only highlight.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu'
import { ThemeProvider } from '@/providers/ThemeProvider'

import { ThemeSelectorMenuItem } from './ThemeSelectorMenuItem'

const STORAGE_KEY = 'corelive-theme'

/** Opens the "Change Theme" submenu with a pre-seeded stored theme. */
const openSubmenuWithStoredTheme = async (stored: string): Promise<void> => {
  window.localStorage.setItem(STORAGE_KEY, stored)
  const user = userEvent.setup()
  render(
    <ThemeProvider>
      <DropdownMenu open>
        <DropdownMenuContent>
          <ThemeSelectorMenuItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </ThemeProvider>,
  )
  await user.click(await screen.findByText('Change Theme'))
  await waitFor(() =>
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toBeVisible(),
  )
}

describe('ThemeSelectorMenuItem', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  test('marks the active mode and palette as checked radio items on Warm Cathedral dark', async () => {
    // Arrange / Act
    await openSubmenuWithStoredTheme('cathedral-dark')

    // Assert: exactly the active mode and palette are checked.
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(
      screen.getByRole('menuitemradio', { name: 'Light' }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByRole('menuitemradio', { name: 'Warm Cathedral' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('menuitemradio', { name: 'Default' }),
    ).toHaveAttribute('aria-checked', 'false')
    // Non-Default palettes have no System mode.
    expect(
      screen.queryByRole('menuitemradio', { name: 'System' }),
    ).not.toBeInTheDocument()
  })

  test('checks System and Default while following the device setting', async () => {
    // Arrange / Act
    await openSubmenuWithStoredTheme('system')

    // Assert
    expect(
      screen.getByRole('menuitemradio', { name: 'System' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('menuitemradio', { name: 'Default' }),
    ).toHaveAttribute('aria-checked', 'true')
  })
})
