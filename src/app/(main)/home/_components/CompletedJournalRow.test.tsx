import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import userSettingsReducer, {
  initialState,
} from '@/lib/redux/slices/settingsSlice'
import type { UserSettingsState } from '@/lib/schemas/settings'
import type { DayDetailTask } from '@/server/schemas/completed'

import { CompletedJournalRow } from './CompletedJournalRow'

const COMPLETED_ENTRY: DayDetailTask = {
  source: 'todo',
  id: 42,
  title: 'Ship the update',
  completedAt: new Date('2026-08-07T09:00:00Z'),
  category: null,
}

/**
 * Renders a journal row with persisted settings so title decoration follows the real selector.
 * @param settingsOverrides - Settings values that differ from the current defaults.
 * @returns The Testing Library render result.
 * @example
 * renderCompletedJournalRow({ showCompletedTaskStrikethrough: false })
 */
function renderCompletedJournalRow(
  settingsOverrides: Partial<UserSettingsState> = {},
) {
  const store = configureStore({
    reducer: { settings: userSettingsReducer },
    preloadedState: { settings: { ...initialState, ...settingsOverrides } },
  })

  return render(
    <Provider store={store}>
      <CompletedJournalRow entry={COMPLETED_ENTRY} />
    </Provider>,
  )
}

describe('CompletedJournalRow title presentation', () => {
  it('keeps the existing strikethrough on a fresh install', () => {
    // Arrange
    const settingsOverrides: Partial<UserSettingsState> = {}

    // Act
    renderCompletedJournalRow(settingsOverrides)

    // Assert — existing users keep the familiar completed-title treatment.
    expect(screen.getByText('Ship the update')).toHaveClass('line-through')
  })

  it('shows a completed journal title without a line when strikethrough is off', () => {
    // Arrange
    const settingsOverrides = { showCompletedTaskStrikethrough: false }

    // Act
    renderCompletedJournalRow(settingsOverrides)

    // Assert — the title remains muted but loses only the line decoration.
    const title = screen.getByText('Ship the update')
    expect(title).not.toHaveClass('line-through')
    expect(title).toHaveClass('text-muted-foreground')
  })
})
