import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, test } from 'vitest'

import { TaskSettings } from '@/components/settings/TaskSettings'
import userSettingsReducer, {
  initialState,
} from '@/lib/redux/slices/settingsSlice'
import type { UserSettingsState } from '@/lib/schemas/settings'

/**
 * Renders the Task settings under a real settings store (so assertions read
 * the actual reducer result) with the given setting overrides.
 * @param overrides - Settings values that differ from current defaults.
 * @returns The store and user driver used by each observable-behavior test.
 * @example
 * renderTaskSettings({ showCompletedTaskStrikethrough: false })
 */
function renderTaskSettings(overrides: Partial<UserSettingsState> = {}) {
  const store = configureStore({
    reducer: { settings: userSettingsReducer },
    preloadedState: { settings: { ...initialState, ...overrides } },
  })
  const user = userEvent.setup()
  render(
    <Provider store={store}>
      <TaskSettings />
    </Provider>,
  )
  return { store, user }
}

describe('TaskSettings', () => {
  test('keeps Today Ember hidden until its switch is enabled', () => {
    // Arrange / Act
    renderTaskSettings()

    // Assert
    expect(
      screen.getByRole('switch', { name: 'Show Today Ember' }),
    ).not.toBeChecked()
  })

  test('saves both on and off choices from the Today Ember switch', async () => {
    // Arrange
    const { store, user } = renderTaskSettings()
    const emberSwitch = screen.getByRole('switch', { name: 'Show Today Ember' })

    // Act
    await user.click(emberSwitch)

    // Assert
    expect(emberSwitch).toBeChecked()
    expect(store.getState().settings.showTodayEmber).toBe(true)

    // Act
    await user.click(emberSwitch)

    // Assert
    expect(emberSwitch).not.toBeChecked()
    expect(store.getState().settings.showTodayEmber).toBe(false)
  })

  test('shows a previously enabled Today Ember setting on reopening settings', () => {
    // Arrange / Act
    renderTaskSettings({ showTodayEmber: true })

    // Assert
    expect(
      screen.getByRole('switch', { name: 'Show Today Ember' }),
    ).toBeChecked()
  })

  test('offers completed-history decoration without the unused keep-in-list setting', () => {
    // Arrange / Act
    renderTaskSettings()

    // Assert
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(
      screen.queryByRole('switch', { name: 'Keep finished tasks in the list' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Draw a line through task titles in your completed history.',
      ),
    ).toBeInTheDocument()
  })
  test('shows completed task strikethrough by default', () => {
    // Arrange / Act — render a fresh install.
    renderTaskSettings()

    // Assert — the current completed-title treatment remains the default.
    expect(
      screen.getByRole('switch', {
        name: 'Show strikethrough on completed tasks',
      }),
    ).toBeChecked()
  })

  test('removes completed task strikethrough when the switch is turned off', async () => {
    // Arrange
    const { store, user } = renderTaskSettings()

    // Act — turn off the completed-title line decoration.
    await user.click(
      screen.getByRole('switch', {
        name: 'Show strikethrough on completed tasks',
      }),
    )

    // Assert — the persisted settings slice records the opt-out.
    expect(store.getState().settings.showCompletedTaskStrikethrough).toBe(false)
  })
})
