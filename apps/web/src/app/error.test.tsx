import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { log } from '@/lib/logger'

import RouteError from './error'

// An in-app Next link consumes an ordinary click before the browser can navigate.
vi.mock('next/link', () => ({
  default: ({ onClick, ...props }: ComponentProps<'a'>) => (
    <a
      {...props}
      onClick={(event) => {
        onClick?.(event)
        event.preventDefault()
      }}
    />
  ),
}))

describe('RouteError (route-level error boundary)', () => {
  beforeEach(() => {
    // Keep test output clean; the boundary logs the real error on mount.
    vi.spyOn(log, 'error').mockImplementation(() => {})
  })

  test('shows a reassuring recovery card instead of a stark crash screen', () => {
    // Arrange: a caught client error, e.g. an outdated preload throwing.
    const reset = vi.fn()

    // Act
    render(<RouteError error={new Error('boom')} reset={reset} />)

    // Assert: gentle, on-brand copy renders (never the scary built-in default).
    expect(screen.getByText('Give that another try')).toBeVisible()
    expect(
      screen.getByText(/Something hiccuped while loading this view/i),
    ).toBeVisible()
  })

  test('surfaces the real error to the logger for telemetry', () => {
    // Arrange
    const caught = new Error('boom')

    // Act
    render(<RouteError error={caught} reset={vi.fn()} />)

    // Assert: the boundary logs the underlying error while the UI stays calm.
    expect(log.error).toHaveBeenCalledWith(
      'Page boundary caught a client error:',
      caught,
    )
  })

  test('retries the crashed segment when "Try again" is pressed', async () => {
    // Arrange
    const reset = vi.fn()
    const user = userEvent.setup()
    render(<RouteError error={new Error('boom')} reset={reset} />)

    // Act: the single recovery affordance.
    await user.click(screen.getByRole('button', { name: /try again/i }))

    // Assert: Next.js's reset() is invoked to re-render the segment.
    expect(reset).toHaveBeenCalledTimes(1)
  })

  test('lets the browser navigate out of a failed route to the Dashboard landing page', async () => {
    // Arrange
    const user = userEvent.setup()
    const reset = vi.fn()
    render(<RouteError error={new Error('Failed route')} reset={reset} />)
    const link = screen.getByRole('link', { name: 'Dashboard landing page' })
    let navigates = false
    document.addEventListener(
      'click',
      (event) => {
        navigates = !event.defaultPrevented
        // Observe the default action without leaving the test document.
        event.preventDefault()
      },
      { once: true },
    )

    // Act
    await user.click(link)

    // Assert
    expect(link).toBeVisible()
    expect(link).toHaveAttribute('href', '/')
    expect(navigates).toBe(true)
    expect(reset).not.toHaveBeenCalled()
  })
})
