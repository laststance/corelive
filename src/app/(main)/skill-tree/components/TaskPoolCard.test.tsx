import { DndContext } from '@dnd-kit/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { TodoId, TodoText } from '../lib/domain-types'

import { TaskPoolCard } from './TaskPoolCard'

function wrap(ui: React.ReactNode) {
  return <DndContext>{ui}</DndContext>
}

/**
 * Creates a TodoId value for tests.
 * @param value - Numeric todo identifier.
 * @returns TodoId compatible with component props.
 * @example
 * createTodoId(1)
 */
function createTodoId(value: number): TodoId {
  return value as TodoId
}

/**
 * Creates a TodoText value for tests.
 * @param value - Todo display text.
 * @returns TodoText compatible with component props.
 * @example
 * createTodoText('Fix login bug')
 */
function createTodoText(value: string): TodoText {
  return value as TodoText
}

describe('<TaskPoolCard>', () => {
  it('shows the todo text', () => {
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

  it('is a button with role and is tabbable', () => {
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
