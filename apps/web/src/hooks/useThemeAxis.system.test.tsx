import { render, screen } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Drive the hook with a controlled next-themes state: the real provider's guard
// would repair an unknown stored value before we could observe the first render.
const useThemeMock = vi.fn()
vi.mock('next-themes', () => ({ useTheme: () => useThemeMock() }))

import { useThemeAxis } from './useThemeAxis'

/** Prints the axis fields the System-normalization cases assert on. */
function AxisProbe() {
  const { isSystem, activeId, family, mode } = useThemeAxis()
  return (
    <div>
      <span data-testid="is-system">{String(isSystem)}</span>
      <span data-testid="active">{activeId}</span>
      <span data-testid="family">{family}</span>
      <span data-testid="mode">{mode}</span>
    </div>
  )
}

describe('useThemeAxis — unknown stored values follow the OS', () => {
  beforeEach(() => {
    useThemeMock.mockReset()
  })

  test('shows System on Default dark for an unknown raw value on a dark OS before the guard repairs storage', () => {
    // Arrange — next-themes echoes the unknown raw string as resolvedTheme
    useThemeMock.mockReturnValue({
      theme: 'cathedral-lite',
      resolvedTheme: 'cathedral-lite',
      systemTheme: 'dark',
      setTheme: vi.fn(),
    })

    // Act
    render(<AxisProbe />)

    // Assert
    expect(screen.getByTestId('is-system')).toHaveTextContent('true')
    expect(screen.getByTestId('active')).toHaveTextContent(/^dark$/)
    expect(screen.getByTestId('family')).toHaveTextContent('default')
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
  })

  test('uses the resolved OS mode when System is stored', () => {
    // Arrange
    useThemeMock.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'dark',
      systemTheme: 'dark',
      setTheme: vi.fn(),
    })

    // Act
    render(<AxisProbe />)

    // Assert
    expect(screen.getByTestId('is-system')).toHaveTextContent('true')
    expect(screen.getByTestId('active')).toHaveTextContent(/^dark$/)
  })
})
