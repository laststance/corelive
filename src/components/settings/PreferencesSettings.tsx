'use client'

import { memo, useCallback, useMemo } from 'react'

import { Box } from '@/components/box'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { previewTimbre } from '@/lib/audio/soundEngine'
import {
  BRAINDUMP_FONT_FAMILIES,
  BRAINDUMP_FONT_FAMILY_CSS,
  BRAINDUMP_FONT_SIZE_MAX_PX,
  BRAINDUMP_FONT_SIZE_MIN_PX,
  BRAINDUMP_FONT_SIZE_STEP_PX,
  BRAINDUMP_TEXT_COLOR_PRESETS,
} from '@/lib/constants/braindump'
import {
  SOUND_MOMENTS,
  SOUND_TIMBRE_LIST,
  type SoundMomentId,
  type SoundMomentMeta,
} from '@/lib/constants/sound'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectBraindumpClearOnComplete,
  selectBraindumpFontFamily,
  selectBraindumpFontSize,
  selectBraindumpTextColor,
  selectRetainCompletedInList,
  selectSoundMoment,
  selectSoundTimbre,
  selectSoundVolume,
  setAllSoundMoments,
  setBraindumpClearOnComplete,
  setBraindumpFontFamily,
  setBraindumpFontSize,
  setBraindumpTextColor,
  setRetainCompletedInList,
  setSoundMoment,
  setSoundTimbre,
  setSoundVolume,
} from '@/lib/redux/slices/preferencesSlice'

/** Volume slider increment (0–1 range) — fine enough to feel smooth, coarse enough to land round values. */
const SOUND_VOLUME_SLIDER_STEP = 0.05
/** Multiplier turning the 0–1 stored volume into the percentage shown beside the slider. */
const VOLUME_PERCENT_SCALE = 100
/** A 6-digit `#rrggbb` — the only shape a native `<input type="color">` accepts, so
 * a preset (theme `var()`) or a 3/8-digit hex can't seed the picker's swatch. */
const SIX_DIGIT_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/
/** Picker swatch shown when the active color isn't a 6-digit hex (i.e. a preset is on). */
const BRAINDUMP_CUSTOM_COLOR_FALLBACK = '#000000'

/**
 * One per-moment sound toggle row (label + quiet-companion description + Switch).
 * Extracted from the SOUND_MOMENTS map so each row owns a STABLE onCheckedChange
 * (a per-row useCallback over the parent's onToggle) — an inline arrow in the map
 * would hand Switch a new function every render.
 *
 * @param moment - The moment's id + display copy.
 * @param checked - Whether this moment's cue is currently enabled.
 * @param onToggle - Parent handler, called as `(momentId, nextEnabled)` on change.
 * @returns The toggle row.
 * @example
 * <SoundMomentRow moment={SOUND_MOMENTS[0]} checked onToggle={handleMomentChange} />
 */
const SoundMomentRow = memo(function SoundMomentRow({
  moment,
  checked,
  onToggle,
}: {
  moment: SoundMomentMeta
  checked: boolean
  onToggle: (momentId: SoundMomentId, enabled: boolean) => void
}) {
  const handleChange = useCallback(
    (nextEnabled: boolean): void => {
      onToggle(moment.id, nextEnabled)
    },
    [moment.id, onToggle],
  )

  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label
          htmlFor={`sound-moment-${moment.id}`}
          className="text-sm font-medium"
        >
          {moment.label}
        </Label>
        <p className="text-xs text-muted-foreground">{moment.description}</p>
      </div>
      <Switch
        id={`sound-moment-${moment.id}`}
        checked={checked}
        onCheckedChange={handleChange}
      />
    </div>
  )
})

/**
 * Web-common user preferences section (shown to everyone, web + Electron). Houses
 * the 居残りモード toggle plus the opt-in earned-beat sound palette — per-moment
 * cue toggles, a timbre picker (auditioned on selection), and a master volume —
 * the DESIGN.md-sanctioned exception to the SFX ban (default OFF, a quiet
 * companion). Distinct from the Electron window-chrome settings, which stay gated
 * to the desktop app. Writes the `preferences` Redux slice (persisted to
 * localStorage and synced across windows by the preferences sync middleware).
 *
 * @returns The Preferences settings card.
 * @example
 * <PreferencesSettings />
 */
