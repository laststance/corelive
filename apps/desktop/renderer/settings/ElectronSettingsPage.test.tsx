// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { ElectronSettingsPage } from './ElectronSettingsPage'
import { renderWithSettings } from './settingsTestkit'

test('shows the Settings sections in the DA1 order, each labelled for assistive technology', async () => {
  // Arrange / Act
  await renderWithSettings(<ElectronSettingsPage />)

  // Assert
  const headings = screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
  expect(headings).toEqual([
    'LiveEditor',
    'Appearance',
    'Shortcuts & Sound',
    'Application',
    'Categories',
    'Updates',
    'Account',
  ])
  for (const region of screen.getAllByRole('region'))
    expect(region).toHaveAccessibleName()
})

test('renders without any network request, so Settings works offline', async () => {
  // Arrange
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  // Act
  await renderWithSettings(<ElectronSettingsPage />)

  // Assert
  expect(screen.getByRole('heading', { name: 'Application' })).toBeVisible()
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

test('applies the stored theme to the document before the first frame', async () => {
  // Arrange / Act
  await renderWithSettings(<ElectronSettingsPage />, {
    theme: 'cathedral-dark',
  })

  // Assert
  expect(document.documentElement.dataset.theme).toBe('cathedral-dark')
})

test('shows the three native switches at the values main reports', async () => {
  // Arrange / Act
  const { fake } = await renderWithSettings(<ElectronSettingsPage />)
  fake.api.settings.getLoginItemSettings.mockResolvedValue({
    openAtLogin: true,
  })

  // Assert
  const application = screen.getByRole('region', { name: 'Application' })
  expect(
    within(application).getByRole('switch', { name: 'Hide App Icon' }),
  ).not.toBeChecked()
  expect(
    within(application).getByRole('switch', { name: 'Show in Menu Bar' }),
  ).toBeChecked()
})

test('keeps Start at Login at its previous value when main refuses the change', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<ElectronSettingsPage />)
  fake.api.settings.setStartAtLogin.mockResolvedValue(false)
  const toggle = screen.getByRole('switch', { name: 'Start at Login' })

  // Act
  await user.click(toggle)

  // Assert
  await waitFor(() =>
    expect(fake.api.settings.setStartAtLogin).toHaveBeenCalledWith(true),
  )
  expect(toggle).not.toBeChecked()
})

test('persists Show in Menu Bar through main so it survives a restart', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<ElectronSettingsPage />)

  // Act
  await user.click(screen.getByRole('switch', { name: 'Show in Menu Bar' }))

  // Assert
  await waitFor(() =>
    expect(fake.api.settings.setShowInMenuBar).toHaveBeenCalledWith(false),
  )
  expect(
    screen.getByRole('switch', { name: 'Show in Menu Bar' }),
  ).not.toBeChecked()
})

test('saves Show Today Ember to the device workspace', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<ElectronSettingsPage />)

  // Act
  await user.click(screen.getByRole('switch', { name: 'Show Today Ember' }))

  // Assert
  await waitFor(() => expect(fake.stored.settings.showTodayEmber).toBe(true))
})

test('calls resetPopoverSize through the preload when Restore default size is pressed', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<ElectronSettingsPage />)

  // Act
  await user.click(screen.getByRole('button', { name: 'Restore default size' }))

  // Assert
  await waitFor(() =>
    expect(fake.api.settings.resetPopoverSize).toHaveBeenCalledTimes(1),
  )
})

test('opens Sync details from Account, hides the Settings sections behind it, and Back returns focus to the Account heading', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderWithSettings(<ElectronSettingsPage />, {
    account: { needsALookCount: 2 },
  })

  // Act
  await user.click(
    screen.getByRole('button', { name: '2 changes need a look' }),
  )

  // Assert: the details page replaces the sections
  expect(
    await screen.findByRole('heading', { name: 'Needs a look' }),
  ).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Application' })).toBeNull()

  // Act
  await user.click(screen.getByRole('button', { name: /Back to Settings/ }))

  // Assert
  expect(screen.getByRole('heading', { name: 'Application' })).toBeVisible()
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Account' })).toHaveFocus(),
  )
})
