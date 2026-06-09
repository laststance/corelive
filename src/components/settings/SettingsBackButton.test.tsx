import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsBackButton } from './SettingsBackButton'

// useRouter is the only navigation API this component touches; back() is the
// observable effect we assert on.
const backMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: backMock,
  }),
}))

/**
 * Force `window.history.length` to a fixed value so a test can choose whether
 * the page looks like an in-app arrival (length > 1) or a fresh load (length 1),
 * which is the single input that decides whether the Back button renders.
 *
 * @param length - The history length to report until the test cleans up.
 */
function setHistoryLength(length: number): void {
  Object.defineProperty(window.history, 'length', {
    configurable: true,
    value: length,
  })
}

describe('SettingsBackButton', () => {
  afterEach(() => {
    backMock.mockReset()
    // Drop the per-test override so the real history.length is restored.
    delete (window.history as unknown as { length?: number }).length
  })

  it('returns to the previous screen when Settings was opened from the sidebar', async () => {
    // Arrange: reached via in-app navigation, so a prior history entry exists.
    setHistoryLength(2)
    const user = userEvent.setup()
    render(<SettingsBackButton />)

    // Act
    await user.click(await screen.findByRole('button', { name: /back/i }))

    // Assert: it steps back to wherever the user came from (e.g. /home),
    // never force-pushing a fixed route.
    expect(backMock).toHaveBeenCalledTimes(1)
  })

  it('renders nothing in the tray popover, where there is no screen to go back to', () => {
    // Arrange: a fresh loadURL of /settings (the frameless tray popover) leaves
    // history.length at 1 — back() would be a no-op.
    setHistoryLength(1)

    // Act
    render(<SettingsBackButton />)

    // Assert: no dead button is shown; the popover is dismissed by blur instead.
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
  })
})
