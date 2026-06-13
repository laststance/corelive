import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PreferencesSettings } from '@/components/settings/PreferencesSettings'
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
 * Renders the Preferences panel under a real preferences store (so assertions
 * read the actual reducer result) with the given preference overrides spread over
 * the slice defaults.
 */
function renderPreferences(overrides: Partial<PreferencesState> = {}) {
  const store = configureStore({
    reducer: { preferences: preferencesReducer },
    preloadedState: { preferences: { ...initialState, ...overrides } },
  })
  const user = userEvent.setup()
  render(
    <Provider store={store}>
      <PreferencesSettings />
    </Provider>,
  )
  return { store, user }
}

describe('PreferencesSettings — sound palette', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('makes no sound on a fresh install — every moment cue starts off', () => {
    // Arrange / Act
    renderPreferences()

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
    const { store, user } = renderPreferences()

    // Act — turn on the "Adding a task" cue.
    await user.click(screen.getByRole('switch', { name: 'Adding a task' }))

    // Assert — the task-create moment is now enabled in the preferences slice.
    expect(store.getState().preferences.soundMoments['task-create']).toBe(true)
  })

  it('saves and auditions the chosen timbre when a different one is picked', async () => {
    // Arrange — the defaults are the 'felt' timbre at 0.6 master volume.
    const { store, user } = renderPreferences()

    // Act — pick the Wood timbre.
    await user.click(screen.getByRole('radio', { name: 'Wood' }))

    // Assert — the choice is saved and auditioned once at the current volume.
    expect(store.getState().preferences.soundTimbre).toBe('wood')
    expect(vi.mocked(previewTimbre)).toHaveBeenCalledWith('wood', 0.6)
  })

  it('shows the master volume slider at the saved level on its [0,1] track', () => {
    // Arrange / Act — the default master volume is 0.6.
    renderPreferences()

    // Assert — the single slider reflects the saved fraction directly (not 0–100).
    const volumeSlider = screen.getByRole('slider')
    expect(volumeSlider).toHaveAttribute('aria-valuenow', '0.6')
    expect(volumeSlider).toHaveAttribute('aria-valuemin', '0')
    expect(volumeSlider).toHaveAttribute('aria-valuemax', '1')
  })
})
