import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ShortcutOpeningSoundSetting } from './ShortcutOpeningSoundSetting'

const getElectronConfigMock = vi.fn()
const setElectronConfigMock = vi.fn()
const previewAudioInstances: MockShortcutPreviewAudio[] = []

class MockShortcutPreviewAudio {
  currentTime = 0
  pause = vi.fn()
  play = vi.fn().mockResolvedValue(undefined)
  volume = 1

  constructor(public readonly src: string) {}
}

/** Renders desktop sound controls for interaction tests without depending on a Redux sound palette.
 * @returns The simulated user for settings interactions.
 * @example
 * const { user } = renderShortcutOpeningSoundSetting()
 */
function renderShortcutOpeningSoundSetting() {
  const user = userEvent.setup()
  render(<ShortcutOpeningSoundSetting />)
  return { user }
}

describe('ShortcutOpeningSoundSetting', () => {
  beforeEach(() => {
    previewAudioInstances.length = 0
    class MockAudioConstructor extends MockShortcutPreviewAudio {
      constructor(src: string) {
        super(src)
        previewAudioInstances.push(this)
      }
    }

    vi.stubGlobal('Audio', MockAudioConstructor)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
      writable: true,
    })
  })

  test('shows the desktop shortcut opening cue on by default with shuffle selected and a preview button', async () => {
    // Arrange
    getElectronConfigMock.mockResolvedValue(true)
    getElectronConfigMock.mockImplementation(async (configPath: string) =>
      configPath === 'behavior.shortcutOpenSoundEnabled' ? true : undefined,
    )
    setElectronConfigMock.mockResolvedValue(true)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        config: {
          get: getElectronConfigMock,
          set: setElectronConfigMock,
        },
      },
      writable: true,
    })
    renderShortcutOpeningSoundSetting()
    const openingSoundSwitch = await screen.findByRole('switch', {
      name: 'Shortcut opening sound',
    })
    const openingSoundSelect = await screen.findByRole('combobox', {
      name: 'Opening sound',
    })
    const previewButton = screen.getByRole('button', { name: 'Preview sound' })

    // Assert
    await waitFor(() => {
      expect(getElectronConfigMock).toHaveBeenCalledWith(
        'behavior.shortcutOpenSoundEnabled',
      )
    })
    expect(openingSoundSwitch).toBeChecked()
    expect(getElectronConfigMock).toHaveBeenCalledWith(
      'behavior.shortcutOpenSoundSelection',
    )
    expect(openingSoundSelect).toHaveTextContent('Shuffle all')
    expect(previewButton).toBeEnabled()
  })

  test('saves an explicit shortcut opening sound choice when a different option is picked', async () => {
    // Arrange
    getElectronConfigMock.mockResolvedValue(true)
    getElectronConfigMock.mockImplementation(async (configPath: string) =>
      configPath === 'behavior.shortcutOpenSoundEnabled' ? true : 'shuffle',
    )
    setElectronConfigMock.mockResolvedValue(true)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        config: {
          get: getElectronConfigMock,
          set: setElectronConfigMock,
        },
      },
      writable: true,
    })
    const { user } = renderShortcutOpeningSoundSetting()
    const openingSoundSelect = await screen.findByRole('combobox', {
      name: 'Opening sound',
    })

    // Act
    await user.click(openingSoundSelect)
    await user.click(
      screen.getByRole('option', { name: 'Velvet capacitive key' }),
    )

    // Assert
    await waitFor(() => {
      expect(setElectronConfigMock).toHaveBeenCalledWith(
        'behavior.shortcutOpenSoundSelection',
        'velvet-capacitive-key',
      )
    })
    expect(openingSoundSelect).toHaveTextContent('Velvet capacitive key')
  })

  test('previews the saved shortcut opening sound without changing the enabled switch', async () => {
    // Arrange
    getElectronConfigMock.mockImplementation(async (configPath: string) => {
      if (configPath === 'behavior.shortcutOpenSoundEnabled') return true
      if (configPath === 'behavior.shortcutOpenSoundSelection') {
        return 'press-release-mechanism'
      }
      return undefined
    })
    setElectronConfigMock.mockResolvedValue(true)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        config: {
          get: getElectronConfigMock,
          set: setElectronConfigMock,
        },
      },
      writable: true,
    })
    const { user } = renderShortcutOpeningSoundSetting()

    // Act
    await user.click(screen.getByRole('button', { name: 'Preview sound' }))

    // Assert
    expect(previewAudioInstances).toHaveLength(1)
    expect(previewAudioInstances[0]?.src).toContain(
      '/sounds/shortcut-opening/10-press-release-mechanism.mp3',
    )
    expect(previewAudioInstances[0]?.volume).toBe(0.55)
    expect(previewAudioInstances[0]?.play).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('switch', { name: 'Shortcut opening sound' }),
    ).toBeChecked()
  })

  test('falls back to Shuffle all when Electron returns an invalid saved shortcut sound choice', async () => {
    // Arrange
    getElectronConfigMock.mockImplementation(async (configPath: string) => {
      if (configPath === 'behavior.shortcutOpenSoundEnabled') return true
      if (configPath === 'behavior.shortcutOpenSoundSelection') {
        return 'loud-typewriter'
      }
      return undefined
    })
    setElectronConfigMock.mockResolvedValue(true)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        config: {
          get: getElectronConfigMock,
          set: setElectronConfigMock,
        },
      },
      writable: true,
    })

    // Act
    renderShortcutOpeningSoundSetting()

    // Assert
    expect(
      await screen.findByRole('combobox', { name: 'Opening sound' }),
    ).toHaveTextContent('Shuffle all')
  })
})
