'use client'

/**
 * @fileoverview Brain Dump editor look-and-behavior controls (font family, size,
 * text color, clear-on-complete, and clear delay).
 *
 * Pure Redux — these write the `settings` slice (persisted to localStorage and
 * synced across windows), with no IPC. Split out of the old web-common
 * common settings card during the Settings regroup so they sit beside the rest of
 * the Brain Dump settings instead of on the web-common surface, and rendered as
 * an independent sibling (not nested inside the IPC-gated note card) so a preload
 * skew on the `brainDump` bridge never hides these DOM-only controls.
 *
 * @module components/electron/BrainDumpAppearance
 */
import { type ReactElement } from 'react'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  BRAINDUMP_CLEAR_DELAY_MAX_MS,
  BRAINDUMP_CLEAR_DELAY_MIN_MS,
  BRAINDUMP_CLEAR_DELAY_STEP_MS,
  BRAINDUMP_FONT_FAMILIES,
  BRAINDUMP_FONT_FAMILY_CSS,
  BRAINDUMP_FONT_SIZE_MAX_PX,
  BRAINDUMP_FONT_SIZE_MIN_PX,
  BRAINDUMP_FONT_SIZE_STEP_PX,
  BRAINDUMP_TEXT_COLOR_PRESETS,
  BRAINDUMP_TOAST_DURATION_MAX_MS,
  BRAINDUMP_TOAST_DURATION_MIN_MS,
  BRAINDUMP_TOAST_DURATION_STEP_MS,
} from '@/lib/constants/braindump'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectBraindumpClearDelayMs,
  selectBraindumpClearOnComplete,
  selectBraindumpFontFamily,
  selectBraindumpFontSize,
  selectBraindumpTextColor,
  selectBraindumpToastDurationMs,
  setBraindumpClearDelayMs,
  setBraindumpClearOnComplete,
  setBraindumpFontFamily,
  setBraindumpFontSize,
  setBraindumpTextColor,
  setBraindumpToastDurationMs,
} from '@/lib/redux/slices/settingsSlice'

/** A 6-digit `#rrggbb` — the only shape a native `<input type="color">` accepts, so
 * a preset (theme `var()`) or a 3/8-digit hex can't seed the picker's swatch. */
const SIX_DIGIT_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/
/** Picker swatch shown when the active color isn't a 6-digit hex (i.e. a preset is on). */
const BRAINDUMP_CUSTOM_COLOR_FALLBACK = '#000000'

/**
 * Brain Dump editor appearance + clear-on-complete controls. Lives under the
 * Brain Dump settings section as a pure-Redux sibling of the IPC-backed note
 * card; toggling any control writes the `settings` slice directly.
 *
 * @returns The Brain Dump appearance control group.
 * @example
 * <BrainDumpAppearance />
 */
