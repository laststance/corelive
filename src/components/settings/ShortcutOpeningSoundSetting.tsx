'use client'

import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_SHORTCUT_OPEN_SOUND_ENABLED,
  DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
  SHORTCUT_OPEN_SOUND_ASSET_DIRECTORY,
  SHORTCUT_OPEN_SOUND_CONFIG_PATH,
  SHORTCUT_OPEN_SOUND_CUES,
  SHORTCUT_OPEN_SOUND_SELECTION_CONFIG_PATH,
  SHORTCUT_OPEN_SOUND_VOLUME_RATIO,
  isShortcutOpenSoundSelection,
  type ShortcutOpenSoundCueId,
  type ShortcutOpenSoundSelection,
} from '@/electron/constants'
import { useInitialEffect } from '@/hooks/use-initial-effect'
import { useMounted } from '@/hooks/use-mounted'
import { useUnmountEffect } from '@/hooks/use-unmount-effect'
import { log } from '@/lib/logger'

/** Stable ids connect the Electron-only shortcut cue switch to its label and description. */
const SHORTCUT_OPEN_SOUND_SWITCH_ID = 'shortcut-opening-sound'
const SHORTCUT_OPEN_SOUND_DESCRIPTION_ID = 'shortcut-opening-sound-description'
/** Stable ids connect the exact-cue picker to its label and helper copy. */
const SHORTCUT_OPEN_SOUND_SELECT_ID = 'shortcut-opening-sound-selection'
const SHORTCUT_OPEN_SOUND_SELECT_DESCRIPTION_ID =
  'shortcut-opening-sound-selection-description'
const SHORTCUT_OPEN_SOUND_CURRENT_CUE_DESCRIPTION_ID =
  'shortcut-opening-sound-current-cue-description'
/** Quiet recovery copy keeps failed IPC work visible without implying it succeeded. */
const SHORTCUT_OPEN_SOUND_LOAD_ERROR =
  'Couldn’t load the saved shortcut sound choice.'
const SHORTCUT_OPEN_SOUND_SAVE_ERROR =
  'Couldn’t save the shortcut sound choice. Try again.'
const SHORTCUT_OPEN_SOUND_PREVIEW_ERROR =
  'Couldn’t preview the shortcut sound. Try again.'
/** Visible picker copy for the default rotating palette. */
const SHORTCUT_OPEN_SOUND_SHUFFLE_LABEL = 'Shuffle all'
const SHORTCUT_OPEN_SOUND_SHUFFLE_DESCRIPTION =
  'Rotate all ten cues; shortcut playback avoids an immediate repeat.'

type ShortcutOpeningSoundSettingState = {
  errorMessage: string | null
  isEnabled: boolean
  isReady: boolean
  isSaving: boolean
  selection: ShortcutOpenSoundSelection
}

/**
 * Resolves the cue preview target from the current picker value, using a no-immediate-repeat shuffle sample for the rotating option.
 * @param selection - The saved picker value (`shuffle` or one exact cue id).
 * @param previousCueId - The last shuffle-preview cue id, used only to avoid repeating it immediately when possible.
 * @returns The cue metadata to preview, or `undefined` if the registry is unexpectedly empty.
 * @example
 * resolvePreviewCue('shuffle', 'balanced-deep-thock') // => any bundled cue except the previous one when possible
 */
function resolvePreviewCue(
  selection: ShortcutOpenSoundSelection,
  previousCueId: ShortcutOpenSoundCueId | null,
): (typeof SHORTCUT_OPEN_SOUND_CUES)[number] | undefined {
  if (selection !== DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION) {
    return SHORTCUT_OPEN_SOUND_CUES.find((cue) => cue.id === selection)
  }

  const fallbackCue = SHORTCUT_OPEN_SOUND_CUES[0]
  if (!fallbackCue) return undefined

  const availableCues =
    previousCueId === null
      ? SHORTCUT_OPEN_SOUND_CUES
      : SHORTCUT_OPEN_SOUND_CUES.filter((cue) => cue.id !== previousCueId)

  return (
    availableCues[Math.floor(Math.random() * availableCues.length)] ??
    fallbackCue
  )
}

