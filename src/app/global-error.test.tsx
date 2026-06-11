import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GlobalError from './global-error'

describe('GlobalError (root-layout error boundary)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a standalone reassuring recovery screen with no design-system deps', () => {
    // Arrange: global-error replaces the root layout, so it must render its own
    // shell with only inline styles — no globals.css, no shadcn, no logger.
    // Spy console.error for hygiene (React warns about nested <html>).
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />)

    // Assert: gentle, on-brand copy renders standalone (never the built-in crash).
    expect(screen.getByText('Give that another try')).toBeInTheDocument()
    expect(
      screen.getByText(/Something hiccuped while loading CoreLive/i),
    ).toBeInTheDocument()
  })

  it('surfaces the caught error to console for telemetry', () => {
    // Arrange: console is the only sink global-error trusts at this layer.
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const caught = new Error('boom')

    // Act
    render(<GlobalError error={caught} reset={vi.fn()} />)

    // Assert: the boundary logs the underlying error while the UI stays calm.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[global-error] Root layout boundary caught:',
      caught,
    )
  })

  it('retries the app shell when "Try again" is pressed', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reset = vi.fn()
    const user = userEvent.setup()
    render(<GlobalError error={new Error('boom')} reset={reset} />)

    // Act: the single recovery affordance.
    await user.click(screen.getByRole('button', { name: /try again/i }))

    // Assert: Next.js's reset() is invoked to re-render the app shell.
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('reloads a fresh bundle when "Reload the app" is pressed', async () => {
    // Arrange: the root layout is universal, so reset() re-renders the SAME
    // failing layout and a "go home" nav can't escape it either — only a full
    // reload fetches a fresh bundle (the stale-preload fix). Spy reload to
    // assert the wiring without actually navigating the test runner.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reset = vi.fn()
    const reloadFreshBundle = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {})
    const user = userEvent.setup()
    render(<GlobalError error={new Error('boom')} reset={reset} />)

    // Act
    await user.click(screen.getByRole('button', { name: /reload the app/i }))

    // Assert: a full reload is triggered; reset() is not the escape here.
    expect(reloadFreshBundle).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })
})
