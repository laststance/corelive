import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { vi } from 'vitest'

import { FloatingNavigator, type FloatingTodo } from '../FloatingNavigator'

// Mock the lazy-loaded icons
vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="plus-icon">+</div>,
  Check: () => <div data-testid="check-icon">✓</div>,
  CheckIcon: () => <div data-testid="check-icon">✓</div>,
  X: () => <div data-testid="x-icon">×</div>,
  Edit2: () => <div data-testid="edit-icon">✎</div>,
  Trash2: () => <div data-testid="trash-icon">🗑</div>,
  Minimize2: () => <div data-testid="minimize-icon">−</div>,
  Pin: () => <div data-testid="pin-icon">📌</div>,
  PinOff: () => <div data-testid="pin-off-icon">📌</div>,
  ExternalLink: () => <div data-testid="external-link-icon">↗</div>,
}))

// Mock floating navigator API
const mockFloatingNavigatorAPI = {
  window: {
    minimize: vi.fn(),
    close: vi.fn(),
    toggleAlwaysOnTop: vi.fn().mockResolvedValue(true),
    focusMainWindow: vi.fn(),
  },
}

// Setup window mock
Object.defineProperty(window, 'floatingNavigatorAPI', {
  value: mockFloatingNavigatorAPI,
  writable: true,
})

const mockTodos: FloatingTodo[] = [
  {
    id: '1',
    text: 'Complete accessibility testing',
    completed: false,
    createdAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    text: 'Review ARIA labels',
    completed: false,
    createdAt: new Date('2024-01-02'),
  },
  {
    id: '3',
    text: 'Test keyboard navigation',
    completed: true,
    createdAt: new Date('2024-01-03'),
  },
]

const defaultProps = {
  todos: mockTodos,
  onTaskToggle: vi.fn(),
  onTaskCreate: vi.fn(),
  onTaskEdit: vi.fn(),
  onTaskDelete: vi.fn(),
}

