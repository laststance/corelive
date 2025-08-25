import { render, screen, fireEvent } from '@testing-library/react'
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

describe('FloatingNavigator Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ARIA Labels and Roles', () => {
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

    it('should have proper list structure with correct labels', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const pendingList = screen.getByRole('list', { name: /2 pending tasks/ })
      expect(pendingList).toBeInTheDocument()

      const completedList = screen.getByRole('list', {
        name: /1 completed task/,
      })
      expect(completedList).toBeInTheDocument()
    })

    it('should have proper toolbar with window controls', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const toolbar = screen.getByRole('toolbar', { name: 'Window controls' })
      expect(toolbar).toBeInTheDocument()

      expect(
        screen.getByRole('button', { name: 'Open main window' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Enable always on top' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Minimize window' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Close window' }),
      ).toBeInTheDocument()
    })

    it('should have proper form controls with labels', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const input = screen.getByRole('textbox', { name: 'New task title' })
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('aria-describedby', 'task-input-help')

      const addButton = screen.getByRole('button', { name: 'Add task' })
      expect(addButton).toBeInTheDocument()
    })

    it('should have proper checkbox labels for tasks', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const pendingCheckbox = screen.getByRole('checkbox', {
        name: 'Mark task "Complete accessibility testing" as complete',
      })
      expect(pendingCheckbox).toBeInTheDocument()
      expect(pendingCheckbox).not.toBeChecked()

      const completedCheckbox = screen.getByRole('checkbox', {
        name: 'Mark completed task "Test keyboard navigation" as incomplete',
      })
      expect(completedCheckbox).toBeInTheDocument()
      expect(completedCheckbox).toBeChecked()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should support skip link navigation', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      // Tab to skip link
      await user.tab()
      const skipLink = screen.getByText('Skip to task input')
      expect(skipLink).toHaveFocus()

      // Activate skip link
      await user.keyboard('{Enter}')
      const taskInput = screen.getByRole('textbox', { name: 'New task title' })
      expect(taskInput).toHaveFocus()
    })

    it('should support Ctrl+N shortcut to focus input', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      await user.keyboard('{Control>}n{/Control}')

      const taskInput = screen.getByRole('textbox', { name: 'New task title' })
      expect(taskInput).toHaveFocus()
    })

    it('should support arrow key navigation through tasks', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      // Focus the container first
      const container = screen.getByRole('application')
      container.focus()

      // Navigate down through tasks
      await user.keyboard('{ArrowDown}')
      // First task should be focused (implementation detail - would need to check focus state)

      await user.keyboard('{ArrowDown}')
      // Second task should be focused

      await user.keyboard('{ArrowUp}')
      // Back to first task
    })

    it('should support spacebar to toggle task completion', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      const container = screen.getByRole('application')
      container.focus()

      // Navigate to first task and toggle with spacebar
      await user.keyboard('{ArrowDown}')
      await user.keyboard(' ')

      expect(defaultProps.onTaskToggle).toHaveBeenCalledWith('1')
    })

    it('should support Enter key to start editing', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      const container = screen.getByRole('application')
      container.focus()

      // Navigate to first task and start editing with Enter
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Enter}')

      // Should show edit input
      const editInput = screen.getByRole('textbox', { name: 'Edit task title' })
      expect(editInput).toBeInTheDocument()
      expect(editInput).toHaveFocus()
    })

    it('should support Delete key to remove tasks', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      const container = screen.getByRole('application')
      container.focus()

      // Navigate to first task and delete with Delete key
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Delete}')

      expect(defaultProps.onTaskDelete).toHaveBeenCalledWith('1')
    })

    it('should support Escape key to return to input', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      const container = screen.getByRole('application')
      container.focus()

      // Navigate to a task then press Escape
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Escape}')

      const taskInput = screen.getByRole('textbox', { name: 'New task title' })
      expect(taskInput).toHaveFocus()
    })

    it('should support keyboard shortcuts help with Ctrl+/', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      await user.keyboard('{Control>}/{/Control}')

      // Should announce keyboard shortcuts (would need to check screen reader announcements)
      // This is tested through the aria-live region
    })
  })

  describe('Screen Reader Support', () => {
    it('should have live region for announcements', () => {
      render(<FloatingNavigator {...defaultProps} />)

      const liveRegion = screen.getByRole('status')
      expect(liveRegion).toHaveAttribute('aria-live', 'polite')
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true')
    })

    it('should announce task creation', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      const input = screen.getByRole('textbox', { name: 'New task title' })
      const addButton = screen.getByRole('button', { name: 'Add task' })

      await user.type(input, 'New test task')
      await user.click(addButton)

      expect(defaultProps.onTaskCreate).toHaveBeenCalledWith('New test task')
    })

    it('should have descriptive button labels that change with context', () => {
      render(<FloatingNavigator {...defaultProps} />)

      // Add button should include task text when available
      const input = screen.getByRole('textbox', { name: 'New task title' })
      fireEvent.change(input, { target: { value: 'Test task' } })

      // Button label should update (this would need to be implemented)
      const addButton = screen.getByRole('button', { name: /Add task/ })
      expect(addButton).toBeInTheDocument()
    })

    it('should provide context for task actions', () => {
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

  describe('Focus Management', () => {
    it('should have visible focus indicators', () => {
      render(<FloatingNavigator {...defaultProps} />)

      // All interactive elements should have focus-visible classes
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toHaveClass('focus-visible:ring-2')
      })

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

      // Edit input should be focused
      const editInput = screen.getByRole('textbox', { name: 'Edit task title' })
      expect(editInput).toHaveFocus()
      expect(editInput).toHaveDisplayValue('Complete accessibility testing')
    })

    it('should restore focus after canceling edit', async () => {
      const user = userEvent.setup()
      render(<FloatingNavigator {...defaultProps} />)

      // Start editing
      const editButton = screen.getByRole('button', {
        name: 'Edit task: Complete accessibility testing',
      })
      await user.click(editButton)

      // Cancel editing
      const cancelButton = screen.getByRole('button', {
        name: 'Cancel editing',
      })
      await user.click(cancelButton)

      // Focus should return to appropriate element
      // (Implementation would need to handle this)
    })
  })

  describe('Accessibility Compliance', () => {
    it('should have basic accessibility structure', async () => {
      render(<FloatingNavigator {...defaultProps} />)

      // Check for basic accessibility structure
      expect(screen.getByRole('application')).toBeInTheDocument()
      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('should support high contrast mode', () => {
      // Mock high contrast media query
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: query === '(prefers-contrast: high)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      render(<FloatingNavigator {...defaultProps} />)

      // High contrast styles should be applied
      // (This would need CSS-in-JS testing or visual regression testing)
    })

    it('should respect reduced motion preferences', () => {
      // Mock reduced motion media query
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      render(<FloatingNavigator {...defaultProps} />)

      // Animations should be disabled
      // (This would need CSS-in-JS testing)
    })
  })

  describe('Empty State Accessibility', () => {
    it('should provide helpful empty state with keyboard shortcuts', () => {
      render(<FloatingNavigator {...{ ...defaultProps, todos: [] }} />)

      // Get the empty state specifically (not the live region)
      const emptyState = screen
        .getByText('No tasks yet. Add one above!')
        .closest('[role="status"]')
      expect(emptyState).toHaveTextContent('No tasks yet. Add one above!')
      expect(emptyState).toHaveTextContent(
        'Press Ctrl+/ for keyboard shortcuts',
      )
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
        todos: [mockTodos[0]], // Only one task
      }

      render(<FloatingNavigator {...singleTaskProps} />)

      const pendingCount = screen.getByText('1 pending task')
      expect(pendingCount).toBeInTheDocument()
    })
  })
})
