import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FloatingWindowSettings } from './FloatingWindowSettings'

// Stand-ins for the typed `floatingPanels` preload bridge the component talks to.
const getVisibleOnAllWorkspacesMock = vi.fn()
const setVisibleOnAllWorkspacesMock = vi.fn()

type FloatingPanelsBridge = {
  getVisibleOnAllWorkspaces: () => Promise<boolean>
  setVisibleOnAllWorkspaces: (value: boolean) => Promise<boolean>
}

/**
 * Define `window.electronAPI` for a test. Passing `undefined` simulates a web
 * (non-Electron) renderer where the bridge is missing entirely; a partial
 * `floatingPanels` simulates an outdated desktop preload.
 *
 * @param api - The fake electronAPI value, or undefined for a web renderer.
 */
function installElectronAPI(
  api: { floatingPanels?: Partial<FloatingPanelsBridge> } | undefined,
): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

describe('FloatingWindowSettings', () => {
  beforeEach(() => {
    getVisibleOnAllWorkspacesMock.mockReset()
    setVisibleOnAllWorkspacesMock.mockReset()
    // Default: saves succeed; individual tests override when exercising failure.
    setVisibleOnAllWorkspacesMock.mockResolvedValue(true)
  })

  it('reflects the saved macOS Spaces preference once the bridge responds', async () => {
    // Arrange: the saved preference keeps both panels on all desktops.
    getVisibleOnAllWorkspacesMock.mockResolvedValue(true)
    installElectronAPI({
      floatingPanels: {
        getVisibleOnAllWorkspaces: getVisibleOnAllWorkspacesMock,
        setVisibleOnAllWorkspaces: setVisibleOnAllWorkspacesMock,
      },
    })

    // Act
    render(<FloatingWindowSettings />)

    // Assert: the desktop-following switch renders and reads on.
    const desktopSwitch = await screen.findByRole('switch', {
      name: 'Show on all Mac desktops',
    })
    expect(desktopSwitch).toBeChecked()
  })

  it('shows a desktop-only message when the floatingPanels bridge is absent', async () => {
    // Arrange: a web renderer has no electronAPI at all.
    installElectronAPI(undefined)

    // Act
    render(<FloatingWindowSettings />)

    // Assert: the fallback copy renders and no toggle is offered.
    expect(
      await screen.findByText(
        'Floating window settings are only available in the desktop application.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('degrades gracefully when an old preload exposes floatingPanels but not getVisibleOnAllWorkspaces', async () => {
    // Arrange: an OUTDATED desktop app exposes the floatingPanels namespace but
    // predates the getVisibleOnAllWorkspaces method the load effect calls.
    installElectronAPI({ floatingPanels: {} })

    // Act + Assert: mounting must NOT throw a synchronous TypeError from the load
    // effect (which would bubble out of useEffect to Next.js global-error and
    // blank the whole page). A graceful update card must render instead.
    render(<FloatingWindowSettings />)
    expect(
      await screen.findByText(/Update CoreLive to the latest version/i),
    ).toBeInTheDocument()
  })
})
