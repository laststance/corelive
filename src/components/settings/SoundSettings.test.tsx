import { configureStore } from '@reduxjs/toolkit'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SoundSettings } from '@/components/settings/SoundSettings'
import { previewTimbre } from '@/lib/audio/soundEngine'
import userSettingsReducer, {
  initialState,
} from '@/lib/redux/slices/settingsSlice'
import type { UserSettingsState } from '@/lib/schemas/settings'

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

// The timbre picker auditions the chosen sound through the engine; mock it so the
// test asserts the audition call (which timbre, at which volume) without real Web
// Audio or an asset fetch. The engine itself is covered by soundEngine.test.ts.
vi.mock('@/lib/audio/soundEngine', () => ({
  playTimbre: vi.fn(),
  prewarmTimbre: vi.fn(),
  previewTimbre: vi.fn(),
  resetSoundEngineForTest: vi.fn(),
}))

/**
 * Renders the Sound settings under a real settings store (so assertions read
 * the actual reducer result) with the given setting overrides spread over the
 * slice defaults.
 */
function renderSoundSettings(overrides: Partial<UserSettingsState> = {}) {
  const store = configureStore({
    reducer: { settings: userSettingsReducer },
    preloadedState: { settings: { ...initialState, ...overrides } },
  })
  const user = userEvent.setup()
  render(
    <Provider store={store}>
      <SoundSettings />
    </Provider>,
  )
  return { store, user }
}

describe('SoundSettings — sound palette', () => {
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

  it('makes no sound on a fresh install — every moment cue starts off', () => {
    // Arrange / Act
    renderSoundSettings()

    // Assert — all three earned-beat cues are off by default (a silent install).
    expect(
      screen.getByRole('switch', { name: 'Adding a task' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Checking one off' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Clearing finished tasks' }),
    ).not.toBeChecked()
  })

  it('enables the add-a-task cue in settings when its switch is turned on', async () => {
    // Arrange
    const { store, user } = renderSoundSettings()

    // Act — turn on the "Adding a task" cue.
    await user.click(screen.getByRole('switch', { name: 'Adding a task' }))

    // Assert — the task-create moment is now enabled in the settings slice.
    expect(store.getState().settings.soundMoments['task-create']).toBe(true)
  })

  it('shows the master All cues switch on when every moment cue is already enabled', () => {
    // Arrange / Act — a palette with all three cues on.
    renderSoundSettings({
      soundMoments: { 'task-create': true, complete: true, clear: true },
    })

    // Assert — the master switch reads on (it mirrors an all-on palette).
    expect(screen.getByRole('switch', { name: 'All cues' })).toBeChecked()
  })

  it('shows the master All cues switch off when only some moment cues are enabled', () => {
    // Arrange / Act — a partial palette: task-create on, the other two off.
    renderSoundSettings({
      soundMoments: { 'task-create': true, complete: false, clear: false },
    })

    // Assert — the master switch reads off; it never claims a partial palette is "all".
    expect(screen.getByRole('switch', { name: 'All cues' })).not.toBeChecked()
  })

  it('enables every moment cue when the master All cues switch is turned on', async () => {
    // Arrange — a fresh, silent install (every cue off).
    const { store, user } = renderSoundSettings()

    // Act — turn on the master "All cues" switch.
    await user.click(screen.getByRole('switch', { name: 'All cues' }))

    // Assert — all three cues are now enabled in the settings slice.
    expect(store.getState().settings.soundMoments).toEqual({
      'task-create': true,
      complete: true,
      clear: true,
    })
  })

  it('silences every moment cue when the master All cues switch is turned off', async () => {
    // Arrange — a palette with all three cues currently on.
    const { store, user } = renderSoundSettings({
      soundMoments: { 'task-create': true, complete: true, clear: true },
    })

    // Act — turn off the master "All cues" switch.
    await user.click(screen.getByRole('switch', { name: 'All cues' }))

    // Assert — every cue is now off (a silent palette).
    expect(store.getState().settings.soundMoments).toEqual({
      'task-create': false,
      complete: false,
      clear: false,
    })
  })

  it('saves and auditions the chosen timbre when a different one is picked', async () => {
    // Arrange — the defaults are the 'felt' timbre at 0.6 master volume.
    const { store, user } = renderSoundSettings()

    // Act — pick the Wood timbre.
    await user.click(screen.getByRole('radio', { name: 'Wood' }))

    // Assert — the choice is saved and auditioned once at the current volume.
    expect(store.getState().settings.soundTimbre).toBe('wood')
    expect(vi.mocked(previewTimbre)).toHaveBeenCalledWith('wood', 0.6)
  })

  it('shows the master volume slider at the saved level on its [0,1] track', () => {
    // Arrange / Act — the default master volume is 0.6.
    renderSoundSettings()

    // Assert — the volume slider reflects the saved fraction directly (not 0–100).
    // The BrainDump font-size slider moved to the Electron Brain Dump card, so the
    // Sound section now owns a single [0,1] slider.
    const volumeSlider = screen.getByRole('slider')
    expect(volumeSlider).toHaveAttribute('aria-valuenow', '0.6')
    expect(volumeSlider).toHaveAttribute('aria-valuemin', '0')
    expect(volumeSlider).toHaveAttribute('aria-valuemax', '1')
  })

  it('no longer renders the BrainDump appearance controls — they moved to the Brain Dump card', () => {
    // Arrange / Act — the web-common Sound section.
    renderSoundSettings()

    // Assert — BrainDump font/size/color/clear-on-complete controls are gone from
    // the web-common surface (D2=A: BrainDump settings consolidated into the Electron card).
    expect(
      screen.queryByRole('switch', { name: 'Clear finished lines' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Custom BrainDump text color'),
    ).not.toBeInTheDocument()
  })

  it('shows the desktop shortcut opening cue on by default with shuffle selected and a preview button', async () => {
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
    renderSoundSettings()
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

  it('saves an explicit shortcut opening sound choice when a different option is picked', async () => {
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
    const { user } = renderSoundSettings()
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

  it('previews the saved shortcut opening sound without changing the enabled switch', async () => {
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
    const { user } = renderSoundSettings()

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

  it('falls back to Shuffle all when Electron returns an invalid saved shortcut sound choice', async () => {
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
    renderSoundSettings()

    // Assert
    expect(
      await screen.findByRole('combobox', { name: 'Opening sound' }),
    ).toHaveTextContent('Shuffle all')
  })
})
