import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrainDumpAppearance } from '@/components/electron/BrainDumpAppearance'
import preferencesReducer, {
  initialState,
} from '@/lib/redux/slices/preferencesSlice'
import type { PreferencesState } from '@/lib/schemas/preferences'

/**
 * Renders the Brain Dump appearance controls under a real preferences store (so
 * assertions read the actual reducer result) with the given preference overrides.
 */
function renderBrainDumpAppearance(overrides: Partial<PreferencesState> = {}) {
  const store = configureStore({
    reducer: { preferences: preferencesReducer },
    preloadedState: { preferences: { ...initialState, ...overrides } },
  })
  const user = userEvent.setup()
  render(
    <Provider store={store}>
      <BrainDumpAppearance />
    </Provider>,
  )
  return { store, user }
}

describe('BrainDumpAppearance — editor presentation', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('saves the chosen BrainDump font family when a face is picked', async () => {
    // Arrange — the default editor face is monospace.
    const { store, user } = renderBrainDumpAppearance()

    // Act — pick the Serif face.
    await user.click(screen.getByRole('radio', { name: 'Serif' }))

    // Assert — the serif font is saved to preferences.
    expect(store.getState().preferences.braindumpFontFamily).toBe('serif')
  })

  it('shows the BrainDump font-size slider at the saved size on its [12,24] track', () => {
    // Arrange / Act — a non-default saved size.
    renderBrainDumpAppearance({ braindumpFontSize: 20 })

    // Assert — the appearance group owns a single slider (the volume slider stayed
    // on the web-common Sound section), so it reads the saved px directly.
    const fontSizeSlider = screen.getByRole('slider')
    expect(fontSizeSlider).toHaveAttribute('aria-valuenow', '20')
    expect(fontSizeSlider).toHaveAttribute('aria-valuemin', '12')
    expect(fontSizeSlider).toHaveAttribute('aria-valuemax', '24')
  })

  it('saves the chosen BrainDump text color when a preset is picked', async () => {
    // Arrange — the default editor color is the theme foreground.
    const { store, user } = renderBrainDumpAppearance()

    // Act — pick the Amber preset.
    await user.click(screen.getByRole('radio', { name: 'Amber' }))

    // Assert — the amber theme token is saved.
    expect(store.getState().preferences.braindumpTextColor).toBe(
      'var(--primary)',
    )
  })

  it('saves a custom BrainDump text color chosen from the native color picker', () => {
    // Arrange
    const { store } = renderBrainDumpAppearance()
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
    renderBrainDumpAppearance({ braindumpTextColor: '#123456' })

    // Assert — the picker reflects the saved hex, not the fallback.
    expect(screen.getByLabelText('Custom BrainDump text color')).toHaveValue(
      '#123456',
    )
  })

  it('falls the color picker back to #000000 with no preset selected for a non-hex custom color', () => {
    // Arrange / Act — a theme token that is NOT one of the presets makes the
    // selection "custom": no preset radio is active, and the native picker (which
    // can only display a hex) cannot render a var() token so it shows #000000.
    renderBrainDumpAppearance({ braindumpTextColor: 'var(--accent)' })

    // Assert — every preset radio is unselected...
    expect(screen.getByRole('radio', { name: 'Default' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Muted' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Amber' })).not.toBeChecked()
    // ...and the custom picker shows the #000000 fallback for the var() token.
    expect(screen.getByLabelText('Custom BrainDump text color')).toHaveValue(
      '#000000',
    )
  })

  it('keeps finished BrainDump lines in place by default — clear-on-complete starts off', () => {
    // Arrange / Act — a fresh install keeps the on-concept behavior.
    renderBrainDumpAppearance()

    // Assert — the clear-on-complete switch is off (lines stay put by default).
    expect(
      screen.getByRole('switch', { name: 'Clear finished lines' }),
    ).not.toBeChecked()
  })

  it('opts into clearing finished BrainDump lines when its switch is turned on', async () => {
    // Arrange
    const { store, user } = renderBrainDumpAppearance()

    // Act — turn on "Clear finished lines".
    await user.click(
      screen.getByRole('switch', { name: 'Clear finished lines' }),
    )

    // Assert — the preference is now enabled in the slice.
    expect(store.getState().preferences.braindumpClearOnComplete).toBe(true)
  })
})
