import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FloatingNavigatorSettings } from './FloatingNavigatorSettings'

/** The floating-panel methods this group's rows read + write (pin + shortcut). */
type FloatingNavigatorBridge = {
  getFloatingNavigatorAlwaysOnTop: () => Promise<boolean>
  setFloatingNavigatorAlwaysOnTop: (value: boolean) => Promise<boolean>
  getFloatingNavigatorShortcut: () => Promise<string>
  setFloatingNavigatorShortcut: (accelerator: string) => Promise<boolean>
}

/**
 * Installs `window.electronAPI` for a test. A partial `floatingPanels` simulates
 * an outdated preload missing one of the Floating Navigator method pairs (each
 * row self-gates on its own pair).
 *
 * @param api - The fake electronAPI value.
 */
function installElectronAPI(api: {
  floatingPanels?: Partial<FloatingNavigatorBridge>
}): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

describe('FloatingNavigatorSettings', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the saved keep-on-top state for the Floating Navigator', async () => {
    // Arrange: the navigator is pinned in the saved settings.
    installElectronAPI({
      floatingPanels: {
        getFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(true),
        setFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(true),
      },
    })

    // Act
    render(<FloatingNavigatorSettings />)

    // Assert: the keep-on-top switch renders under this section and reads on.
    const pinSwitch = await screen.findByRole('switch', { name: 'Keep on top' })
    await waitFor(() => expect(pinSwitch).toBeChecked())
  })

  it('renders no toggle when the preload predates the Floating Navigator pin methods', () => {
    // Arrange: an outdated desktop preload exposes floatingPanels but not the pin
    // pair this section drives.
    installElectronAPI({ floatingPanels: {} })

    // Act
    render(<FloatingNavigatorSettings />)

    // Assert: the row hides itself instead of showing a dead control.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows the saved global toggle shortcut as a macOS glyph', async () => {
    // Arrange: a current preload with the shortcut methods; ⌘3 is bound.
    installElectronAPI({
      floatingPanels: {
        getFloatingNavigatorShortcut: vi
          .fn()
          .mockResolvedValue('CommandOrControl+3'),
        setFloatingNavigatorShortcut: vi.fn().mockResolvedValue(true),
      },
    })

    // Act
    render(<FloatingNavigatorSettings />)

    // Assert: the capture box loads and renders the chord as a glyph, not raw text.
    const captureBox = await screen.findByLabelText('Toggle shortcut')
    await waitFor(() => expect(captureBox).toHaveTextContent('⌘3'))
  })

  it('hides the shortcut box when the preload predates the shortcut methods', () => {
    // Arrange: an outdated preload exposes only the pin pair, not the shortcut pair.
    installElectronAPI({
      floatingPanels: {
        getFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(true),
        setFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(true),
      },
    })

    // Act
    render(<FloatingNavigatorSettings />)

    // Assert: the keep-on-top pin still renders, but the shortcut box hides itself.
    expect(screen.queryByLabelText('Toggle shortcut')).not.toBeInTheDocument()
  })
})
