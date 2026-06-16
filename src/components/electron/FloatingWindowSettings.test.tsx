import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FloatingWindowSettings } from './FloatingWindowSettings'

/**
 * The full floating-panels preload bridge this card drives. A CURRENT desktop
 * preload exposes all six methods; older builds may expose only a subset, which
 * the component's completeness guard treats as an outdated preload.
 */
type FloatingPanelsBridge = {
  getVisibleOnAllWorkspaces: () => Promise<boolean>
  setVisibleOnAllWorkspaces: (value: boolean) => Promise<boolean>
  getFloatingNavigatorAlwaysOnTop: () => Promise<boolean>
  setFloatingNavigatorAlwaysOnTop: (value: boolean) => Promise<boolean>
  getBrainDumpAlwaysOnTop: () => Promise<boolean>
  setBrainDumpAlwaysOnTop: (value: boolean) => Promise<boolean>
}

/**
 * Builds a complete six-method bridge of resolved spies; a test overrides only
 * the methods it exercises (a rejecting setter, a never-resolving getter). The
 * resolved defaults mirror the config defaults: Floating pinned, BrainDump not.
 *
 * @param overrides - Per-method spies that replace the resolved defaults.
 * @returns The bridge object of vi spies.
 */
function createBridge(
  overrides: Partial<FloatingPanelsBridge> = {},
): FloatingPanelsBridge {
  return {
    getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
    setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    getFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(true),
    setFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(true),
    getBrainDumpAlwaysOnTop: vi.fn().mockResolvedValue(false),
    setBrainDumpAlwaysOnTop: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

/**
 * Defines `window.electronAPI` for a test. Passing `undefined` simulates a web
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
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the saved macOS Spaces preference once the bridge responds', async () => {
    // Arrange: the saved preference keeps both panels on all desktops.
    installElectronAPI({
      floatingPanels: createBridge({
        getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
      }),
    })

    // Act
    render(<FloatingWindowSettings />)

    // Assert: the desktop-following switch renders and reads on.
    const desktopSwitch = await screen.findByRole('switch', {
      name: 'Show on all Mac desktops',
    })
    expect(desktopSwitch).toBeChecked()
  })

  it('reflects saved always-on-top preferences: Floating pinned, BrainDump unpinned', async () => {
    // Arrange: the persisted choice pins Floating Navigator but not BrainDump —
    // the exact 「固定しない」 default this preference ships for BrainDump.
    installElectronAPI({
      floatingPanels: createBridge({
        getFloatingNavigatorAlwaysOnTop: vi.fn().mockResolvedValue(true),
        getBrainDumpAlwaysOnTop: vi.fn().mockResolvedValue(false),
      }),
    })

    // Act
    render(<FloatingWindowSettings />)

    // Assert: each pin switch reads its own saved value, independently — a
    // shared/leaked value would flip one of these.
    const floatingSwitch = await screen.findByRole('switch', {
      name: 'Keep Floating Navigator on top',
    })
    const brainDumpSwitch = screen.getByRole('switch', {
      name: 'Keep BrainDump on top',
    })
    expect(floatingSwitch).toBeChecked()
    expect(brainDumpSwitch).not.toBeChecked()
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

  it('degrades to an update prompt when the preload predates always-on-top', async () => {
    // Arrange: an OUTDATED desktop app exposes the original Spaces pair but NOT
    // the always-on-top methods this card now calls — the realistic preload skew
    // (frozen installed preload, newer web bundle) the guard exists to survive.
    installElectronAPI({
      floatingPanels: {
        getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
        setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
      },
    })

    // Act + Assert: mounting must NOT throw a TypeError from calling a missing
    // method inside the load effect (which would bubble to Next.js global-error
    // and blank the page). A graceful update card renders, with no switch.
    render(<FloatingWindowSettings />)
    expect(
      await screen.findByText(/Update CoreLive to the latest version/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('degrades to an update prompt when floatingPanels is an empty namespace', async () => {
    // Arrange: an even older preload exposes the namespace with no methods.
    installElectronAPI({ floatingPanels: {} })

    // Act + Assert: still the update card, never a crash.
    render(<FloatingWindowSettings />)
    expect(
      await screen.findByText(/Update CoreLive to the latest version/i),
    ).toBeInTheDocument()
  })

  it('shows a loading state until the saved preferences arrive', async () => {
    // Arrange: a never-resolving getter keeps the card in its loading state,
    // while the other methods are present so the completeness guard passes.
    installElectronAPI({
      floatingPanels: createBridge({
        getVisibleOnAllWorkspaces: vi
          .fn()
          .mockReturnValue(new Promise<boolean>(() => {})),
      }),
    })

    // Act
    render(<FloatingWindowSettings />)

    // Assert: the loading copy shows and no switch has rendered yet.
    expect(
      await screen.findByText('Loading floating window settings…'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('rolls the Spaces switch back when the main process fails to persist it', async () => {
    // Arrange: the saved preference is off, and the save will reject.
    installElectronAPI({
      floatingPanels: createBridge({
        getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
        setVisibleOnAllWorkspaces: vi
          .fn()
          .mockRejectedValue(new Error('main process unavailable')),
      }),
    })
    const user = userEvent.setup()
    render(<FloatingWindowSettings />)
    const desktopSwitch = await screen.findByRole('switch', {
      name: 'Show on all Mac desktops',
    })
    expect(desktopSwitch).not.toBeChecked()

    // Act: try to enable it; persistence rejects.
    await user.click(desktopSwitch)

    // Assert: the optimistic on-state reverts and an error surfaces.
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Show on all Mac desktops' }),
      ).not.toBeChecked()
    })
    expect(
      screen.getByText('Failed to update floating window settings'),
    ).toBeInTheDocument()
  })

  it('rolls the BrainDump pin back when the main process fails to persist it', async () => {
    // Arrange: BrainDump starts unpinned; pinning it will reject in the main
    // process. Proves the per-key optimistic rollback covers the new pins, not
    // just the original Spaces toggle.
    installElectronAPI({
      floatingPanels: createBridge({
        getBrainDumpAlwaysOnTop: vi.fn().mockResolvedValue(false),
        setBrainDumpAlwaysOnTop: vi
          .fn()
          .mockRejectedValue(new Error('main process unavailable')),
      }),
    })
    const user = userEvent.setup()
    render(<FloatingWindowSettings />)
    const brainDumpSwitch = await screen.findByRole('switch', {
      name: 'Keep BrainDump on top',
    })
    expect(brainDumpSwitch).not.toBeChecked()

    // Act: try to pin BrainDump; persistence rejects.
    await user.click(brainDumpSwitch)

    // Assert: the switch reverts to unpinned and an error surfaces.
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Keep BrainDump on top' }),
      ).not.toBeChecked()
    })
    expect(
      screen.getByText('Failed to update floating window settings'),
    ).toBeInTheDocument()
  })
})
