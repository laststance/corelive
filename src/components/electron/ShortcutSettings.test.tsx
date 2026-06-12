import { render, screen, waitFor } from '@testing-library/react'
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

  it('resets Floating Navigator and BrainDump inputs to the new default accelerators', async () => {
    // Arrange
    const user = userEvent.setup()
    render(<ShortcutSettings />)
    const resetButton = await screen.findByRole('button', {
      name: 'Reset to Defaults',
    })

    // Act
    await user.click(resetButton)

    // Assert
    await waitFor(() => {
      expect(screen.getByLabelText('Toggle floating navigator')).toHaveValue(
        'CommandOrControl+3',
      )
    })
    expect(screen.getByLabelText('Toggle BrainDump')).toHaveValue('Alt+Space')
  })
})
