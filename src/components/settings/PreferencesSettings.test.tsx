import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
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

    // Assert — the volume slider reflects the saved fraction directly (not 0–100).
    // Two sliders now exist (volume + BrainDump font size); the volume track is the
    // one bounded to [0,1] (font size is [12,24]), so scope by its max.
    const volumeSlider = screen
      .getAllByRole('slider')
      .find((slider) => slider.getAttribute('aria-valuemax') === '1')
    expect(volumeSlider).toBeDefined()
    expect(volumeSlider).toHaveAttribute('aria-valuenow', '0.6')
    expect(volumeSlider).toHaveAttribute('aria-valuemin', '0')
    expect(volumeSlider).toHaveAttribute('aria-valuemax', '1')
  })
})

describe('PreferencesSettings — BrainDump editor presentation', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('saves the chosen BrainDump font family when a face is picked', async () => {
    // Arrange — the default editor face is monospace.
    const { store, user } = renderPreferences()

    // Act — pick the Serif face.
    await user.click(screen.getByRole('radio', { name: 'Serif' }))

    // Assert — the serif font is saved to preferences.
    expect(store.getState().preferences.braindumpFontFamily).toBe('serif')
  })

  it('shows the BrainDump font-size slider at the saved size on its [12,24] track', () => {
    // Arrange / Act — a non-default saved size.
    renderPreferences({ braindumpFontSize: 20 })

    // Assert — the font-size slider (the one bounded to [12,24], unlike the [0,1]
    // volume track) reflects the saved px directly.
    const fontSizeSlider = screen
      .getAllByRole('slider')
      .find((slider) => slider.getAttribute('aria-valuemax') === '24')
    expect(fontSizeSlider).toBeDefined()
    expect(fontSizeSlider).toHaveAttribute('aria-valuenow', '20')
    expect(fontSizeSlider).toHaveAttribute('aria-valuemin', '12')
  })

  it('saves the chosen BrainDump text color when a preset is picked', async () => {
    // Arrange — the default editor color is the theme foreground.
    const { store, user } = renderPreferences()

    // Act — pick the Amber preset.
    await user.click(screen.getByRole('radio', { name: 'Amber' }))

    // Assert — the amber theme token is saved.
    expect(store.getState().preferences.braindumpTextColor).toBe(
      'var(--primary)',
    )
  })

  it('saves a custom BrainDump text color chosen from the native color picker', () => {
    // Arrange
    const { store } = renderPreferences()
    const customColorInput = screen.getByLabelText(
      'Custom BrainDump text color',
    )

    // Act — the native picker emits a 6-digit hex.
    fireEvent.change(customColorInput, { target: { value: '#abcdef' } })

    // Assert — the hex is stored verbatim as the custom color.
    expect(store.getState().preferences.braindumpTextColor).toBe('#abcdef')
  })

  it('shows a saved custom hex in the BrainDump color picker', () => {
    // Arrange / Act — a saved 6-digit hex should populate the native picker.
    renderPreferences({ braindumpTextColor: '#123456' })

    // Assert — the picker reflects the saved hex, not the fallback.
    expect(screen.getByLabelText('Custom BrainDump text color')).toHaveValue(
      '#123456',
    )
  })

  it('falls the color picker back to #000000 with no preset selected for a non-hex custom color', () => {
    // Arrange / Act — a theme token that is NOT one of the presets makes the
    // selection "custom": no preset radio is active, and the native picker (which
    // can only display a hex) cannot render a var() token so it shows #000000.
    renderPreferences({ braindumpTextColor: 'var(--accent)' })

    // Assert — every preset radio is unselected...
    expect(screen.getByRole('radio', { name: 'Default' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Muted' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Amber' })).not.toBeChecked()
    // ...and the custom picker shows the #000000 fallback for the var() token.
    expect(screen.getByLabelText('Custom BrainDump text color')).toHaveValue(
      '#000000',
    )
  })
})
