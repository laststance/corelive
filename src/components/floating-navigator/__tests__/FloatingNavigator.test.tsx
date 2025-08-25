import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi } from 'vitest'

import { FloatingNavigator, type FloatingTodo } from '../FloatingNavigator'

// Mock window.floatingNavigatorAPI
const mockFloatingNavigatorAPI = {
  window: {
    minimize: vi.fn(),
    close: vi.fn(),
    toggleAlwaysOnTop: vi.fn().mockResolvedValue(true),
    focusMainWindow: vi.fn(),
  },
}

Object.defineProperty(window, 'floatingNavigatorAPI', {
  value: mockFloatingNavigatorAPI,
  writable: true,
})

const mockTodos: FloatingTodo[] = [
  {
    id: '1',
    text: 'Test todo 1',
    completed: false,
    createdAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    text: 'Test todo 2',
    completed: true,
    createdAt: new Date('2024-01-02'),
  },
]

const mockProps = {
  todos: mockTodos,
  onTaskToggle: vi.fn(),
  onTaskCreate: vi.fn(),
  onTaskEdit: vi.fn(),
  onTaskDelete: vi.fn(),
}

describe('FloatingNavigator', () => {
  it('renders the component with todos', () => {
    render(<FloatingNavigator {...mockProps} />)

    expect(screen.getByText('Quick Tasks')).toBeInTheDocument()
    expect(screen.getByText('1 pending')).toBeInTheDocument()
    expect(screen.getByText('Test todo 1')).toBeInTheDocument()
    expect(screen.getByText('Completed (1)')).toBeInTheDocument()
  })

  it('allows creating a new task', () => {
    render(<FloatingNavigator {...mockProps} />)

    const input = screen.getByPlaceholderText('Add task...')
    const addButton = screen.getByLabelText('Add task')

    fireEvent.change(input, { target: { value: 'New task' } })
    fireEvent.click(addButton)

    expect(mockProps.onTaskCreate).toHaveBeenCalledWith('New task')
  })

  it('allows toggling task completion', () => {
    render(<FloatingNavigator {...mockProps} />)

    const checkbox = screen.getAllByRole('checkbox')[0]
    if (checkbox) {
      fireEvent.click(checkbox)
    }

    expect(mockProps.onTaskToggle).toHaveBeenCalledWith('1')
  })

  it('shows window controls when in floating navigator environment', () => {
    render(<FloatingNavigator {...mockProps} />)

    expect(screen.getByTitle('Open main window')).toBeInTheDocument()
    expect(screen.getByTitle('Disable always on top')).toBeInTheDocument()
    expect(screen.getByTitle('Minimize')).toBeInTheDocument()
    expect(screen.getByTitle('Close')).toBeInTheDocument()
  })

  it('handles window control actions', async () => {
    render(<FloatingNavigator {...mockProps} />)

    const minimizeButton = screen.getByTitle('Minimize')
    const closeButton = screen.getByTitle('Close')

    fireEvent.click(minimizeButton)
    expect(mockFloatingNavigatorAPI.window.minimize).toHaveBeenCalled()

    fireEvent.click(closeButton)
    expect(mockFloatingNavigatorAPI.window.close).toHaveBeenCalled()
  })

  it('allows editing tasks inline', () => {
    render(<FloatingNavigator {...mockProps} />)

    const taskText = screen.getByText('Test todo 1')
    fireEvent.click(taskText)

    const editInput = screen.getByDisplayValue('Test todo 1')
    fireEvent.change(editInput, { target: { value: 'Updated task' } })
    fireEvent.keyDown(editInput, { key: 'Enter', code: 'Enter' })

    expect(mockProps.onTaskEdit).toHaveBeenCalledWith('1', 'Updated task')
  })

  it('shows empty state when no todos', () => {
    render(<FloatingNavigator {...mockProps} todos={[]} />)

    expect(screen.getByText('No tasks yet. Add one above!')).toBeInTheDocument()
    expect(screen.getByText('0 pending')).toBeInTheDocument()
  })
})
