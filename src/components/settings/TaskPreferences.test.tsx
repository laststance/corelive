import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import { TaskPreferences } from '@/components/settings/TaskPreferences'
import preferencesReducer, {
  initialState,
} from '@/lib/redux/slices/preferencesSlice'
import type { PreferencesState } from '@/lib/schemas/preferences'

/**
 * Renders the Task preferences under a real preferences store (so assertions read
 * the actual reducer result) with the given preference overrides.
 */
function renderTaskPreferences(overrides: Partial<PreferencesState> = {}) {
  const store = configureStore({
    reducer: { preferences: preferencesReducer },
    preloadedState: { preferences: { ...initialState, ...overrides } },
  })
  const user = userEvent.setup()
  render(
    <Provider store={store}>
      <TaskPreferences />
    </Provider>,
  )
  return { store, user }
}

describe('TaskPreferences — 居残りモード', () => {
  it('moves finished tasks to Completed by default — keep-in-list starts off', () => {
    // Arrange / Act — a fresh install.
    renderTaskPreferences()

    // Assert — the keep-finished-tasks switch is off (default behavior moves them out).
    expect(
      screen.getByRole('switch', { name: 'Keep finished tasks in the list' }),
    ).not.toBeChecked()
  })

  it('keeps finished tasks in place when the switch is turned on', async () => {
    // Arrange
    const { store, user } = renderTaskPreferences()

    // Act — turn on "Keep finished tasks in the list".
    await user.click(
      screen.getByRole('switch', { name: 'Keep finished tasks in the list' }),
    )

    // Assert — 居残りモード is now enabled in the preferences slice.
    expect(store.getState().preferences.retainCompletedInList).toBe(true)
  })
})
