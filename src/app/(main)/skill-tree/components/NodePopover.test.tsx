import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NodePopover } from './NodePopover'

describe('<NodePopover>', () => {
  const assignedTodos = [
    { id: 10, text: 'Fix auth bug' },
    { id: 11, text: 'Write tests' },
  ]

  it('shows assigned todos', () => {
    render(
      <NodePopover
        open
        onOpenChange={() => {}}
        node={{ id: 1, name: 'APIs', xp: 20 }}
        assignedTodos={assignedTodos}
        onUnassign={() => {}}
      >
        <button>Trigger</button>
      </NodePopover>,
    )
    expect(screen.getByText('Fix auth bug')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
  })

  it('fires onUnassign with correct todoId when × is clicked', () => {
    const onUnassign = vi.fn()
    render(
      <NodePopover
        open
        onOpenChange={() => {}}
        node={{ id: 1, name: 'APIs', xp: 20 }}
        assignedTodos={assignedTodos}
        onUnassign={onUnassign}
      >
        <button>Trigger</button>
      </NodePopover>,
    )
    const unassignButtons = screen.getAllByRole('button', {
      name: /unassign/i,
    })
    // noUncheckedIndexedAccess: non-null assertion is safe because getAllByRole would
    // have thrown if the array were empty.
    fireEvent.click(unassignButtons[0]!)
    expect(onUnassign).toHaveBeenCalledWith(10)
  })

  it('shows empty state when no tasks are assigned', () => {
    render(
      <NodePopover
        open
        onOpenChange={() => {}}
        node={{ id: 1, name: 'APIs', xp: 0 }}
        assignedTodos={[]}
        onUnassign={() => {}}
      >
        <button>Trigger</button>
      </NodePopover>,
    )
    expect(screen.getByText(/no tasks assigned/i)).toBeInTheDocument()
  })
})
