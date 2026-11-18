// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { ElectronSettingsPage } from './ElectronSettingsPage'
import { renderWithSettings } from './settingsTestkit'

// Global stubs and the document theme must not leak into the next test, even after a failure.
afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

test('opens Settings with Application and the Dock icon switch first, with Account last', async () => {
  // Arrange / Act
  await renderWithSettings(<ElectronSettingsPage />)

  // Assert
  const menu = screen.getByRole('combobox', {
    name: 'Current settings section',
  })
  expect(menu).toHaveValue('Application')
  expect(
    within(menu)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual([
    'Application',
    'LiveEditor',
    'Appearance',
    'Shortcuts & Sound',
    'Categories',
    'Updates',
    'Account',
  ])
  const application = screen.getByRole('region', { name: 'Application' })
  expect(within(application).getAllByRole('switch')[0]).toHaveAccessibleName(
    'Hide App Icon',
  )
  expect(screen.getAllByRole('region')).toEqual([application])
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
  await renderWithSettings(<ElectronSettingsPage />, { openAtLogin: true })

  // Assert
  const application = screen.getByRole('region', { name: 'Application' })
  await waitFor(() =>
    expect(
      within(application).getByRole('switch', { name: 'Start at Login' }),
    ).toBeChecked(),
  )
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
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Current settings section' }),
    'LiveEditor',
  )
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
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Current settings section' }),
    'Account',
  )
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
  expect(
    screen.getByRole('combobox', { name: 'Current settings section' }),
  ).toHaveValue('Account')
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Account' })).toHaveFocus(),
  )
})

test('keeps the Dock switch value when returning from another section', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderWithSettings(<ElectronSettingsPage />)
  const menu = screen.getByRole('combobox', {
    name: 'Current settings section',
  })

  // Act
  await user.click(screen.getByRole('switch', { name: 'Hide App Icon' }))
  await user.selectOptions(menu, 'Categories')

  // Assert
  expect(screen.getByRole('region', { name: 'Categories' })).toBeVisible()
  expect(screen.queryByRole('switch', { name: 'Hide App Icon' })).toBeNull()

  // Act
  await user.selectOptions(menu, 'Application')

  // Assert
  expect(screen.getByRole('switch', { name: 'Hide App Icon' })).toBeChecked()
})

test('acknowledges the first upload notice only after Account is opened', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<ElectronSettingsPage />, {
    account: { state: 'attached', firstUpload: { state: 'done', count: 7 } },
  })
  expect(fake.api.account.acknowledgeFirstUpload).not.toHaveBeenCalled()

  // Act
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Current settings section' }),
    'Account',
  )

  // Assert
  expect(screen.getByText('7 keeps are on your dashboard')).toBeVisible()
  await waitFor(() =>
    expect(fake.api.account.acknowledgeFirstUpload).toHaveBeenCalledOnce(),
  )
})

test('preserves an upload notice that arrives while Sync details covers Account', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<ElectronSettingsPage />, {
    account: { state: 'attached', needsALookCount: 2 },
  })
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Current settings section' }),
    'Account',
  )
  await user.click(
    screen.getByRole('button', { name: '2 changes need a look' }),
  )

  // Act
  await act(async () => {
    fake.setAccount({ firstUpload: { state: 'done', count: 7 } })
  })

  // Assert
  expect(screen.getByRole('heading', { name: 'Needs a look' })).toBeVisible()
  expect(fake.api.account.acknowledgeFirstUpload).not.toHaveBeenCalled()

  // Act
  await user.click(screen.getByRole('button', { name: /Back to Settings/ }))

  // Assert
  expect(screen.getByText('7 keeps are on your dashboard')).toBeVisible()
  await waitFor(() =>
    expect(fake.api.account.acknowledgeFirstUpload).toHaveBeenCalledOnce(),
  )
})
