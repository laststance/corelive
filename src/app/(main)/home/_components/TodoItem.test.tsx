/**
 * @fileoverview TodoItem "Tuck into Completed" per-row button (#113).
 *
 * The sentinel: in 居残りモード (keep-finished-tasks ON), a finished row must offer
 * a NON-destructive button that files just that one task into Completed — taking
 * the exact slot the per-row trash vacates (D14). These tests fail if the button
 * leaks onto pending rows / non-retain mode, stops reusing the archive path, or
 * regresses to an accessible name that collides with the ImportUndoBanner
 * "Move to Completed" button or the skill-tree "completed task:" rows.
 *
 * Triggered when: `pnpm test` (Vitest, happy-dom).
 *
 * @example
 *   pnpm test -- TodoItem
 */
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import preferencesReducer, {
  initialState,
} from '@/lib/redux/slices/preferencesSlice'

import type { Todo } from './TodoItem'
import { TodoItem } from './TodoItem'

const FINISHED_TODO: Todo = {
  id: '7',
  text: 'Buy milk',
  completed: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const PENDING_TODO: Todo = {
  id: '8',
  text: 'Call mom',
  completed: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

/**
 * Renders a TodoItem under a real preferences store so the retain-mode branch is
 * exercised exactly as in the app.
 * @param todo - The row to render.
 * @param retainCompletedInList - 居残りモード on/off.
 * @param onDelete - Spy for the archive/delete callback (defaults to a noop spy).
 */
function renderTodoItem(
  todo: Todo,
  retainCompletedInList: boolean,
  onDelete = vi.fn(),
) {
  const store = configureStore({
    reducer: { preferences: preferencesReducer },
    preloadedState: {
      preferences: { ...initialState, retainCompletedInList },
    },
  })
  render(
    <Provider store={store}>
      <TodoItem todo={todo} onToggleComplete={vi.fn()} onDelete={onDelete} />
    </Provider>,
  )
  return { onDelete }
}

describe('TodoItem — Tuck into Completed (#113)', () => {
  it('offers the Tuck-into-Completed button on a finished row when keep-in-list is on', () => {
    // Arrange / Act — a finished task in 居残りモード.
    renderTodoItem(FINISHED_TODO, true)

    // Assert — the move affordance is present and the destructive trash is not.
    expect(
      screen.getByRole('button', { name: 'Tuck "Buy milk" into Completed' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
  })

  it('does not show the Tuck button on a pending row (the trash stays instead)', () => {
    // Arrange / Act — an unfinished task in 居残りモード.
    renderTodoItem(PENDING_TODO, true)

    // Assert — only completed rows can be tucked; the pending row keeps its trash.
    expect(
      screen.queryByRole('button', { name: /into Completed$/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('shows the normal Delete (not Tuck) on a finished row when keep-in-list is off', () => {
    // Arrange / Act — finished task, but 居残りモード is off (default behavior).
    renderTodoItem(FINISHED_TODO, false)

    // Assert — the per-task move affordance only exists in retain mode.
    expect(
      screen.queryByRole('button', { name: /into Completed$/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('files just that one finished task when the Tuck button is tapped', () => {
    // Arrange
    const { onDelete } = renderTodoItem(FINISHED_TODO, true)

    // Act — tap the move affordance.
    fireEvent.click(
      screen.getByRole('button', { name: 'Tuck "Buy milk" into Completed' }),
    )

    // Assert — it reuses the delete→archive path for exactly this row.
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith('7')
  })

  it('uses an accessible name that avoids the ImportUndoBanner and skill-tree collisions', () => {
    // Arrange / Act
    renderTodoItem(FINISHED_TODO, true)

    // Assert — distinct from "Move to Completed" (ImportUndoBanner, substring-
    // matched in e2e) and never starting with "completed task" (skill-tree e2e).
    const moveButton = screen.getByRole('button', {
      name: 'Tuck "Buy milk" into Completed',
    })
    expect(moveButton.getAttribute('aria-label')).toBe(
      'Tuck "Buy milk" into Completed',
    )
    expect(moveButton.getAttribute('aria-label')).not.toContain(
      'Move to Completed',
    )
    expect(moveButton.getAttribute('aria-label')).not.toMatch(
      /^completed task/i,
    )
  })

  it('disables the Tuck button after a tap so a finished row cannot be filed twice', () => {
    // Arrange
    renderTodoItem(FINISHED_TODO, true)
    const moveButton = screen.getByRole('button', {
      name: 'Tuck "Buy milk" into Completed',
    })
    expect(moveButton).not.toBeDisabled()

    // Act — tap once.
    fireEvent.click(moveButton)

    // Assert — the same-row guard disables it (covers the archive helper's
    // documented non-idempotent race between the click and the optimistic unmount).
    expect(moveButton).toBeDisabled()
  })
})
