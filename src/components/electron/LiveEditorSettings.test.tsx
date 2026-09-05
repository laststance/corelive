import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LiveEditorSettings } from './LiveEditorSettings'

const getOpacityMock = vi.fn()
const setOpacityMock = vi.fn()
const getShortcutMock = vi.fn()
const setShortcutMock = vi.fn()
const getShortcutSecondaryMock = vi.fn()
const setShortcutSecondaryMock = vi.fn()
const toggleMock = vi.fn()
const openConfigMock = vi.fn()

type LiveEditorBridge = {
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
 * installElectronAPI({ liveEditor: fakeBridge })
 */
function installElectronAPI(
  api:
    | {
        liveEditor?: Partial<LiveEditorBridge>
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
 * Installs a successful LiveEditor preload bridge so loading can advance to ready state.
 *
 * @param saved - Persisted settings returned by the main process mocks.
 * @returns Nothing; prepares all LiveEditor mocks for a component render.
 * @example
 * installLiveEditorBridge({ opacity: 0.7, shortcut: 'CommandOrControl+Shift+B' })
 */
function installLiveEditorBridge(saved: {
  opacity: number
  shortcut: string
  /**
   * Second-slot accelerator. Omit to simulate an OLD preload that predates the
   * two-slot bridge — the card must then render a single capture box.
   */
  secondaryShortcut?: string
}): void {
  getOpacityMock.mockResolvedValue(saved.opacity)
  setOpacityMock.mockResolvedValue(saved.opacity)
  getShortcutMock.mockResolvedValue(saved.shortcut)
  setShortcutMock.mockResolvedValue(true)
  toggleMock.mockResolvedValue(undefined)
  openConfigMock.mockResolvedValue(true)

  installElectronAPI({
    liveEditor: {
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

describe('LiveEditorSettings', () => {
  beforeEach(() => {
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

  it('shows saved LiveEditor settings after loading without changing hook order', async () => {
    // Arrange: the preload bridge resolves and flips the card from loading to ready.
    installLiveEditorBridge({
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    // Act
    render(<LiveEditorSettings />)

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
    installLiveEditorBridge({
      opacity: 0.7,
      shortcut: 'Alt+Space',
      secondaryShortcut: '',
    })
    render(<LiveEditorSettings />)
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
    installLiveEditorBridge({
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })

    // Act
    render(<LiveEditorSettings />)

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
    installLiveEditorBridge({
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })
    render(<LiveEditorSettings />)
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

  it('degrades gracefully when an old preload exposes liveEditor but not the settings getters', async () => {
    // Arrange: an OUTDATED desktop app exposes the `liveEditor` window-toggle bridge
    // but predates the getOpacity/getShortcut settings getters that
    // the load effect's Promise.all calls.
    installElectronAPI({ liveEditor: { toggle: toggleMock } })

    // Act + Assert: mounting must NOT throw a synchronous TypeError from the
    // Promise.all (which would bubble out of useEffect to Next.js global-error
    // and blank the whole page). A graceful update card must render instead.
    render(<LiveEditorSettings />)
    expect(
      await screen.findByText(/Update CoreLive to the latest version/i),
    ).toBeInTheDocument()
  })

  it('shows a desktop-only message when the LiveEditor bridge is absent', async () => {
    // Arrange: a web renderer has no electronAPI at all.
    installElectronAPI(undefined)

    // Act
    render(<LiveEditorSettings />)

    // Assert: the fallback copy renders and no toggles are offered.
    expect(
      await screen.findByText(
        'LiveEditor Note is only available in the desktop application.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows a loading state until the saved LiveEditor settings arrive', async () => {
    // Arrange: getOpacity never resolves, so the load Promise.all keeps the
    // card in its loading state (both getters exist, so the guards pass).
    getOpacityMock.mockReturnValue(new Promise<number>(() => {}))
    getShortcutMock.mockResolvedValue('CommandOrControl+Shift+B')
    installElectronAPI({
      liveEditor: {
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
    render(<LiveEditorSettings />)

    // Assert: the loading copy shows and no toggles have rendered yet.
    expect(
      await screen.findByText('Loading LiveEditor settings…'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('opens config.json via the main-process config bridge when the button is clicked', async () => {
    // Arrange
    installLiveEditorBridge({
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })
    render(<LiveEditorSettings />)
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
    installLiveEditorBridge({
      opacity: 0.7,
      shortcut: 'Alt+Space',
    })
    openConfigMock.mockResolvedValueOnce(false)
    render(<LiveEditorSettings />)
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
