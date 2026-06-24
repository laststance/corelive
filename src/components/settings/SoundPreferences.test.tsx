import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SoundPreferences } from '@/components/settings/SoundPreferences'
import { previewTimbre } from '@/lib/audio/soundEngine'
import preferencesReducer, {
  initialState,
} from '@/lib/redux/slices/preferencesSlice'
import type { PreferencesState } from '@/lib/schemas/preferences'

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
 * Renders the Sound preferences under a real preferences store (so assertions read
 * the actual reducer result) with the given preference overrides spread over the
 * slice defaults.
 */
function renderSoundPreferences(overrides: Partial<PreferencesState> = {}) {
  const store = configureStore({
    reducer: { preferences: preferencesReducer },
    preloadedState: { preferences: { ...initialState, ...overrides } },
  })
  const user = userEvent.setup()
  render(
    <Provider store={store}>
      <SoundPreferences />
    </Provider>,
  )
  return { store, user }
}

describe('SoundPreferences — sound palette', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('makes no sound on a fresh install — every moment cue starts off', () => {
    // Arrange / Act
    renderSoundPreferences()

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

  it('enables the add-a-task cue in preferences when its switch is turned on', async () => {
    // Arrange
    const { store, user } = renderSoundPreferences()

    // Act — turn on the "Adding a task" cue.
    await user.click(screen.getByRole('switch', { name: 'Adding a task' }))

    // Assert — the task-create moment is now enabled in the preferences slice.
    expect(store.getState().preferences.soundMoments['task-create']).toBe(true)
  })

  it('shows the master All cues switch on when every moment cue is already enabled', () => {
    // Arrange / Act — a palette with all three cues on.
    renderSoundPreferences({
      soundMoments: { 'task-create': true, complete: true, clear: true },
    })

    // Assert — the master switch reads on (it mirrors an all-on palette).
    expect(screen.getByRole('switch', { name: 'All cues' })).toBeChecked()
  })

  it('shows the master All cues switch off when only some moment cues are enabled', () => {
    // Arrange / Act — a partial palette: task-create on, the other two off.
    renderSoundPreferences({
      soundMoments: { 'task-create': true, complete: false, clear: false },
    })

    // Assert — the master switch reads off; it never claims a partial palette is "all".
    expect(screen.getByRole('switch', { name: 'All cues' })).not.toBeChecked()
  })

  it('enables every moment cue when the master All cues switch is turned on', async () => {
    // Arrange — a fresh, silent install (every cue off).
    const { store, user } = renderSoundPreferences()

    // Act — turn on the master "All cues" switch.
    await user.click(screen.getByRole('switch', { name: 'All cues' }))

    // Assert — all three cues are now enabled in the preferences slice.
    expect(store.getState().preferences.soundMoments).toEqual({
      'task-create': true,
      complete: true,
      clear: true,
    })
  })

  it('silences every moment cue when the master All cues switch is turned off', async () => {
    // Arrange — a palette with all three cues currently on.
    const { store, user } = renderSoundPreferences({
      soundMoments: { 'task-create': true, complete: true, clear: true },
    })

    // Act — turn off the master "All cues" switch.
    await user.click(screen.getByRole('switch', { name: 'All cues' }))

    // Assert — every cue is now off (a silent palette).
    expect(store.getState().preferences.soundMoments).toEqual({
      'task-create': false,
      complete: false,
      clear: false,
    })
  })

  it('saves and auditions the chosen timbre when a different one is picked', async () => {
    // Arrange — the defaults are the 'felt' timbre at 0.6 master volume.
    const { store, user } = renderSoundPreferences()

    // Act — pick the Wood timbre.
    await user.click(screen.getByRole('radio', { name: 'Wood' }))

    // Assert — the choice is saved and auditioned once at the current volume.
    expect(store.getState().preferences.soundTimbre).toBe('wood')
    expect(vi.mocked(previewTimbre)).toHaveBeenCalledWith('wood', 0.6)
  })

  it('shows the master volume slider at the saved level on its [0,1] track', () => {
    // Arrange / Act — the default master volume is 0.6.
    renderSoundPreferences()

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
    renderSoundPreferences()

    // Assert — BrainDump font/size/color/clear-on-complete controls are gone from
    // the web-common surface (D2=A: BrainDump prefs consolidated into the Electron card).
    expect(
      screen.queryByRole('switch', { name: 'Clear finished lines' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Custom BrainDump text color'),
    ).not.toBeInTheDocument()
  })
})
