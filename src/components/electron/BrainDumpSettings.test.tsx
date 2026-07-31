import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrainDumpSettings } from './BrainDumpSettings'

const getSyncModeMock = vi.fn()
const setSyncModeMock = vi.fn()
const getOpacityMock = vi.fn()
const setOpacityMock = vi.fn()
const getShortcutMock = vi.fn()
const setShortcutMock = vi.fn()
const getShortcutSecondaryMock = vi.fn()
const setShortcutSecondaryMock = vi.fn()
const toggleMock = vi.fn()
const openConfigMock = vi.fn()

type BrainDumpBridge = {
  getSyncMode: () => Promise<boolean>
  setSyncMode: (enabled: boolean) => Promise<boolean>
  getOpacity: () => Promise<number>
  setOpacity: (value: number) => Promise<number>
  getShortcut: () => Promise<string>
  setShortcut: (accelerator: string) => Promise<boolean>
  getShortcutSecondary: () => Promise<string>
  setShortcutSecondary: (accelerator: string) => Promise<boolean>
  toggle: () => Promise<void>
}

type ConfigBridge = {
  open: () => Promise<boolean>
}

/**
 * Defines the preload bridge shape the Settings card expects during renderer tests.
 *
 * @param api - Fake Electron preload API, or undefined for a web renderer.
 * @returns Nothing; mutates the happy-dom window object for this test.
 * @example
 * installElectronAPI({ brainDump: fakeBridge })
 */
function installElectronAPI(
  api:
    | {
        brainDump?: Partial<BrainDumpBridge>
        config?: Partial<ConfigBridge>
      }
    | undefined,
): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

/**
 * Installs a successful BrainDump preload bridge so loading can advance to ready state.
 *
 * @param saved - Persisted settings returned by the main process mocks.
 * @returns Nothing; prepares all BrainDump mocks for a component render.
 * @example
 * installBrainDumpBridge({ syncMode: false, opacity: 0.7, shortcut: 'CommandOrControl+Shift+B' })
 */
function installBrainDumpBridge(saved: {
  syncMode: boolean
  opacity: number
  shortcut: string
  /**
   * Second-slot accelerator. Omit to simulate an OLD preload that predates the
   * two-slot bridge — the card must then render a single capture box.
   */
  secondaryShortcut?: string
}): void {
  getSyncModeMock.mockResolvedValue(saved.syncMode)
  setSyncModeMock.mockResolvedValue(true)
  getOpacityMock.mockResolvedValue(saved.opacity)
  setOpacityMock.mockResolvedValue(saved.opacity)
  getShortcutMock.mockResolvedValue(saved.shortcut)
  setShortcutMock.mockResolvedValue(true)
  toggleMock.mockResolvedValue(undefined)
  openConfigMock.mockResolvedValue(true)

  installElectronAPI({
    brainDump: {
      getSyncMode: getSyncModeMock,
      setSyncMode: setSyncModeMock,
      getOpacity: getOpacityMock,
      setOpacity: setOpacityMock,
      getShortcut: getShortcutMock,
      setShortcut: setShortcutMock,
      toggle: toggleMock,
      // Only a bridge that reports a second slot gets the second-slot methods.
      ...(saved.secondaryShortcut === undefined
        ? {}
        : {
            getShortcutSecondary: getShortcutSecondaryMock,
            setShortcutSecondary: setShortcutSecondaryMock,
          }),
    },
    config: {
      open: openConfigMock,
    },
  })

  getShortcutSecondaryMock.mockResolvedValue(saved.secondaryShortcut ?? '')
  setShortcutSecondaryMock.mockResolvedValue(true)
}