describe('FloatingNavigator Accessibility - Core Features', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Accessibility Structure', () => {
    it('should have proper application role and label', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const app = screen.getByRole('application')
      expect(app).toHaveAttribute('aria-label', 'Floating Task Navigator')
    })

    it('should have proper heading structure', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const mainHeading = screen.getByRole('heading', { level: 1 })
      expect(mainHeading).toHaveTextContent('Quick Tasks')

      const completedHeading = screen.getByRole('heading', { level: 2 })
      expect(completedHeading).toHaveTextContent('Completed (1)')
    })

    it('should have skip link for keyboard navigation', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const skipLink = screen.getByText('Skip to task input')
      expect(skipLink).toHaveAttribute('href', '#task-input')
    })

    it('should have live region for screen reader announcements', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const liveRegion = screen.getByRole('status')
      expect(liveRegion).toHaveAttribute('aria-live', 'polite')
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true')
    })
  })

  describe('Form Accessibility', () => {
    it('should have properly labeled input field', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const input = screen.getByRole('textbox', { name: 'New task title' })
      expect(input).toHaveAttribute('id', 'task-input')
      expect(input).toHaveAttribute('aria-describedby', 'task-input-help')

      const helpText = screen.getByText(/Type a task title and press Enter/)
      expect(helpText).toHaveAttribute('id', 'task-input-help')
    })

    it('should have properly labeled add button', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const addButton = screen.getByRole('button', { name: 'Add task' })
      expect(addButton).toHaveAttribute('title', 'Add task (Enter)')
    })
  })

  describe('Task List Accessibility', () => {
    it('should have proper list structure', () => {
      render(<FloatingNavigator {...defaultProps} />)

      // Check for pending tasks list
      const pendingSection = screen.getByLabelText('Pending tasks')
      expect(pendingSection).toBeInTheDocument()

      // Check for completed tasks list
      const completedSection = screen.getByLabelText('Completed tasks')
      expect(completedSection).toBeInTheDocument()
    })

    it('should have properly labeled checkboxes', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const pendingCheckbox = screen.getByRole('checkbox', {
        name: /Mark task "Complete accessibility testing" as complete/,
      })
      expect(pendingCheckbox).toBeInTheDocument()
      expect(pendingCheckbox).not.toBeChecked()

      const completedCheckbox = screen.getByRole('checkbox', {
        name: /Mark completed task "Test keyboard navigation" as incomplete/,
      })
      expect(completedCheckbox).toBeInTheDocument()
      expect(completedCheckbox).toBeChecked()
    })

    it('should have properly labeled action buttons', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const editButton = screen.getByRole('button', {
        name: 'Edit task: Complete accessibility testing',
      })
      expect(editButton).toBeInTheDocument()

      const deleteButton = screen.getByRole('button', {
        name: 'Delete task: Complete accessibility testing',
      })
      expect(deleteButton).toBeInTheDocument()
    })
  })

  describe('Window Controls Accessibility', () => {
    it('should have properly labeled window control buttons', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const toolbar = screen.getByRole('toolbar', { name: 'Window controls' })
      expect(toolbar).toBeInTheDocument()

      expect(
        screen.getByRole('button', { name: 'Open main window' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Disable always on top' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Minimize window' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Close window' }),
      ).toBeInTheDocument()
    })

    it('should have toggle button with proper pressed state', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const toggleButton = screen.getByRole('button', {
        name: 'Disable always on top',
      })
      expect(toggleButton).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('Keyboard Navigation', () => {
    it('should support Ctrl+N shortcut to focus input', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      await user.keyboard('{Control>}n{/Control}')

      const taskInput = screen.getByRole('textbox', { name: 'New task title' })
      expect(taskInput).toHaveFocus()
    })

    it('should support Enter key to create task', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      const input = screen.getByRole('textbox', { name: 'New task title' })
      await user.type(input, 'New test task')
      await user.keyboard('{Enter}')

      expect(defaultProps.onTaskCreate).toHaveBeenCalledWith('New test task')
    })
  })

  describe('Focus Management', () => {
    it('should have visible focus indicators on interactive elements', () => {
      render(<FloatingNavigator {...defaultProps} />)

      // Check that buttons have focus-visible classes
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toHaveClass('focus-visible:ring-2')
      })

      // Check that input has focus-visible classes
      const input = screen.getByRole('textbox', { name: 'New task title' })
      expect(input).toHaveClass('focus-visible:ring-2')
    })

    it('should manage focus during editing', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      // Click edit button
      const editButton = screen.getByRole('button', {
        name: 'Edit task: Complete accessibility testing',
      })
      await user.click(editButton)

      // Edit input should appear and be focused
      const editInput = screen.getByRole('textbox', { name: 'Edit task title' })
      expect(editInput).toBeInTheDocument()
      expect(editInput).toHaveFocus()
      expect(editInput).toHaveDisplayValue('Complete accessibility testing')
    })
  })

  describe('Empty State', () => {
    it('should provide helpful empty state with keyboard shortcuts', () => {
      render(<FloatingNavigator {...{ ...defaultProps, todos: [] }} />)

      expect(
        screen.getByText('No tasks yet. Add one above!'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Press Ctrl+/ for keyboard shortcuts'),
      ).toBeInTheDocument()
    })
  })

  describe('Task Count Announcements', () => {
    it('should announce task counts with proper pluralization', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const pendingCount = screen.getByText('2 pending tasks')
      expect(pendingCount).toBeInTheDocument()
      expect(pendingCount).toHaveAttribute('aria-live', 'polite')
    })

    it('should handle singular task count', () => {
      const singleTaskProps = {
        ...defaultProps,
        todos: [mockTodos[0]!], // Only one task
      }

      render(<FloatingNavigator {...singleTaskProps} />)

      const pendingCount = screen.getByText('1 pending task')
      expect(pendingCount).toBeInTheDocument()
    })
  })
})
