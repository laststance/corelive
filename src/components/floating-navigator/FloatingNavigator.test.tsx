/**
 * @fileoverview FloatingNavigator pin-button mount-init tests.
 *
 * The sentinel: the always-on-top pin button must seed from the window's REAL
 * state on mount, not from its hardcoded `useState(true)`. Because the pin
 * preference now survives relaunch, a user who turned it off must see the button
 * read "off" — otherwise the button lies (shows pinned over an unpinned window).
 * The unpinned case below fails if that mount-init read regresses.
 *
 * Triggered when: `pnpm test` (Vitest, happy-dom).
 *
 * @example
 *   pnpm test -- FloatingNavigator
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FloatingNavigator } from './FloatingNavigator'

// Force the floating-navigator environment so the window-controls toolbar (and
// its pin button) renders and the mount-init effect runs.
vi.mock('@/electron/utils/electron-client', () => ({
  isFloatingNavigatorEnvironment: () => true,
}))

const isAlwaysOnTopMock = vi.fn()

/**
 * Installs a `window.floatingNavigatorAPI` whose `window.isAlwaysOnTop` is the
 * given spy; the other methods are present (only invoked on user interaction).
 *
 * @param isAlwaysOnTop - The spy the mount-init effect awaits.
 */
function installFloatingNavigatorAPI(
  isAlwaysOnTop: () => Promise<boolean>,
): void {
  Object.defineProperty(window, 'floatingNavigatorAPI', {
    configurable: true,
    writable: true,
    value: {
      window: {
        isAlwaysOnTop,
        toggleAlwaysOnTop: vi.fn(),
        minimize: vi.fn(),
        close: vi.fn(),
        focusMainWindow: vi.fn(),
      },
      brainDump: { toggle: vi.fn() },
      openCompletedImport: vi.fn(),
    },
  })
}

// Minimal required task callbacks — no todos so no rows/dnd/lazy-row icons render.
const noopTaskProps = {
  todos: [],
  onTaskToggle: vi.fn(),
  onTaskCreate: vi.fn(),
  onTaskEdit: vi.fn(),
  onTaskDelete: vi.fn(),
}

describe('FloatingNavigator pin button', () => {
  beforeEach(() => {
    isAlwaysOnTopMock.mockReset()
  })

  it('shows the pin button OFF when the window launched unpinned', async () => {
    // Arrange: the window's real state is NOT pinned — the user turned pinning
    // off in a prior session and the preference survived relaunch.
    isAlwaysOnTopMock.mockResolvedValue(false)
    installFloatingNavigatorAPI(isAlwaysOnTopMock)

    // Act
    render(<FloatingNavigator {...noopTaskProps} />)

    // Assert: the button reflects the REAL unpinned state (aria-pressed=false),
    // not the `useState(true)` default. Drop the mount-init read and this button
    // would lie — labelled "Disable always on top" over an unpinned window.
    const pinButton = await screen.findByRole('button', {
      name: 'Enable always on top',
    })
    expect(pinButton).toHaveAttribute('aria-pressed', 'false')
    expect(isAlwaysOnTopMock).toHaveBeenCalledTimes(1)
  })

  it('shows the pin button ON when the window launched pinned', async () => {
    // Arrange: the window is pinned (the default-on behavior preserved).
    isAlwaysOnTopMock.mockResolvedValue(true)
    installFloatingNavigatorAPI(isAlwaysOnTopMock)

    // Act
    render(<FloatingNavigator {...noopTaskProps} />)

    // Assert: the mount-init still runs (it read the state) and the button reads
    // pressed, offering to disable.
    const pinButton = await screen.findByRole('button', {
      name: 'Disable always on top',
    })
    expect(pinButton).toHaveAttribute('aria-pressed', 'true')
    expect(isAlwaysOnTopMock).toHaveBeenCalledTimes(1)
  })

  it('does not crash when the preload predates the pin-state method', async () => {
    // Arrange: preload skew — the floatingNavigatorAPI namespace is present (an
    // installed app) but its `window` bridge predates `isAlwaysOnTop` (this
    // preference added it). isFloatingNavigatorEnvironment() only checks the
    // namespace, so the mount-init effect must method-guard before calling it.
    Object.defineProperty(window, 'floatingNavigatorAPI', {
      configurable: true,
      writable: true,
      value: {
        window: {
          // isAlwaysOnTop intentionally absent — the older preload lacks it.
          toggleAlwaysOnTop: vi.fn(),
          minimize: vi.fn(),
          close: vi.fn(),
          focusMainWindow: vi.fn(),
        },
        brainDump: { toggle: vi.fn() },
      },
    })

    // Act: mounting must NOT throw a TypeError from invoking undefined() in the
    // mount-init effect (which would bubble to the error boundary and blank the
    // floating window).
    render(<FloatingNavigator {...noopTaskProps} />)

    // Assert: the pin button still renders, falling back to the default pinned
    // state instead of crashing.
    const pinButton = await screen.findByRole('button', {
      name: 'Disable always on top',
    })
    expect(pinButton).toHaveAttribute('aria-pressed', 'true')
  })
})
