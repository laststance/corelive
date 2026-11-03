// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import { SettingsProvider, useSettings } from './SettingsProvider'
import { createFakeSettingsApi, renderWithSettings } from './settingsTestkit'

afterEach(() => {
  delete document.documentElement.dataset.theme
})

/** Shows the effective Ember value and exposes both writers as buttons. */
function Probe() {
  const { settings, theme, saveFailed, updateSettings, updateTheme } =
    useSettings()
  return (
    <>
      <output aria-label="ember">{String(settings.showTodayEmber)}</output>
      <output aria-label="theme">{theme}</output>
      <output aria-label="failed">{String(saveFailed)}</output>
      <button onClick={() => updateSettings({ showTodayEmber: true })}>
        ember on
      </button>
      <button onClick={() => updateTheme('dark')}>dark</button>
    </>
  )
}

test('applies data-theme from the preload snapshot before any Settings content is shown', async () => {
  // Arrange / Act
  await renderWithSettings(<Probe />, { theme: 'dark' })

  // Assert
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(screen.getByLabelText('theme')).toHaveTextContent('dark')
})

test('renders nothing until the first snapshot arrives so an unthemed frame is never painted', async () => {
  // Arrange
  const fake = createFakeSettingsApi()
  fake.api.snapshot.mockImplementation(async () => new Promise(() => undefined))

  // Act
  await act(async () => {
    render(
      <SettingsProvider api={fake.api}>
        <p>Settings content</p>
      </SettingsProvider>,
    )
  })

  // Assert
  expect(screen.queryByText('Settings content')).not.toBeInTheDocument()
  expect(document.documentElement.dataset.theme).toBeUndefined()
})

test('saves a preference as one revisioned command and shows it immediately', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<Probe />)

  // Act
  await user.click(screen.getByRole('button', { name: 'ember on' }))

  // Assert
  expect(screen.getByLabelText('ember')).toHaveTextContent('true')
  await waitFor(() => expect(fake.stored.settings.showTodayEmber).toBe(true))
  expect(fake.api.preferences.patch).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      type: 'preferences',
      expectedRevision: 1,
      patch: { showTodayEmber: true },
    }),
  )
})

test('saves a theme change to the device workspace so the editor window receives it', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<Probe />)

  // Act
  await user.click(screen.getByRole('button', { name: 'dark' }))

  // Assert
  await waitFor(() => expect(fake.stored.theme).toBe('dark'))
  expect(document.documentElement.dataset.theme).toBe('dark')
})

test('re-reads the revision and retries once after a conflict, so an edit is not lost', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<Probe />)
  // Another writer advanced the stored revision after Settings read it.
  fake.stored.revision = 5

  // Act
  await user.click(screen.getByRole('button', { name: 'ember on' }))

  // Assert
  await waitFor(() => expect(fake.stored.settings.showTodayEmber).toBe(true))
  expect(fake.api.preferences.patch).toHaveBeenCalledTimes(2)
})

test('reverts the edit and reports a calm failure when main refuses the write', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<Probe />)
  fake.api.preferences.patch.mockResolvedValue({
    ok: false,
    reason: 'storage-failed',
  } as never)

  // Act
  await user.click(screen.getByRole('button', { name: 'ember on' }))

  // Assert
  await waitFor(() =>
    expect(screen.getByLabelText('failed')).toHaveTextContent('true'),
  )
  expect(screen.getByLabelText('ember')).toHaveTextContent('false')
})

test('picks up a main-side change notification by re-reading the snapshot', async () => {
  // Arrange
  const { fake } = await renderWithSettings(<Probe />)
  fake.stored.settings.showTodayEmber = true

  // Act
  await act(async () => {
    for (const [listener] of fake.api.onChanged.mock.calls) listener()
  })

  // Assert
  await waitFor(() =>
    expect(screen.getByLabelText('ember')).toHaveTextContent('true'),
  )
})
