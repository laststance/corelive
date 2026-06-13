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
        id: 'toggleBrainDump',
        accelerator: 'Alt+Space',
        description: 'toggleBrainDump',
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
    expect(screen.getByLabelText('Toggle BrainDump')).toHaveTextContent(
      '⌥Space',
    )
  })

  it('enables a shortcut’s Test button once it is bound and disables it when cleared', async () => {
    // Arrange: reset so BrainDump starts bound to its default accelerator.
    const user = userEvent.setup()
    render(<ShortcutSettings />)
    const resetButton = await screen.findByRole('button', {
      name: 'Reset to Defaults',
    })
    await user.click(resetButton)
    const brainDumpBox = await screen.findByLabelText('Toggle BrainDump')
    const controls = brainDumpBox.parentElement
    if (!controls) throw new Error('expected the shortcut row controls wrapper')
    const testButton = within(controls).getByRole('button', { name: 'Test' })

    // Assert: a bound shortcut can be tested.
    expect(testButton).toBeEnabled()

    // Act: clear the binding by recording then pressing Delete.
    fireEvent.click(brainDumpBox)
    fireEvent.keyDown(brainDumpBox, { code: 'Delete' })

    // Assert: with nothing bound there is nothing to test, so Test is disabled.
    expect(brainDumpBox).toHaveTextContent('Click to set')
    expect(testButton).toBeDisabled()
  })
})
