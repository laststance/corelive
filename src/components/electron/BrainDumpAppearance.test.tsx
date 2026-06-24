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

/**
 * Find a slider thumb by its track max. The three sliders here (font size, max 24;
 * clear delay, max 5000; toast duration, max 10000) can't be told apart by
 * accessible name — the thumb (role="slider") carries none, because shadcn forwards
 * aria-label to the slider ROOT, not the thumb — so the distinct track max is the
 * stable discriminator.
 *
 * @param max - The aria-valuemax to match ('24' = font size, '5000' = clear delay,
 * '10000' = toast duration).
 * @returns The matching slider thumb element.
 * @example
 * getSliderByMax('10000') // the toast-duration slider
 */
function getSliderByMax(max: string): HTMLElement {
  const slider = screen
    .getAllByRole('slider')
    .find((element) => element.getAttribute('aria-valuemax') === max)
  if (!slider) throw new Error(`No slider with aria-valuemax="${max}"`)
  return slider
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

    // Assert — pick the font-size slider by its [12,24] track (the clear-delay
    // slider shares the role but runs [0,5000]) and read the saved px.
    const fontSizeSlider = getSliderByMax('24')
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

  it('shows the BrainDump clear-delay slider at the saved delay on its [0,5000] track', () => {
    // Arrange / Act — clearing is on, with a non-default saved linger.
    renderBrainDumpAppearance({
      braindumpClearOnComplete: true,
      braindumpClearDelayMs: 1500,
    })

    // Assert — the clear-delay slider (the [0,5000] track) reflects the saved ms.
    const clearDelaySlider = getSliderByMax('5000')
    expect(clearDelaySlider).toHaveAttribute('aria-valuenow', '1500')
    expect(clearDelaySlider).toHaveAttribute('aria-valuemin', '0')
    expect(clearDelaySlider).toHaveAttribute('aria-valuemax', '5000')
  })

  it('reads out the BrainDump clear delay in milliseconds when it is non-zero', () => {
    // Arrange / Act
    renderBrainDumpAppearance({
      braindumpClearOnComplete: true,
      braindumpClearDelayMs: 1500,
    })

    // Assert — the numeric readout names the exact linger in ms.
    expect(screen.getByText('1500 ms')).toBeInTheDocument()
  })

  it('reads out the BrainDump clear delay as Instant at zero', () => {
    // Arrange / Act — a 0 ms delay means remove the line the instant it completes.
    renderBrainDumpAppearance({
      braindumpClearOnComplete: true,
      braindumpClearDelayMs: 0,
    })

    // Assert — "Instant" shows in BOTH the numeric readout and the left
    // end-label at zero, so it appears exactly twice.
    expect(screen.getAllByText('Instant')).toHaveLength(2)
  })

  it('disables the clear-delay slider and nudges to enable it while clear-on-complete is off', () => {
    // Arrange / Act — the default: finished lines stay, so the delay is moot.
    renderBrainDumpAppearance({ braindumpClearOnComplete: false })

    // Assert — the slider is disabled and a helper explains how to enable it.
    const clearDelaySlider = getSliderByMax('5000')
    expect(clearDelaySlider).toHaveAttribute('data-disabled')
    expect(
      screen.getByText(/Turn on .* to use the delay\./),
    ).toBeInTheDocument()
  })

  it('enables the clear-delay slider and drops the nudge once clear-on-complete is on', () => {
    // Arrange / Act — opting into clearing makes the delay meaningful.
    renderBrainDumpAppearance({ braindumpClearOnComplete: true })

    // Assert — the slider is interactive (no disabled marker) and the helper is gone.
    const clearDelaySlider = getSliderByMax('5000')
    expect(clearDelaySlider).not.toHaveAttribute('data-disabled')
    expect(
      screen.queryByText(/Turn on .* to use the delay\./),
    ).not.toBeInTheDocument()
  })

  it('raises the saved clear delay by one 100 ms step when the slider is nudged right', () => {
    // Arrange — clearing on, at a known 500 ms so a single step lands on 600.
    const { store } = renderBrainDumpAppearance({
      braindumpClearOnComplete: true,
      braindumpClearDelayMs: 500,
    })
    const clearDelaySlider = getSliderByMax('5000')

    // Act — keyboard-nudge the thumb one step to the right (layout-free, unlike a
    // pointer drag which jsdom can't measure).
    clearDelaySlider.focus()
    fireEvent.keyDown(clearDelaySlider, { key: 'ArrowRight' })

    // Assert — the delay rose by one 100 ms step in the slice.
    expect(store.getState().preferences.braindumpClearDelayMs).toBe(600)
  })

  it('shows the BrainDump toast-duration slider at the saved duration on its [2000,10000] track', () => {
    // Arrange / Act — a non-default saved confirmation duration.
    renderBrainDumpAppearance({ braindumpToastDurationMs: 6000 })

    // Assert — the toast-duration slider (the [2000,10000] track) reflects the
    // saved ms.
    const toastDurationSlider = getSliderByMax('10000')
    expect(toastDurationSlider).toHaveAttribute('aria-valuenow', '6000')
    expect(toastDurationSlider).toHaveAttribute('aria-valuemin', '2000')
    expect(toastDurationSlider).toHaveAttribute('aria-valuemax', '10000')
  })

  it('reads out the BrainDump toast duration in milliseconds', () => {
    // Arrange / Act
    renderBrainDumpAppearance({ braindumpToastDurationMs: 6000 })

    // Assert — the numeric readout names the exact duration in ms.
    expect(screen.getByText('6000 ms')).toBeInTheDocument()
  })

  it('keeps the toast-duration slider enabled even when clear-on-complete is off', () => {
    // Arrange / Act — the toast shows on EVERY completion, so its duration is
    // always meaningful, unlike the clear delay which is moot when lines stay.
    renderBrainDumpAppearance({ braindumpClearOnComplete: false })

    // Assert — the slider is interactive (no disabled marker) regardless.
    const toastDurationSlider = getSliderByMax('10000')
    expect(toastDurationSlider).not.toHaveAttribute('data-disabled')
  })

  it('raises the saved toast duration by one 500 ms step when the slider is nudged right', () => {
    // Arrange — a known 6000 ms so a single step lands on 6500.
    const { store } = renderBrainDumpAppearance({
      braindumpToastDurationMs: 6000,
    })
    const toastDurationSlider = getSliderByMax('10000')

    // Act — keyboard-nudge the thumb one step to the right (layout-free, unlike a
    // pointer drag which jsdom can't measure).
    toastDurationSlider.focus()
    fireEvent.keyDown(toastDurationSlider, { key: 'ArrowRight' })

    // Assert — the duration rose by one 500 ms step in the slice.
    expect(store.getState().preferences.braindumpToastDurationMs).toBe(6500)
  })
})
