import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { log } from '@/lib/logger'

import RouteError from './error'

describe('RouteError (route-level error boundary)', () => {
  beforeEach(() => {
    // Keep test output clean; the boundary logs the real error on mount.
    vi.spyOn(log, 'error').mockImplementation(() => {})
  })

  it('shows a reassuring recovery card instead of a stark crash screen', () => {
    // Arrange: a caught client error, e.g. an outdated preload throwing.
    const reset = vi.fn()

    // Act
    render(<RouteError error={new Error('boom')} reset={reset} />)

    // Assert: gentle, on-brand copy renders (never the scary built-in default).
    expect(screen.getByText('Give that another try')).toBeInTheDocument()
    expect(
      screen.getByText(/Something hiccuped while loading this view/i),
    ).toBeInTheDocument()
  })

  it('surfaces the real error to the logger for telemetry', () => {
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

  it('retries the crashed segment when "Try again" is pressed', async () => {
    // Arrange
    const reset = vi.fn()
    const user = userEvent.setup()
    render(<RouteError error={new Error('boom')} reset={reset} />)

    // Act: the single recovery affordance.
    await user.click(screen.getByRole('button', { name: /try again/i }))

    // Assert: Next.js's reset() is invoked to re-render the segment.
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('escapes to home with a hard navigation when "Back to home" is pressed', async () => {
    // Arrange: reset() re-renders the SAME crashed segment, so a deterministic
    // throw (e.g. a stale preload) dead-ends — the secondary action must leave
    // the route via a hard nav (fresh document + fresh bundle), never reset().
    const reset = vi.fn()
    const assignToHome = vi
      .spyOn(window.location, 'assign')
      .mockImplementation(() => {})
    const user = userEvent.setup()
    render(<RouteError error={new Error('boom')} reset={reset} />)

    // Act
    await user.click(screen.getByRole('button', { name: /back to home/i }))

    // Assert: a hard navigation to the safe home route, and reset() is NOT it.
    expect(assignToHome).toHaveBeenCalledWith('/')
    expect(reset).not.toHaveBeenCalled()
    assignToHome.mockRestore()
  })

  it('does not throw when mounting through the real (unmocked) logger', () => {
    // Lock the last-line-of-defense invariant: the boundary's own mount-time
    // logging must run through the REAL logger without throwing, or the
    // recovery UI would itself crash and defeat the boundary. Drop the
    // beforeEach stub so the genuine pino browser path executes; keep console
    // quiet for hygiene only.
    vi.restoreAllMocks()
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    // Act + Assert
    expect(() =>
      render(<RouteError error={new Error('boom')} reset={vi.fn()} />),
    ).not.toThrow()

    consoleErrorSpy.mockRestore()
  })
})
