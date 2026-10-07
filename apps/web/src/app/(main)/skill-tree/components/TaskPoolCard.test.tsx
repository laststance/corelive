import { DragDropProvider } from '@dnd-kit/react'
import { render, screen } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, test } from 'vitest'

import type { TodoId, TodoText } from '../lib/domain-types'

import { TaskPoolCard } from './TaskPoolCard'

function wrap(ui: React.ReactNode) {
  return <DragDropProvider>{ui}</DragDropProvider>
}

/**
 * Creates a TodoId value for tests.
 * @param value - Numeric todo identifier.
 * @returns TodoId compatible with component props.
 * @example
 * createTodoId(1)
 */
function createTodoId(value: number): TodoId {
  return value
}

/**
 * Creates a TodoText value for tests.
 * @param value - Todo display text.
 * @returns TodoText compatible with component props.
 * @example
 * createTodoText('Fix login bug')
 */
function createTodoText(value: string): TodoText {
  return value
}

describe('<TaskPoolCard>', () => {
  test('shows the todo text', () => {
    render(
      wrap(
        <TaskPoolCard
          id={createTodoId(1)}
          text={createTodoText('Fix login bug')}
        />,
      ),
    )
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
  })

  test('is a button with role and is tabbable', () => {
    render(
      wrap(
        <TaskPoolCard
          id={createTodoId(1)}
          text={createTodoText('Fix login bug')}
        />,
      ),
    )
    const btn = screen.getByRole('button', { name: /fix login bug/i })
    expect(btn).toHaveAttribute('tabindex', '0')
  })
})
