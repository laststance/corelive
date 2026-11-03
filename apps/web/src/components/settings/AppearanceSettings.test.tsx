import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { AppearanceSettings } from './AppearanceSettings'

test('the web Settings page offers only the Appearance section', async () => {
  // Arrange / Act
  render(
    <ThemeProvider>
      <AppearanceSettings />
    </ThemeProvider>,
  )

  // Assert
  const section = screen.getByRole('region', { name: 'Appearance' })
  expect(section).toBeVisible()
  expect(await within(section).findByText('Palette')).toBeVisible()
  expect(screen.queryByText('Show Today Ember')).not.toBeInTheDocument()
  expect(screen.queryByText('Hide App Icon')).not.toBeInTheDocument()
})