export const PreferencesSettings = memo(function PreferencesSettings() {
  const dispatch = useAppDispatch()
  const retainCompletedInList = useAppSelector(selectRetainCompletedInList)
  // Each moment toggle is read as its own primitive boolean (not a fresh object)
  // so the panel only re-renders when a value it shows actually changes. Read at
  // the top level (fixed count) to honor the Rules of Hooks — never in the map.
  const isTaskCreateSoundOn = useAppSelector((state) =>
    selectSoundMoment(state, 'task-create'),
  )
  const isCompleteSoundOn = useAppSelector((state) =>
    selectSoundMoment(state, 'complete'),
  )
  const isClearSoundOn = useAppSelector((state) =>
    selectSoundMoment(state, 'clear'),
  )
  const soundTimbre = useAppSelector(selectSoundTimbre)
  const soundVolume = useAppSelector(selectSoundVolume)
  const braindumpFontFamily = useAppSelector(selectBraindumpFontFamily)
  const braindumpFontSize = useAppSelector(selectBraindumpFontSize)
  const braindumpTextColor = useAppSelector(selectBraindumpTextColor)
  const braindumpClearOnComplete = useAppSelector(
    selectBraindumpClearOnComplete,
  )

  // Lookup so the SOUND_MOMENTS render map (the single source of moment copy) can
  // index its checked state without per-item hook calls.
  const momentEnabledById: Record<SoundMomentId, boolean> = {
    'task-create': isTaskCreateSoundOn,
    complete: isCompleteSoundOn,
    clear: isClearSoundOn,
  }

  // The master "All cues" toggle reflects the palette only when EVERY cue is on
  // (read through the effective-state selectors, so a legacy completionSound user
  // counts as having the complete cue on). From any partial/all-off state it reads
  // OFF and one tap turns them all on; from all-on, one tap silences the palette.
  const areAllSoundMomentsOn =
    isTaskCreateSoundOn && isCompleteSoundOn && isClearSoundOn

  // Radix Slider wants a stable array; rebuild it only when the volume changes.
  const sliderValue = useMemo(() => [soundVolume], [soundVolume])
  // Same for the font-size slider — its own stable single-thumb array.
  const fontSizeSliderValue = useMemo(
    () => [braindumpFontSize],
    [braindumpFontSize],
  )
  // The active color is "custom" when it matches none of the themed presets — then
  // no preset radio is selected and the native picker owns the choice.
  const isCustomBraindumpColor = !BRAINDUMP_TEXT_COLOR_PRESETS.some(
    (preset) => preset.cssValue === braindumpTextColor,
  )
  // `<input type="color">` can only display a 6-digit hex; fall back to a neutral
  // swatch while a (non-hex) preset is active so the control still renders.
  const braindumpCustomColorValue = SIX_DIGIT_HEX_PATTERN.test(
    braindumpTextColor,
  )
    ? braindumpTextColor
    : BRAINDUMP_CUSTOM_COLOR_FALLBACK

  const handleRetainChange = useCallback(
    (checked: boolean): void => {
      dispatch(setRetainCompletedInList(checked))
    },
    [dispatch],
  )

  const handleBraindumpClearOnCompleteChange = useCallback(
    (checked: boolean): void => {
      dispatch(setBraindumpClearOnComplete(checked))
    },
    [dispatch],
  )

  const handleMomentChange = useCallback(
    (momentId: SoundMomentId, enabled: boolean): void => {
      dispatch(setSoundMoment({ moment: momentId, enabled }))
    },
    [dispatch],
  )

  const handleAllSoundMomentsChange = useCallback(
    (enabled: boolean): void => {
      dispatch(setAllSoundMoments(enabled))
    },
    [dispatch],
  )

  const handleTimbreChange = useCallback(
    (value: string): void => {
      // RadioGroup yields a bare string; resolve it against the timbre registry so
      // the id narrows to a TimbreId without an unsafe cast, then audition it.
      const timbre = SOUND_TIMBRE_LIST.find((entry) => entry.id === value)
      if (!timbre) return
      dispatch(setSoundTimbre(timbre.id))
      // Audition the pick once at the current master volume. This deliberately
      // bypasses the per-moment gate — choosing a timbre IS the user gesture, so
      // it plays even while every moment is still OFF.
      void previewTimbre(timbre.id, soundVolume)
    },
    [dispatch, soundVolume],
  )

  const handleVolumeChange = useCallback(
    (values: number[]): void => {
      // Radix reports an array (one thumb here); guard the first value before
      // dispatching so a stray empty event never writes undefined.
      const nextVolume = values[0]
      if (typeof nextVolume === 'number') {
        dispatch(setSoundVolume(nextVolume))
      }
    },
    [dispatch],
  )

  const handleBraindumpFontFamilyChange = useCallback(
    (value: string): void => {
      // RadioGroup yields a bare string; resolve it against the registry so the id
      // narrows to a BrainDumpFontFamilyId without an unsafe cast.
      const family = BRAINDUMP_FONT_FAMILIES.find((entry) => entry.id === value)
      if (!family) return
      dispatch(setBraindumpFontFamily(family.id))
    },
    [dispatch],
  )

  const handleBraindumpFontSizeChange = useCallback(
    (values: number[]): void => {
      // Guard the first thumb value (same as the volume slider) before dispatching.
      const nextSize = values[0]
      if (typeof nextSize === 'number') {
        dispatch(setBraindumpFontSize(nextSize))
      }
    },
    [dispatch],
  )

  const handleBraindumpTextColorPresetChange = useCallback(
    (value: string): void => {
      // RadioGroup values ARE the preset cssValue strings, stored verbatim.
      dispatch(setBraindumpTextColor(value))
    },
    [dispatch],
  )

  return (
    <Box className="space-y-4 p-4">
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="px-2 pb-2 pt-0">
          <CardTitle className="text-lg">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 px-2">
          {/* 居残りモード — keep checked tasks in place instead of moving them. */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="retain-completed-in-list"
                className="text-sm font-medium"
              >
                Keep finished tasks in the list
              </Label>
              <p className="text-xs text-muted-foreground">
                Checked tasks stay in place with a line through them, so you can
                watch the day add up — instead of moving to Completed.
              </p>
            </div>
            <Switch
              id="retain-completed-in-list"
              checked={retainCompletedInList}
              onCheckedChange={handleRetainChange}
            />
          </div>

          {/* Opt-in earned-beat sound palette (default OFF) — DESIGN.md SFX exception. */}
          <div className="space-y-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Sound</p>
              <p className="text-xs text-muted-foreground">
                Off by default. Pick where a soft, warm cue plays — a quiet
                companion, never a chime.
              </p>
            </div>

            {/* Master toggle — flips all three cues together. Checked only when
                every cue is on, so it never misrepresents a partial palette; a
                quiet divider sets it above the cues it governs. */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="space-y-0.5">
                <Label htmlFor="sound-all-cues" className="text-sm font-medium">
                  All cues
                </Label>
                <p className="text-xs text-muted-foreground">
                  Turn every cue on or off at once.
                </p>
              </div>
              <Switch
                id="sound-all-cues"
                checked={areAllSoundMomentsOn}
                onCheckedChange={handleAllSoundMomentsChange}
              />
            </div>

            {/* Per-moment toggles (SOUND_MOMENTS is the source of the copy). */}
            <div className="space-y-4">
              {SOUND_MOMENTS.map((moment) => (
                <SoundMomentRow
                  key={moment.id}
                  moment={moment}
                  checked={momentEnabledById[moment.id]}
                  onToggle={handleMomentChange}
                />
              ))}
            </div>

            {/* Timbre picker — selecting one auditions it at the current volume. */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Timbre</span>
              <p className="text-xs text-muted-foreground">
                Tap one to hear it.
              </p>
              <RadioGroup
                aria-label="Sound timbre"
                value={soundTimbre}
                onValueChange={handleTimbreChange}
                className="grid grid-cols-2 gap-2"
              >
                {SOUND_TIMBRE_LIST.map((timbre) => (
                  <div key={timbre.id} className="flex items-center gap-2">
                    <RadioGroupItem
                      id={`sound-timbre-${timbre.id}`}
                      value={timbre.id}
                    />
                    <Label
                      htmlFor={`sound-timbre-${timbre.id}`}
                      className="text-sm font-normal"
                    >
                      {timbre.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Master volume (0–1, stored as a fraction; shown as a percentage). */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sound-volume" className="text-sm font-medium">
                  Volume
                </Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(soundVolume * VOLUME_PERCENT_SCALE)}%
                </span>
              </div>
              <Slider
                id="sound-volume"
                aria-label="Sound volume"
                min={0}
                max={1}
                step={SOUND_VOLUME_SLIDER_STEP}
                value={sliderValue}
                onValueChange={handleVolumeChange}
              />
            </div>
          </div>

          {/* BrainDump editor behavior + text presentation (font, size, color). */}
          <div className="space-y-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">BrainDump</p>
              <p className="text-xs text-muted-foreground">
                How the BrainDump editor looks and behaves.
              </p>
            </div>

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
                  Once you finish a line, tuck it away after the undo moment —
                  so the page clears as you go. Off keeps every line in place.
                </p>
              </div>
              <Switch
                id="braindump-clear-on-complete"
                checked={braindumpClearOnComplete}
                onCheckedChange={handleBraindumpClearOnCompleteChange}
              />
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
                  // element is free. The native picker emits a 6-digit hex; store
                  // it verbatim as the (custom) color.
                  onChange={(event) =>
                    dispatch(setBraindumpTextColor(event.target.value))
                  }
                  className="h-7 w-10 cursor-pointer rounded border bg-transparent"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Box>
  )
})

export default PreferencesSettings