/**
 * Builds the public renderer URL for one bundled shortcut-opening cue preview.
 * @param cueFilename - The cue filename copied under the public shortcut-opening directory.
 * @returns A stable public URL the renderer can hand to `Audio`.
 * @example
 * createShortcutOpenSoundPreviewUrl('01-balanced-deep-thock.mp3') // => '/sounds/shortcut-opening/01-balanced-deep-thock.mp3'
 */
function createShortcutOpenSoundPreviewUrl(cueFilename: string): string {
  return `/sounds/${SHORTCUT_OPEN_SOUND_ASSET_DIRECTORY}/${cueFilename}`
}

/**
 * Renders the default-on shortcut cue controls only when SoundSettings runs with the Electron config bridge.
 * @returns The Electron shortcut cue rows, or null for SSR, web, and outdated preloads.
 * @example
 * <ShortcutOpeningSoundSetting /> // => Electron-only switch + cue picker + preview button
 */
export const ShortcutOpeningSoundSetting =
  function ShortcutOpeningSoundSetting() {
    const hasMounted = useMounted()
    const previewAudioRef = useRef<HTMLAudioElement | null>(null)
    const lastShufflePreviewCueIdRef = useRef<ShortcutOpenSoundCueId | null>(
      null,
    )
    const [settingState, setSettingState] =
      useState<ShortcutOpeningSoundSettingState>({
        isEnabled: DEFAULT_SHORTCUT_OPEN_SOUND_ENABLED,
        isReady: false,
        isSaving: false,
        errorMessage: null,
        selection: DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
      })

    // Stop any in-flight preview when Settings closes or the component unmounts.
    useUnmountEffect(() => {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    })

    // Load the main-process values once; web and older preloads skip the request.
    useInitialEffect(() => {
      const configAPI =
        typeof window === 'undefined' ? undefined : window.electronAPI?.config
      if (
        typeof configAPI?.get !== 'function' ||
        typeof configAPI.set !== 'function'
      ) {
        return
      }

      let cancelled = false

      void Promise.all([
        configAPI.get(SHORTCUT_OPEN_SOUND_CONFIG_PATH),
        configAPI.get(SHORTCUT_OPEN_SOUND_SELECTION_CONFIG_PATH),
      ])
        .then(([savedEnabledValue, savedSelectionValue]) => {
          if (cancelled) return
          setSettingState((currentState) => ({
            ...currentState,
            isEnabled:
              typeof savedEnabledValue === 'boolean'
                ? savedEnabledValue
                : DEFAULT_SHORTCUT_OPEN_SOUND_ENABLED,
            selection: isShortcutOpenSoundSelection(savedSelectionValue)
              ? savedSelectionValue
              : DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
            errorMessage: null,
          }))
        })
        .catch((loadError: unknown) => {
          log.error('Failed to load shortcut opening sound setting:', loadError)
          if (cancelled) return
          setSettingState((currentState) => ({
            ...currentState,
            errorMessage: SHORTCUT_OPEN_SOUND_LOAD_ERROR,
          }))
        })
        .finally(() => {
          if (cancelled) return
          setSettingState((currentState) => ({
            ...currentState,
            isReady: true,
          }))
        })

      return () => {
        cancelled = true
      }
    })

    /**
     * Persists an opt-in/out and changes the checked state only after Electron confirms the write.
     * @param nextEnabled - The user-requested shortcut cue state.
     * @returns A promise that settles after the config bridge confirms or rejects the write.
     * @example
     * await handleShortcutOpeningSoundChange(false) // => stays checked if persistence fails
     */
    const handleShortcutOpeningSoundChange = async (
      nextEnabled: boolean,
    ): Promise<void> => {
      const configAPI =
        typeof window === 'undefined' ? undefined : window.electronAPI?.config
      if (
        settingState.isSaving ||
        typeof configAPI?.get !== 'function' ||
        typeof configAPI.set !== 'function'
      ) {
        return
      }

      setSettingState((currentState) => ({
        ...currentState,
        isSaving: true,
        errorMessage: null,
      }))

      try {
        const didSave = await configAPI.set(
          SHORTCUT_OPEN_SOUND_CONFIG_PATH,
          nextEnabled,
        )
        if (!didSave) {
          setSettingState((currentState) => ({
            ...currentState,
            isSaving: false,
            errorMessage: SHORTCUT_OPEN_SOUND_SAVE_ERROR,
          }))
          return
        }

        setSettingState((currentState) => ({
          ...currentState,
          isEnabled: nextEnabled,
          isSaving: false,
          errorMessage: null,
        }))
      } catch (saveError: unknown) {
        log.error('Failed to save shortcut opening sound setting:', saveError)
        setSettingState((currentState) => ({
          ...currentState,
          isSaving: false,
          errorMessage: SHORTCUT_OPEN_SOUND_SAVE_ERROR,
        }))
      }
    }

    /**
     * Persists the exact cue or shuffle selection and updates the picker only after Electron confirms the write.
     * @param nextSelection - The user-requested picker value.
     * @returns A promise that settles after the config bridge confirms or rejects the write.
     * @example
     * await handleShortcutOpeningSoundSelectionChange('velvet-capacitive-key') // => picker updates only if persistence succeeds
     */
    const handleShortcutOpeningSoundSelectionChange = async (
      nextSelection: string,
    ): Promise<void> => {
      const configAPI =
        typeof window === 'undefined' ? undefined : window.electronAPI?.config
      if (
        settingState.isSaving ||
        !isShortcutOpenSoundSelection(nextSelection) ||
        typeof configAPI?.get !== 'function' ||
        typeof configAPI.set !== 'function'
      ) {
        return
      }

      setSettingState((currentState) => ({
        ...currentState,
        isSaving: true,
        errorMessage: null,
      }))

      try {
        const didSave = await configAPI.set(
          SHORTCUT_OPEN_SOUND_SELECTION_CONFIG_PATH,
          nextSelection,
        )
        if (!didSave) {
          setSettingState((currentState) => ({
            ...currentState,
            isSaving: false,
            errorMessage: SHORTCUT_OPEN_SOUND_SAVE_ERROR,
          }))
          return
        }

        setSettingState((currentState) => ({
          ...currentState,
          selection: nextSelection,
          isSaving: false,
          errorMessage: null,
        }))
      } catch (saveError: unknown) {
        log.error('Failed to save shortcut opening sound selection:', saveError)
        setSettingState((currentState) => ({
          ...currentState,
          isSaving: false,
          errorMessage: SHORTCUT_OPEN_SOUND_SAVE_ERROR,
        }))
      }
    }

    /**
     * Auditions the current shortcut cue choice from the renderer so the user can compare sounds explicitly.
     * @returns A promise that resolves once the preview has been scheduled or skipped.
     * @example
     * await handlePreviewSoundClick() // => plays the current cue (or one shuffled sample) in Settings
     */
    const handlePreviewSoundClick = async (): Promise<void> => {
      if (!settingState.isReady || settingState.isSaving) return

      const cue = resolvePreviewCue(
        settingState.selection,
        lastShufflePreviewCueIdRef.current,
      )
      if (!cue) return

      setSettingState((currentState) => ({
        ...currentState,
        errorMessage: null,
      }))

      previewAudioRef.current?.pause()
      if (previewAudioRef.current) previewAudioRef.current.currentTime = 0

      const previewAudio = new Audio(
        createShortcutOpenSoundPreviewUrl(cue.filename),
      )
      previewAudio.volume = SHORTCUT_OPEN_SOUND_VOLUME_RATIO
      previewAudioRef.current = previewAudio
      if (settingState.selection === DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION) {
        lastShufflePreviewCueIdRef.current = cue.id
      }

      try {
        await previewAudio.play()
      } catch (previewError: unknown) {
        log.error('Failed to preview shortcut opening sound:', previewError)
        setSettingState((currentState) => ({
          ...currentState,
          errorMessage: SHORTCUT_OPEN_SOUND_PREVIEW_ERROR,
        }))
      }
    }

    const configAPI =
      hasMounted && typeof window !== 'undefined'
        ? window.electronAPI?.config
        : undefined
    const isAvailable =
      typeof configAPI?.get === 'function' &&
      typeof configAPI.set === 'function'
    const selectedCue =
      settingState.selection === DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION
        ? undefined
        : SHORTCUT_OPEN_SOUND_CUES.find(
            (cue) => cue.id === settingState.selection,
          )
    const selectedCueDescription =
      settingState.selection === DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION
        ? SHORTCUT_OPEN_SOUND_SHUFFLE_DESCRIPTION
        : (selectedCue?.description ?? SHORTCUT_OPEN_SOUND_SHUFFLE_DESCRIPTION)

    // Keep Electron-only configuration out of SSR and ordinary browser settings.
    if (!isAvailable) return null

    return (
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor={SHORTCUT_OPEN_SOUND_SWITCH_ID}
              className="text-sm font-medium"
            >
              Shortcut opening sound
            </Label>
            <p
              id={SHORTCUT_OPEN_SOUND_DESCRIPTION_ID}
              className="text-xs text-muted-foreground"
            >
              Play a brief keyboard cue when a shortcut opens Floating Navigator
              or Brain Dump off-screen.
            </p>
          </div>
          <Switch
            id={SHORTCUT_OPEN_SOUND_SWITCH_ID}
            aria-describedby={SHORTCUT_OPEN_SOUND_DESCRIPTION_ID}
            checked={settingState.isEnabled}
            disabled={!settingState.isReady || settingState.isSaving}
            onCheckedChange={handleShortcutOpeningSoundChange}
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor={SHORTCUT_OPEN_SOUND_SELECT_ID}
            className="text-sm font-medium"
          >
            Opening sound
          </Label>
          <p
            id={SHORTCUT_OPEN_SOUND_SELECT_DESCRIPTION_ID}
            className="text-xs text-muted-foreground"
          >
            Keep the default rotation, or pin one exact keyboard texture.
          </p>
          <div className="flex items-start gap-2">
            <Select
              value={settingState.selection}
              onValueChange={handleShortcutOpeningSoundSelectionChange}
              disabled={!settingState.isReady || settingState.isSaving}
            >
              <SelectTrigger
                id={SHORTCUT_OPEN_SOUND_SELECT_ID}
                aria-describedby={`${SHORTCUT_OPEN_SOUND_SELECT_DESCRIPTION_ID} ${SHORTCUT_OPEN_SOUND_CURRENT_CUE_DESCRIPTION_ID}`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION}>
                  {SHORTCUT_OPEN_SOUND_SHUFFLE_LABEL}
                </SelectItem>
                {SHORTCUT_OPEN_SOUND_CUES.map((cue) => (
                  <SelectItem key={cue.id} value={cue.id}>
                    {cue.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Preview sound"
              disabled={!settingState.isReady || settingState.isSaving}
              onClick={() => {
                void handlePreviewSoundClick()
              }}
            >
              Preview
            </Button>
          </div>
          <p
            id={SHORTCUT_OPEN_SOUND_CURRENT_CUE_DESCRIPTION_ID}
            className="text-xs text-muted-foreground"
          >
            {selectedCueDescription}
          </p>
        </div>

        {settingState.errorMessage ? (
          <p role="status" className="text-xs text-destructive">
            {settingState.errorMessage}
          </p>
        ) : null}
      </div>
    )
  }
