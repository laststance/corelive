import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

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
  it('moves finished tasks to Completed by default — keep-in-list starts off', () => {
    // Arrange / Act — a fresh install.
    renderTaskSettings()

    // Assert — the keep-finished-tasks switch is off (default behavior moves them out).
    expect(
      screen.getByRole('switch', { name: 'Keep finished tasks in the list' }),
    ).not.toBeChecked()
  })

  it('keeps finished tasks in place when the switch is turned on', async () => {
    // Arrange
    const { store, user } = renderTaskSettings()

    // Act — turn on "Keep finished tasks in the list".
    await user.click(
      screen.getByRole('switch', { name: 'Keep finished tasks in the list' }),
    )

    // Assert — 居残りモード is now enabled in the settings slice.
    expect(store.getState().settings.retainCompletedInList).toBe(true)
  })

  it('shows completed task strikethrough by default', () => {
    // Arrange / Act — render a fresh install.
    renderTaskSettings()

    // Assert — the current completed-title treatment remains the default.
    expect(
      screen.getByRole('switch', {
        name: 'Show strikethrough on completed tasks',
      }),
    ).toBeChecked()
  })

  it('removes completed task strikethrough when the switch is turned off', async () => {
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