describe('BrainDumpSettings', () => {
  beforeEach(() => {
    getSyncModeMock.mockReset()
    setSyncModeMock.mockReset()
    getOpacityMock.mockReset()
    setOpacityMock.mockReset()
    getShortcutMock.mockReset()
    setShortcutMock.mockReset()
    getShortcutSecondaryMock.mockReset()
    setShortcutSecondaryMock.mockReset()
    toggleMock.mockReset()
    openConfigMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows saved BrainDump settings after loading without changing hook order', async () => {
    // Arrange: the preload bridge resolves and flips the card from loading to ready.
    installBrainDumpBridge({
      syncMode: false,
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    // Act
    render(<BrainDumpSettings />)

    // Assert: the ready UI renders; the old conditional useMemo crash would abort here.
    expect(await screen.findByText('Window opacity')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    // The capture box renders the bound chord as a macOS glyph, not the raw
    // "Alt+Space" accelerator string.
    expect(screen.getByLabelText('Toggle shortcut')).toHaveTextContent('⌥Space')
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'React has detected a change in the order of Hooks',
      ),
    )
  })

  it('binds a second key to the same toggle without disturbing the first', async () => {
    // Arrange: a desktop app whose bridge carries both slots.
    installBrainDumpBridge({
      syncMode: false,
      opacity: 0.7,
      shortcut: 'Alt+Space',
      secondaryShortcut: '',
    })
    render(<BrainDumpSettings />)
    const secondBox = await screen.findByLabelText('Second toggle shortcut')

    // Act: record ⌘3 into the SECOND box.
    fireEvent.click(secondBox)
    fireEvent.keyDown(secondBox, { code: 'Digit3', metaKey: true })

    // Assert: the second slot took the new chord and the first kept its own.
    expect(setShortcutSecondaryMock).toHaveBeenCalledWith('CommandOrControl+3')
    expect(setShortcutMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Toggle shortcut')).toHaveTextContent('⌥Space')
  })

  it('hides the second shortcut box on a desktop app whose preload predates it', async () => {
    // Arrange: an installed app updates its web bundle before its preload, so the
    // bridge can carry the first slot only. Offering a box that cannot persist
    // would silently swallow the user's chord.
    installBrainDumpBridge({
      syncMode: false,
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })

    // Act
    render(<BrainDumpSettings />)

    // Assert: the first box still works; the second is not offered at all.
    expect(await screen.findByLabelText('Toggle shortcut')).toHaveTextContent(
      '⌥Space',
    )
    expect(
      screen.queryByLabelText('Second toggle shortcut'),
    ).not.toBeInTheDocument()
  })

  it('reverts the binding and explains why when the captured chord is already in use', async () => {
    // Arrange: load with Alt+Space bound, then make the next register attempt fail.
    installBrainDumpBridge({
      syncMode: false,
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })
    render(<BrainDumpSettings />)
    const box = await screen.findByLabelText('Toggle shortcut')
    expect(box).toHaveTextContent('⌥Space')
    // The main process rejects the next accelerator as already registered.
    setShortcutMock.mockResolvedValueOnce(false)

    // Act: record a new chord (⌘3) that gets refused.
    fireEvent.click(box)
    fireEvent.keyDown(box, { code: 'Digit3', metaKey: true })

    // Assert: the conflict copy appears and the box rolls back to the last
    // accepted binding rather than keeping the rejected ⌘3.
    expect(
      await screen.findByText("That combo's already in use — try another."),
    ).toBeInTheDocument()
    expect(box).toHaveTextContent('⌥Space')
  })

  it('degrades gracefully when an old preload exposes brainDump but not the settings getters', async () => {
    // Arrange: an OUTDATED desktop app exposes the brainDump window-toggle bridge
    // but predates the getSyncMode/getOpacity/getShortcut settings getters that
    // the load effect's Promise.all calls.
    installElectronAPI({ brainDump: { toggle: toggleMock } })

    // Act + Assert: mounting must NOT throw a synchronous TypeError from the
    // Promise.all (which would bubble out of useEffect to Next.js global-error
    // and blank the whole page). A graceful update card must render instead.
    render(<BrainDumpSettings />)
    expect(
      await screen.findByText(/Update CoreLive to the latest version/i),
    ).toBeInTheDocument()
  })

  it('shows a desktop-only message when the brainDump bridge is absent', async () => {
    // Arrange: a web renderer has no electronAPI at all.
    installElectronAPI(undefined)

    // Act
    render(<BrainDumpSettings />)

    // Assert: the fallback copy renders and no toggles are offered.
    expect(
      await screen.findByText(
        'BrainDump Note is only available in the desktop application.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows a loading state until the saved BrainDump settings arrive', async () => {
    // Arrange: getSyncMode never resolves, so the load Promise.all keeps the
    // card in its loading state (all three getters exist, so the guards pass).
    getSyncModeMock.mockReturnValue(new Promise<boolean>(() => {}))
    getOpacityMock.mockResolvedValue(0.7)
    getShortcutMock.mockResolvedValue('CommandOrControl+Shift+B')
    installElectronAPI({
      brainDump: {
        getSyncMode: getSyncModeMock,
        setSyncMode: setSyncModeMock,
        getOpacity: getOpacityMock,
        setOpacity: setOpacityMock,
        getShortcut: getShortcutMock,
        setShortcut: setShortcutMock,
        toggle: toggleMock,
      },
      config: {
        open: openConfigMock,
      },
    })

    // Act
    render(<BrainDumpSettings />)

    // Assert: the loading copy shows and no toggles have rendered yet.
    expect(
      await screen.findByText('Loading BrainDump settings…'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('opens config.json via the main-process config bridge when the button is clicked', async () => {
    // Arrange
    installBrainDumpBridge({
      syncMode: false,
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })
    render(<BrainDumpSettings />)
    const openButton = await screen.findByRole('button', {
      name: 'Open config.json',
    })

    // Act
    fireEvent.click(openButton)

    // Assert
    expect(openConfigMock).toHaveBeenCalledTimes(1)
  })

  it('shows an error banner when opening config.json fails', async () => {
    // Arrange
    installBrainDumpBridge({
      syncMode: false,
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })
    openConfigMock.mockResolvedValueOnce(false)
    render(<BrainDumpSettings />)
    const openButton = await screen.findByRole('button', {
      name: 'Open config.json',
    })

    // Act
    fireEvent.click(openButton)

    // Assert
    expect(
      await screen.findByText('Failed to open config file'),
    ).toBeInTheDocument()
  })
})
