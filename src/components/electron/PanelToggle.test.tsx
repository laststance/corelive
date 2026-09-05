import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LIVE_EDITOR_PIN_SETTING, PanelToggle } from './PanelToggle'

/** The two LiveEditor-pin methods the descriptor under test reads + writes. */
type LiveEditorPinBridge = {
  getLiveEditorAlwaysOnTop: () => Promise<boolean>
  setLiveEditorAlwaysOnTop: (value: boolean) => Promise<boolean>
}

/**
 * Installs `window.electronAPI` for a test. `undefined` simulates a web renderer
 * (no bridge); a partial panels bridge simulates an outdated preload.
 *
 * @param api - The fake electronAPI value, or undefined for a web renderer.
 * @returns Nothing; mutates the happy-dom window object.
 * @example
 * installElectronAPI({ floatingPanels: {} })
 */
function installElectronAPI(
  api: { floatingPanels?: Partial<LiveEditorPinBridge> } | undefined,
): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

describe('PanelToggle', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the saved pin value once the bridge responds', async () => {
    // Arrange: the saved value pins LiveEditor (overriding the descriptor's
    // default-off), proving the row shows the loaded value.
    installElectronAPI({
      floatingPanels: {
        getLiveEditorAlwaysOnTop: vi.fn().mockResolvedValue(true),
        setLiveEditorAlwaysOnTop: vi.fn().mockResolvedValue(true),
      },
    })

    // Act
    render(
      <PanelToggle setting={LIVE_EDITOR_PIN_SETTING} label="Keep on top" />,
    )

    // Assert: the switch settles to the saved (on) value, not the default-off.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Keep on top' })).toBeChecked()
    })
  })

  it('persists the pin to the main process when toggled off', async () => {
    // Arrange: saved on; the user will unpin it.
    const setPin = vi.fn().mockResolvedValue(false)
    installElectronAPI({
      floatingPanels: {
        getLiveEditorAlwaysOnTop: vi.fn().mockResolvedValue(true),
        setLiveEditorAlwaysOnTop: setPin,
      },
    })
    const user = userEvent.setup()
    render(
      <PanelToggle setting={LIVE_EDITOR_PIN_SETTING} label="Keep on top" />,
    )
    const pinSwitch = await screen.findByRole('switch', { name: 'Keep on top' })
    await waitFor(() => expect(pinSwitch).toBeChecked())

    // Act: unpin it.
    await user.click(pinSwitch)

    // Assert: the new value is persisted and reflected on the switch.
    expect(setPin).toHaveBeenCalledWith(false)
    await waitFor(() => expect(pinSwitch).not.toBeChecked())
  })

  it('rolls the pin back when the main process fails to persist it', async () => {
    // Arrange: saved on; unpinning will reject in the main process.
    installElectronAPI({
      floatingPanels: {
        getLiveEditorAlwaysOnTop: vi.fn().mockResolvedValue(true),
        setLiveEditorAlwaysOnTop: vi
          .fn()
          .mockRejectedValue(new Error('main process unavailable')),
      },
    })
    const user = userEvent.setup()
    render(
      <PanelToggle setting={LIVE_EDITOR_PIN_SETTING} label="Keep on top" />,
    )
    const pinSwitch = await screen.findByRole('switch', { name: 'Keep on top' })
    await waitFor(() => expect(pinSwitch).toBeChecked())

    // Act: try to unpin it; persistence rejects.
    await user.click(pinSwitch)

    // Assert: the optimistic off-state reverts and an error surfaces.
    await waitFor(() => expect(pinSwitch).toBeChecked())
    expect(screen.getByText('Failed to update setting')).toBeInTheDocument()
  })

  it('renders nothing when the preload lacks this setting’s methods', () => {
    // Arrange: an outdated preload exposes the panels bridge but not the pin pair.
    installElectronAPI({ floatingPanels: {} })

    // Act
    render(
      <PanelToggle setting={LIVE_EDITOR_PIN_SETTING} label="Keep on top" />,
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
      <PanelToggle setting={LIVE_EDITOR_PIN_SETTING} label="Keep on top" />,
    )

    // Assert: nothing renders off-Electron.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
