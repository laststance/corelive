// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { LiveEditorAppearance } from './LiveEditorAppearance'
import { renderWithSettings } from './settingsTestkit'
import type { FakeSettingsOptions } from './settingsTestkit'

/**
 * Renders the LiveEditor appearance controls on a fake preload (so assertions read the
 * workspace main would have persisted) with the given setting overrides.
 */
async function renderLiveEditorAppearance(
  overrides: FakeSettingsOptions['settings'] = {},
) {
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<LiveEditorAppearance />, {
    settings: overrides,
  })
  return { saved: () => fake.stored.settings, user }
}

/**
 * Finds a slider thumb by its domain maximum for existing value-boundary tests.
 * Accessible-name and helper relationships are covered independently below.
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

describe('LiveEditorAppearance — editor presentation', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('saves the chosen LiveEditor font family when a face is picked', async () => {
    // Arrange — the default editor face is monospace.
    const { saved, user } = await renderLiveEditorAppearance()

    // Act — pick the Serif face.
    await user.click(screen.getByRole('radio', { name: 'Serif' }))

    // Assert — the serif font is saved to settings.
    await waitFor(() => expect(saved().liveEditorFontFamily).toBe('serif'))
  })

  test('shows the LiveEditor font-size slider at the saved size on its [12,24] track', async () => {
    // Arrange / Act — a non-default saved size.
    await renderLiveEditorAppearance({ liveEditorFontSize: 20 })

    // Assert — pick the font-size slider by its [12,24] track (the clear-delay
    // slider shares the role but runs [0,5000]) and read the saved px.
    const fontSizeSlider = getSliderByMax('24')
    expect(fontSizeSlider).toHaveAttribute('aria-valuenow', '20')
    expect(fontSizeSlider).toHaveAttribute('aria-valuemin', '12')
    expect(fontSizeSlider).toHaveAttribute('aria-valuemax', '24')
  })

  test('saves the chosen LiveEditor text color when a preset is picked', async () => {
    // Arrange — the default editor color is the theme foreground.
    const { saved, user } = await renderLiveEditorAppearance()

    // Act — pick the Accent preset.
    await user.click(screen.getByRole('radio', { name: 'Accent' }))

    // Assert — the accent theme token (--primary) is saved.
    await waitFor(() =>
      expect(saved().liveEditorTextColor).toBe('var(--primary)'),
    )
  })

  test('saves a custom LiveEditor text color chosen from the native color picker', async () => {
    // Arrange
    const { saved } = await renderLiveEditorAppearance()
    const customColorInput = screen.getByLabelText(
      'Custom LiveEditor text color',
    )

    // Act — the native picker emits a 6-digit hex.
    fireEvent.change(customColorInput, { target: { value: '#abcdef' } })

    // Assert — the hex is stored verbatim as the custom color.
    await waitFor(() => expect(saved().liveEditorTextColor).toBe('#abcdef'))
  })

  test('shows a saved custom hex in the LiveEditor color picker', async () => {
    // Arrange / Act — a saved 6-digit hex should populate the native picker.
    await renderLiveEditorAppearance({ liveEditorTextColor: '#123456' })

    // Assert — the picker reflects the saved hex, not the fallback.
    expect(screen.getByLabelText('Custom LiveEditor text color')).toHaveValue(
      '#123456',
    )
  })

  test('falls the color picker back to #000000 with no preset selected for a non-hex custom color', async () => {
    // Arrange / Act — a theme token that is NOT one of the presets makes the
    // selection "custom": no preset radio is active, and the native picker (which
    // can only display a hex) cannot render a var() token so it shows #000000.
    await renderLiveEditorAppearance({ liveEditorTextColor: 'var(--accent)' })

    // Assert — every preset radio is unselected...
    expect(screen.getByRole('radio', { name: 'Default' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Muted' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Accent' })).not.toBeChecked()
    // ...and the custom picker shows the #000000 fallback for the var() token.
    expect(screen.getByLabelText('Custom LiveEditor text color')).toHaveValue(
      '#000000',
    )
  })

  test('keeps finished LiveEditor lines in place by default — clear-on-complete starts off', async () => {
    // Arrange / Act — a fresh install keeps the on-concept behavior.
    await renderLiveEditorAppearance()

    // Assert — the clear-on-complete switch is off (lines stay put by default).
    expect(
      screen.getByRole('switch', { name: 'Clear finished lines' }),
    ).not.toBeChecked()
  })

  test('describes keeping finished lines without promising a strike an older desktop app cannot draw', async () => {
    // Arrange / Act
    await renderLiveEditorAppearance()

    // Assert — the copy stays true for every installed app version (updates can be postponed).
    const description = screen.getByText(
      'Once you finish a line, tuck it away after the undo moment — so the page clears as you go. Off keeps finished lines in place until you delete them.',
    )
    expect(description).toBeVisible()
    expect(description.textContent).not.toMatch(/strike|struck/i)
  })

  test('opts into clearing finished LiveEditor lines when its switch is turned on', async () => {
    // Arrange
    const { saved, user } = await renderLiveEditorAppearance()

    // Act — turn on "Clear finished lines".
    await user.click(
      screen.getByRole('switch', { name: 'Clear finished lines' }),
    )

    // Assert — the setting is now enabled in the slice.
    await waitFor(() => expect(saved().liveEditorClearOnComplete).toBe(true))
  })

  test('shows the LiveEditor clear-delay slider at the saved delay on its [0,5000] track', async () => {
    // Arrange / Act — clearing is on, with a non-default saved linger.
    await renderLiveEditorAppearance({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 1500,
    })

    // Assert — the clear-delay slider (the [0,5000] track) reflects the saved ms.
    const clearDelaySlider = getSliderByMax('5000')
    expect(clearDelaySlider).toHaveAttribute('aria-valuenow', '1500')
    expect(clearDelaySlider).toHaveAttribute('aria-valuemin', '0')
    expect(clearDelaySlider).toHaveAttribute('aria-valuemax', '5000')
  })

  test('reads out the LiveEditor clear delay in milliseconds when it is non-zero', async () => {
    // Arrange / Act
    await renderLiveEditorAppearance({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 1500,
    })

    // Assert — the numeric readout names the exact linger in ms.
    expect(screen.getByText('1500 ms')).toBeInTheDocument()
  })

  test('reads out the LiveEditor clear delay as Instant at zero', async () => {
    // Arrange / Act — a 0 ms delay means remove the line the instant it completes.
    await renderLiveEditorAppearance({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 0,
    })

    // Assert — "Instant" shows in BOTH the numeric readout and the left
    // end-label at zero, so it appears exactly twice.
    expect(screen.getAllByText('Instant')).toHaveLength(2)
  })

  test('disables the clear-delay slider and nudges to enable it while clear-on-complete is off', async () => {
    // Arrange / Act — the default: finished lines stay, so the delay is moot.
    await renderLiveEditorAppearance({ liveEditorClearOnComplete: false })

    // Assert — the slider is disabled and a helper explains how to enable it.
    const clearDelaySlider = getSliderByMax('5000')
    expect(clearDelaySlider).toHaveAttribute('data-disabled')
    expect(
      screen.getByText(/Turn on .* to use the delay\./),
    ).toBeInTheDocument()
  })

  test('enables the clear-delay slider and drops the nudge once clear-on-complete is on', async () => {
    // Arrange / Act — opting into clearing makes the delay meaningful.
    await renderLiveEditorAppearance({ liveEditorClearOnComplete: true })

    // Assert — the slider is interactive (no disabled marker) and the helper is gone.
    const clearDelaySlider = getSliderByMax('5000')
    expect(clearDelaySlider).not.toHaveAttribute('data-disabled')
    expect(
      screen.queryByText(/Turn on .* to use the delay\./),
    ).not.toBeInTheDocument()
  })

  test('raises the saved clear delay by one 100 ms step when the slider is nudged right', async () => {
    // Arrange — clearing on, at a known 500 ms so a single step lands on 600.
    const { saved } = await renderLiveEditorAppearance({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 500,
    })
    const clearDelaySlider = getSliderByMax('5000')

    // Act — keyboard-nudge the thumb one step to the right (layout-free, unlike a
    // pointer drag which jsdom can't measure).
    clearDelaySlider.focus()
    fireEvent.keyDown(clearDelaySlider, { key: 'ArrowRight' })

    // Assert — the delay rose by one 100 ms step in the slice.
    await waitFor(() => expect(saved().liveEditorClearDelayMs).toBe(600))
  })

  test('shows the LiveEditor toast-duration slider at the saved duration on its [2000,10000] track', async () => {
    // Arrange / Act — a non-default saved confirmation duration.
    await renderLiveEditorAppearance({ liveEditorToastDurationMs: 6000 })

    // Assert — the toast-duration slider (the [2000,10000] track) reflects the
    // saved ms.
    const toastDurationSlider = getSliderByMax('10000')
    expect(toastDurationSlider).toHaveAttribute('aria-valuenow', '6000')
    expect(toastDurationSlider).toHaveAttribute('aria-valuemin', '2000')
    expect(toastDurationSlider).toHaveAttribute('aria-valuemax', '10000')
  })

  test('reads out the LiveEditor toast duration in milliseconds', async () => {
    // Arrange / Act
    await renderLiveEditorAppearance({ liveEditorToastDurationMs: 6000 })

    // Assert — the numeric readout names the exact duration in ms.
    expect(screen.getByText('6000 ms')).toBeInTheDocument()
  })

  test('keeps the toast-duration slider enabled even when clear-on-complete is off', async () => {
    // Arrange / Act — the toast shows on EVERY completion, so its duration is
    // always meaningful, unlike the clear delay which is moot when lines stay.
    await renderLiveEditorAppearance({ liveEditorClearOnComplete: false })

    // Assert — the slider is interactive (no disabled marker) regardless.
    const toastDurationSlider = getSliderByMax('10000')
    expect(toastDurationSlider).not.toHaveAttribute('data-disabled')
  })

  test('raises the saved toast duration by one 500 ms step when the slider is nudged right', async () => {
    // Arrange — a known 6000 ms so a single step lands on 6500.
    const { saved } = await renderLiveEditorAppearance({
      liveEditorToastDurationMs: 6000,
    })
    const toastDurationSlider = getSliderByMax('10000')

    // Act — keyboard-nudge the thumb one step to the right (layout-free, unlike a
    // pointer drag which jsdom can't measure).
    toastDurationSlider.focus()
    fireEvent.keyDown(toastDurationSlider, { key: 'ArrowRight' })

    // Assert — the duration rose by one 500 ms step in the slice.
    await waitFor(() => expect(saved().liveEditorToastDurationMs).toBe(6500))
  })
})

test('writing sliders expose their names and related helper text to assistive technology', async () => {
  // Arrange / Act
  await renderLiveEditorAppearance({ liveEditorClearOnComplete: false })

  // Assert
  expect(
    screen.getByRole('slider', { name: 'LiveEditor font size' }),
  ).toBeVisible()
  expect(
    screen.getByRole('slider', { name: 'LiveEditor clear delay' }),
  ).toHaveAccessibleDescription(
    'Turn on “Clear finished lines” to use the delay.',
  )
  expect(
    screen.getByRole('slider', {
      name: 'LiveEditor completion feedback duration',
    }),
  ).toHaveAccessibleDescription(
    'How long completion feedback stays available in Details. Undo keeps its original deadline.',
  )
})
