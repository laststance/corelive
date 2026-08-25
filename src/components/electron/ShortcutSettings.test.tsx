import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ShortcutSettings } from './ShortcutSettings'

const getRegisteredMock = vi.fn()
const getDefaultsMock = vi.fn()
const getStatsMock = vi.fn()
const updateMock = vi.fn()

/**
 * Defines the Electron shortcuts bridge consumed by ShortcutSettings.
 * @returns Nothing; mutates the happy-dom window object for this test.
 * @example
 * installShortcutsBridge()
 */
function installShortcutsBridge(): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: {
      shortcuts: {
        disable: vi.fn().mockResolvedValue(true),
        enable: vi.fn().mockResolvedValue(true),
        getDefaults: getDefaultsMock,
        getRegistered: getRegisteredMock,
        getStats: getStatsMock,
        isRegistered: vi.fn().mockResolvedValue(true),
        register: vi.fn().mockResolvedValue(true),
        unregister: vi.fn().mockResolvedValue(true),
        update: updateMock,
      },
    },
  })
}

describe('ShortcutSettings defaults', () => {
  beforeEach(() => {
    getRegisteredMock.mockReset()
    getDefaultsMock.mockReset()
    getStatsMock.mockReset()
    updateMock.mockReset()

    getRegisteredMock.mockResolvedValue([])
    getDefaultsMock.mockResolvedValue([
      {
        id: 'toggleFloatingNavigator',
        accelerator: 'CommandOrControl+3',
        description: 'toggleFloatingNavigator',
        enabled: true,
        isGlobal: true,
      },
      {
        id: 'toggleLiveEditor',
        accelerator: 'Alt+Space',
        description: 'toggleLiveEditor',
        enabled: true,
        isGlobal: true,
      },
    ])
    getStatsMock.mockResolvedValue({
      totalRegistered: 0,
      isEnabled: true,
      platform: 'darwin',
      shortcuts: {},
    })
    updateMock.mockResolvedValue(true)
    installShortcutsBridge()
  })

  it('shows the default accelerators as macOS glyphs after Reset to Defaults', async () => {
    // Arrange
    const user = userEvent.setup()
    render(<ShortcutSettings />)
    const resetButton = await screen.findByRole('button', {
      name: 'Reset to Defaults',
    })

    // Act
    await user.click(resetButton)

    // Assert: the capture boxes render the bound chord as Apple glyphs (⌘3 /
    // ⌥Space), not the raw "CommandOrControl+3" accelerator string.
    await waitFor(() => {
      expect(
        screen.getByLabelText('Toggle floating navigator'),
      ).toHaveTextContent('⌘3')
    })
    expect(screen.getByLabelText('Toggle LiveEditor')).toHaveTextContent(
      '⌥Space',
    )
  })

  it('enables a shortcut’s Test button once it is bound and disables it when cleared', async () => {
    // Arrange: reset so LiveEditor starts bound to its default accelerator.
    const user = userEvent.setup()
    render(<ShortcutSettings />)
    const resetButton = await screen.findByRole('button', {
      name: 'Reset to Defaults',
    })
    await user.click(resetButton)
    const liveEditorBox = await screen.findByLabelText('Toggle LiveEditor')
    const controls = liveEditorBox.parentElement
    if (!controls) throw new Error('expected the shortcut row controls wrapper')
    const testButton = within(controls).getByRole('button', { name: 'Test' })

    // Assert: a bound shortcut can be tested.
    expect(testButton).toBeEnabled()

    // Act: clear the binding by recording then pressing Delete.
    fireEvent.click(liveEditorBox)
    fireEvent.keyDown(liveEditorBox, { code: 'Delete' })

    // Assert: with nothing bound there is nothing to test, so Test is disabled.
    expect(liveEditorBox).toHaveTextContent('Click to set')
    expect(testButton).toBeDisabled()
  })

  it('renders LiveEditor but saves the previous shortcut id for an older installed app', async () => {
    // Arrange: old Electron returns the previous identifier while the deployed renderer is current.
    const legacyShortcut = {
      id: 'toggleBrainDump',
      accelerator: 'Alt+Space',
      description: 'toggleBrainDump',
      enabled: true,
      isGlobal: true,
    }
    getRegisteredMock.mockResolvedValue([legacyShortcut])
    getDefaultsMock.mockResolvedValue([
      {
        ...legacyShortcut,
      },
    ])
    const user = userEvent.setup()
    render(<ShortcutSettings />)
    const resetButton = await screen.findByRole('button', {
      name: 'Reset to Defaults',
    })

    // Act
    await user.click(resetButton)
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    // Assert: UI is renamed while the compatibility write targets the installed API.
    expect(screen.getByLabelText('Toggle LiveEditor')).toHaveTextContent(
      '⌥Space',
    )
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        toggleBrainDump: 'Alt+Space',
      })
    })
  })
})
