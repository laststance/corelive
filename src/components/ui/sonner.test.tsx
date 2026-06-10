import { render } from '@testing-library/react'
import type { ToasterProps } from 'sonner'
import { describe, it, expect, vi } from 'vitest'

// Capture the theme prop the underlying Sonner toaster receives. Type the spied
// prop from Sonner's own union (not a widened `string`) so a typo'd theme the
// real Sonner would reject also fails the test's type-check.
const sonnerThemeSpy = vi.fn()
vi.mock('sonner', () => ({
  Toaster: (props: { theme?: ToasterProps['theme'] }) => {
    sonnerThemeSpy(props.theme)
    return null
  },
}))

const useThemeMock = vi.fn()
vi.mock('next-themes', () => ({ useTheme: () => useThemeMock() }))

import { Toaster } from './sonner'

describe('Toaster theme resolution', () => {
  it('passes system through verbatim so toasts follow the OS until a theme is picked', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: 'system' })

    // Act
    render(<Toaster />)

    // Assert
    expect(sonnerThemeSpy).toHaveBeenCalledWith('system')
  })

  it('resolves a *-dark family id down to the dark mode Sonner accepts', () => {
    // Arrange — a future colored-dark id Sonner cannot accept raw
    useThemeMock.mockReturnValue({ theme: 'harbor-dark' })

    // Act
    render(<Toaster />)

    // Assert
    expect(sonnerThemeSpy).toHaveBeenCalledWith('dark')
  })

  it('defaults to system before hydration when theme is undefined', () => {
    // Arrange
    useThemeMock.mockReturnValue({ theme: undefined })

    // Act
    render(<Toaster />)

    // Assert
    expect(sonnerThemeSpy).toHaveBeenCalledWith('system')
  })
})
