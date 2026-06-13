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
  SOUND_MOMENTS,
  SOUND_TIMBRE_LIST,
  type SoundMomentId,
  type SoundMomentMeta,
} from '@/lib/constants/sound'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectRetainCompletedInList,
  selectSoundMoment,
  selectSoundTimbre,
  selectSoundVolume,
  setRetainCompletedInList,
  setSoundMoment,
  setSoundTimbre,
  setSoundVolume,
} from '@/lib/redux/slices/preferencesSlice'

/** Volume slider increment (0–1 range) — fine enough to feel smooth, coarse enough to land round values. */
const SOUND_VOLUME_SLIDER_STEP = 0.05
/** Multiplier turning the 0–1 stored volume into the percentage shown beside the slider. */
const VOLUME_PERCENT_SCALE = 100

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

  // Lookup so the SOUND_MOMENTS render map (the single source of moment copy) can
  // index its checked state without per-item hook calls.
  const momentEnabledById: Record<SoundMomentId, boolean> = {
    'task-create': isTaskCreateSoundOn,
    complete: isCompleteSoundOn,
    clear: isClearSoundOn,
  }

  // Radix Slider wants a stable array; rebuild it only when the volume changes.
  const sliderValue = useMemo(() => [soundVolume], [soundVolume])

  const handleRetainChange = useCallback(
    (checked: boolean): void => {
      dispatch(setRetainCompletedInList(checked))
    },
    [dispatch],
  )

  const handleMomentChange = useCallback(
    (momentId: SoundMomentId, enabled: boolean): void => {
      dispatch(setSoundMoment({ moment: momentId, enabled }))
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
        </CardContent>
      </Card>
    </Box>
  )
})

export default PreferencesSettings