export const BrainDumpAppearance =
  function BrainDumpAppearance(): ReactElement {
    const dispatch = useAppDispatch()
    const braindumpFontFamily = useAppSelector(selectBraindumpFontFamily)
    const braindumpFontSize = useAppSelector(selectBraindumpFontSize)
    const braindumpTextColor = useAppSelector(selectBraindumpTextColor)
    const braindumpClearOnComplete = useAppSelector(
      selectBraindumpClearOnComplete,
    )
    const braindumpClearDelayMs = useAppSelector(selectBraindumpClearDelayMs)
    const braindumpToastDurationMs = useAppSelector(
      selectBraindumpToastDurationMs,
    )

    // Radix Slider wants a stable single-thumb array; rebuild only on change.
    const fontSizeSliderValue = [braindumpFontSize]
    const clearDelaySliderValue = [braindumpClearDelayMs]
    const toastDurationSliderValue = [braindumpToastDurationMs]

    // The active color is "custom" when it matches none of the themed presets —
    // then no preset radio is selected and the native picker owns the choice.
    const isCustomBraindumpColor = !BRAINDUMP_TEXT_COLOR_PRESETS.some(
      (preset) => preset.cssValue === braindumpTextColor,
    )
    // `<input type="color">` can only display a 6-digit hex; fall back to a
    // neutral swatch while a (non-hex) preset is active so the control still renders.
    const braindumpCustomColorValue = SIX_DIGIT_HEX_PATTERN.test(
      braindumpTextColor,
    )
      ? braindumpTextColor
      : BRAINDUMP_CUSTOM_COLOR_FALLBACK

    const handleBraindumpClearOnCompleteChange = (checked: boolean): void => {
      dispatch(setBraindumpClearOnComplete(checked))
    }

    const handleBraindumpFontFamilyChange = (value: string): void => {
      // RadioGroup yields a bare string; resolve it against the registry so the id
      // narrows to a BrainDumpFontFamilyId without an unsafe cast.
      const family = BRAINDUMP_FONT_FAMILIES.find((entry) => entry.id === value)
      if (!family) return
      dispatch(setBraindumpFontFamily(family.id))
    }

    const handleBraindumpFontSizeChange = (values: number[]): void => {
      // Guard the first thumb value before dispatching.
      const nextSize = values[0]
      if (typeof nextSize === 'number') {
        dispatch(setBraindumpFontSize(nextSize))
      }
    }

    const handleBraindumpClearDelayChange = (values: number[]): void => {
      // Guard the first thumb value before dispatching.
      const nextDelay = values[0]
      if (typeof nextDelay === 'number') {
        dispatch(setBraindumpClearDelayMs(nextDelay))
      }
    }

    const handleBraindumpToastDurationChange = (values: number[]): void => {
      // Guard the first thumb value before dispatching.
      const nextDuration = values[0]
      if (typeof nextDuration === 'number') {
        dispatch(setBraindumpToastDurationMs(nextDuration))
      }
    }

    const handleBraindumpTextColorPresetChange = (value: string): void => {
      // RadioGroup values ARE the preset cssValue strings, stored verbatim.
      dispatch(setBraindumpTextColor(value))
    }

    return (
      <div className="space-y-4">
        {/* Clear-on-complete — tuck a finished line away after the undo window. */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor="braindump-clear-on-complete"
              className="text-sm font-medium"
            >
              Clear finished lines
            </Label>
            <p className="text-xs text-muted-foreground">
              Once you finish a line, tuck it away after the undo moment — so
              the page clears as you go. Off keeps every line in place.
            </p>
          </div>
          <Switch
            id="braindump-clear-on-complete"
            checked={braindumpClearOnComplete}
            onCheckedChange={handleBraindumpClearOnCompleteChange}
          />
        </div>

        {/* Clear delay — how long a finished line lingers before it's tucked
           away. Only meaningful while "Clear finished lines" is on, so it's
           DISABLED (not hidden) when that's off, with a helper nudge. 0 = remove
           the instant the line completes; up to the 5 s undo window. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="braindump-clear-delay"
              className="text-sm font-medium"
            >
              Clear delay
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {braindumpClearDelayMs === 0
                ? 'Instant'
                : `${braindumpClearDelayMs} ms`}
            </span>
          </div>
          <Slider
            id="braindump-clear-delay"
            aria-label="BrainDump clear delay"
            min={BRAINDUMP_CLEAR_DELAY_MIN_MS}
            max={BRAINDUMP_CLEAR_DELAY_MAX_MS}
            step={BRAINDUMP_CLEAR_DELAY_STEP_MS}
            value={clearDelaySliderValue}
            onValueChange={handleBraindumpClearDelayChange}
            disabled={!braindumpClearOnComplete}
          />
          {/* End-labels orient the extremes; the DESIGN.md Caption tier (12px,
             medium, uppercase, 0.05em) — muted so the slider still leads. */}
          <div className="flex justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Instant</span>
            <span>Linger</span>
          </div>
          {!braindumpClearOnComplete ? (
            <p className="text-xs text-muted-foreground">
              Turn on “Clear finished lines” to use the delay.
            </p>
          ) : null}
        </div>

        {/* Confirmation duration — how long the “Completed” toast (with its Undo)
           stays before it fades. Unlike the clear delay, this ALWAYS applies
           (every completion shows the toast), so it's never disabled. The new ✕
           on the toast dismisses it sooner (#109). Readout is raw ms — the house
           convention (font-size shows raw px); the MIN of 2 s never hits a 0
           "Instant" floor, so no special label is needed. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="braindump-toast-duration"
              className="text-sm font-medium"
            >
              Confirmation duration
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {`${braindumpToastDurationMs} ms`}
            </span>
          </div>
          <Slider
            id="braindump-toast-duration"
            aria-label="BrainDump completion toast duration"
            min={BRAINDUMP_TOAST_DURATION_MIN_MS}
            max={BRAINDUMP_TOAST_DURATION_MAX_MS}
            step={BRAINDUMP_TOAST_DURATION_STEP_MS}
            value={toastDurationSliderValue}
            onValueChange={handleBraindumpToastDurationChange}
          />
          {/* End-labels orient the extremes; the DESIGN.md Caption tier (12px,
             medium, uppercase, 0.05em) — muted so the slider still leads. "Quick"
             (not "Instant" — that's the clear-delay 0-floor above) ↔ "Linger". */}
          <div className="flex justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Quick</span>
            <span>Linger</span>
          </div>
          <p className="text-xs text-muted-foreground">
            How long the “Completed” confirmation — with its Undo — stays before
            it fades. The ✕ lets it fade early.
          </p>
        </div>

        {/* Font family — the three brand fonts; each label previews its face. */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Font</span>
          <RadioGroup
            aria-label="BrainDump font family"
            value={braindumpFontFamily}
            onValueChange={handleBraindumpFontFamilyChange}
            className="grid grid-cols-3 gap-2"
          >
            {BRAINDUMP_FONT_FAMILIES.map((family) => (
              <div key={family.id} className="flex items-center gap-2">
                <RadioGroupItem
                  id={`braindump-font-${family.id}`}
                  value={family.id}
                />

                <Label
                  htmlFor={`braindump-font-${family.id}`}
                  className="text-sm font-normal"
                >
                  {/* Preview each option in its own face. Inline style sits on
                     this intrinsic span (not the Label component) — a fresh
                     object on a DOM element is free and needs no useMemo. */}
                  <span
                    style={{
                      fontFamily: BRAINDUMP_FONT_FAMILY_CSS[family.id],
                    }}
                  >
                    {family.label}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Font size — px slider; default 14 matches the prior text-sm. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="braindump-font-size"
              className="text-sm font-medium"
            >
              Font size
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {braindumpFontSize}px
            </span>
          </div>
          <Slider
            id="braindump-font-size"
            aria-label="BrainDump font size"
            min={BRAINDUMP_FONT_SIZE_MIN_PX}
            max={BRAINDUMP_FONT_SIZE_MAX_PX}
            step={BRAINDUMP_FONT_SIZE_STEP_PX}
            value={fontSizeSliderValue}
            onValueChange={handleBraindumpFontSizeChange}
          />
        </div>

        {/* Text color — theme-aware presets, or a custom color (Presets First). */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Text color</span>
          <RadioGroup
            aria-label="BrainDump text color"
            value={isCustomBraindumpColor ? '' : braindumpTextColor}
            onValueChange={handleBraindumpTextColorPresetChange}
            className="grid grid-cols-3 gap-2"
          >
            {BRAINDUMP_TEXT_COLOR_PRESETS.map((preset) => (
              <div key={preset.id} className="flex items-center gap-2">
                <RadioGroupItem
                  id={`braindump-text-color-${preset.id}`}
                  value={preset.cssValue}
                />

                <Label
                  htmlFor={`braindump-text-color-${preset.id}`}
                  className="flex items-center gap-2 text-sm font-normal"
                >
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-full border"
                    style={{ backgroundColor: preset.cssValue }}
                  />

                  {preset.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {/* Custom color — native picker; choosing one overrides the presets. */}
          <div className="flex items-center gap-2">
            <Label
              htmlFor="braindump-text-color-custom"
              className="text-sm font-normal"
            >
              Custom
            </Label>
            <input
              id="braindump-text-color-custom"
              type="color"
              aria-label="Custom BrainDump text color"
              value={braindumpCustomColorValue}
              // Inline (not useCallback) — a fresh handler on an intrinsic
              // element is free. The native picker emits a 6-digit hex; store it
              // verbatim as the (custom) color.
              onChange={(event) =>
                dispatch(setBraindumpTextColor(event.target.value))
              }
              className="h-7 w-10 cursor-pointer rounded border bg-transparent"
            />
          </div>
        </div>
      </div>
    )
  }

export default BrainDumpAppearance
