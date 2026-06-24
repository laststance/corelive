import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  FLOATING_NAVIGATOR_PIN_PREFERENCE,
  FloatingPanelToggle,
} from './FloatingPanelToggle'

/** The two floating-pin methods the descriptor under test reads + writes. */
type FloatingPinBridge = {
  getFloatingNavigatorAlwaysOnTop: () => Promise<boolean>
  setFloatingNavigatorAlwaysOnTop: (value: boolean) => Promise<boolean>
}

/**
 * Installs `window.electronAPI` for a test. `undefined` simulates a web renderer
 * (no bridge); a partial `floatingPanels` simulates an outdated preload.
 *
 * @param api - The fake electronAPI value, or undefined for a web renderer.
 */
function installElectronAPI(
  api: { floatingPanels?: Partial<FloatingPinBridge> } | undefined,
): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

describe('FloatingPanelToggle', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the saved pin value once the bridge responds', async () => {
    // Arrange: the saved value un-pins the Floating Navigator (overriding the
    // descriptor's default-on), proving the row shows the loaded value.
    installElectronAPI({
      floatingPanels: {
        getFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(false),
        setFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(true),
      },
    })

    // Act
    render(
      <FloatingPanelToggle
        preference={FLOATING_NAVIGATOR_PIN_PREFERENCE}
        label="Keep Floating Navigator on top"
      />,
    )

    // Assert: the switch settles to the saved (off) value, not the default-on.
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Keep Floating Navigator on top' }),
      ).not.toBeChecked()
    })
  })

  it('persists the pin to the main process when toggled on', async () => {
    // Arrange: saved off; the user will pin it.
    const setPin = vi.fn().mockResolvedValue(true)
    installElectronAPI({
      floatingPanels: {
        getFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(false),
        setFloatingNavigatorAlwaysOnTop: setPin,
      },
    })
    const user = userEvent.setup()
    render(
      <FloatingPanelToggle
        preference={FLOATING_NAVIGATOR_PIN_PREFERENCE}
        label="Keep Floating Navigator on top"
      />,
    )
    const pinSwitch = await screen.findByRole('switch', {
      name: 'Keep Floating Navigator on top',
    })
    await waitFor(() => expect(pinSwitch).not.toBeChecked())

    // Act: pin it.
    await user.click(pinSwitch)

    // Assert: the new value is persisted and reflected on the switch.
    expect(setPin).toHaveBeenCalledWith(true)
    await waitFor(() => expect(pinSwitch).toBeChecked())
  })

  it('rolls the pin back when the main process fails to persist it', async () => {
    // Arrange: saved off; pinning will reject in the main process.
    installElectronAPI({
      floatingPanels: {
        getFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(false),
        setFloatingNavigatorAlwaysOnTop: vi
          .fn()
          .mockRejectedValue(new Error('main process unavailable')),
      },
    })
    const user = userEvent.setup()
    render(
      <FloatingPanelToggle
        preference={FLOATING_NAVIGATOR_PIN_PREFERENCE}
        label="Keep Floating Navigator on top"
      />,
    )
    const pinSwitch = await screen.findByRole('switch', {
      name: 'Keep Floating Navigator on top',
    })
    await waitFor(() => expect(pinSwitch).not.toBeChecked())

    // Act: try to pin it; persistence rejects.
    await user.click(pinSwitch)

    // Assert: the optimistic on-state reverts and an error surfaces.
    await waitFor(() => expect(pinSwitch).not.toBeChecked())
    expect(screen.getByText('Failed to update setting')).toBeInTheDocument()
  })

  it('renders nothing when the preload lacks this preference’s methods', () => {
    // Arrange: an outdated preload exposes floatingPanels but not the pin pair.
    installElectronAPI({ floatingPanels: {} })

    // Act
    render(
      <FloatingPanelToggle
        preference={FLOATING_NAVIGATOR_PIN_PREFERENCE}
        label="Keep Floating Navigator on top"
      />,
    )

    // Assert: no dead control — the row hides itself (available is computed
    // synchronously from the client mount snapshot, so this is stable).
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('renders nothing on web where there is no electronAPI', () => {
    // Arrange: a web renderer has no bridge at all.
    installElectronAPI(undefined)

    // Act
    render(
      <FloatingPanelToggle
        preference={FLOATING_NAVIGATOR_PIN_PREFERENCE}
        label="Keep Floating Navigator on top"
      />,
    )

    // Assert: nothing renders off-Electron.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
