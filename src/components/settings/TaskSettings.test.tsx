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
 * renderTaskSettings({ showTodayEmber: true })
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

  test('offers Today Ember without the retired task presentation settings', () => {
    // Arrange / Act
    renderTaskSettings()

    // Assert
    expect(screen.getAllByRole('switch')).toHaveLength(1)
    expect(
      screen.getByRole('switch', { name: 'Show Today Ember' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('switch', { name: 'Keep finished tasks in the list' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('switch', {
        name: 'Show strikethrough on completed tasks',
      }),
    ).not.toBeInTheDocument()
  })
})
