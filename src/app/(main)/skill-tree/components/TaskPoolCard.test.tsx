import { DndContext } from '@dnd-kit/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TaskPoolCard } from './TaskPoolCard'

function wrap(ui: React.ReactNode) {
  return <DndContext>{ui}</DndContext>
}

describe('<TaskPoolCard>', () => {
  it('shows the todo text', () => {
    render(wrap(<TaskPoolCard id={1} text="Fix login bug" />))
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
  })

  it('is a button with role and is tabbable', () => {
    render(wrap(<TaskPoolCard id={1} text="Fix login bug" />))
    const btn = screen.getByRole('button', { name: /fix login bug/i })
    expect(btn).toHaveAttribute('tabindex', '0')
  })
})
