import { useRef, useState } from 'react'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { log } from '@/lib/logger'
import { runNowAndOnWindowFocus } from '@/lib/runNowAndOnWindowFocus'

/** Shown when reading the persisted value from the main process fails. */
const LOAD_FAILED_MESSAGE = 'Failed to load setting'

/**
 * The preload bridge these settings drive (reused from the electron-api source of truth).
 * `floatingPanels` is the legacy wire name — frozen preloads expose it; do not rename.
 */
export type PanelsBridge = NonNullable<
  NonNullable<Window['electronAPI']>['floatingPanels']
>

/**
 * Describes ONE panel boolean setting: its default, how to read it, how to
 * write it, and how to tell whether THIS setting's pair of methods exists on
 * the preload. `available` is per-setting (Arch-2) — an outdated preload
 * missing one setter degrades only that toggle, never the whole section. The
 * single descriptor is the source of truth a consumer passes to the hook.
 */
export interface PanelSettingConfig {
  /** Shown until the mount load resolves (mirrors the main-process default). */
  defaultValue: boolean
  /** Reads the persisted value from the main process. */
  get: (api: PanelsBridge) => Promise<boolean>
  /** Writes the new value; resolves to the value the main process actually applied. */
  set: (api: PanelsBridge, next: boolean) => Promise<boolean>
  /** True only when both `get` and `set` exist on this preload (per-method skew guard). */
  available: (api: PanelsBridge) => boolean
}

/** What a consumer renders from: the current value plus load/save/skew status. */
export interface PanelSetting {
  /** Current (optimistic) value. */
  value: boolean
  /** True once the mount-time load has resolved (or failed). */
  isReady: boolean
  /** True while a write is in flight — drives the row's disabled state. */
  isSaving: boolean
  /** Last load/save error, or null. */
  error: string | null
  /** True when this setting's methods exist on the live preload (post-mount). */
  available: boolean
  /** Optimistically apply `next`, persist it, and roll back on rejection. */
  apply: (next: boolean) => Promise<void>
}

/**
 * Manages one LiveEditor panel boolean setting (Spaces visibility or the
 * keep-on-top pin): loads it once on mount, applies optimistically with
 * rollback, and reports per-method availability so a single row can hide itself
 * on an outdated preload. Shared by the LiveEditor pin and the Application
 * "show on all desktops" toggle.
 *
 * Re-reads the confirmed native value on mount and whenever the window regains
 * focus (skipped while this control's save is in flight), and adopts the value
 * the main process confirms after each save.
 *
 * @param config - The descriptor (default + get/set/available) for this setting.
 * @returns The setting's value + status + an `apply` setter.
 * @example
 * const pin = usePanelSetting(LIVE_EDITOR_PIN_SETTING)
 * <Switch checked={pin.value} disabled={pin.isSaving} onCheckedChange={pin.apply} />
 */
export function usePanelSetting(config: PanelSettingConfig): PanelSetting {
  const hasMounted = useMounted()
  const [value, setValue] = useState(config.defaultValue)
  const [isReady, setIsReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mirrors `isSaving` for async callbacks so a focus re-read cannot overwrite an optimistic value.
  const isSavingRef = useRef(false)

  // Reload on mount and on window focus. The availability guard means web / outdated-preload
  // renderers simply never flip `isReady` and the consumer hides the row.
  // `floatingPanels` is the legacy wire name — frozen preloads expose it; do not rename.
  useCycleEffect(() => {
    const api =
      typeof window === 'undefined'
        ? undefined
        : window.electronAPI?.floatingPanels
    if (!api || !config.available(api)) return

    const load = async (isStale: () => boolean): Promise<void> =>
      config
        .get(api)
        .then((loaded) => {
          if (isStale() || isSavingRef.current) return
          setValue(loaded)
          // A recovered re-read clears only a stale load error, never a save error.
          setError((current) =>
            current === LOAD_FAILED_MESSAGE ? null : current,
          )
        })
        .catch((loadError: unknown) => {
          log.error('Failed to load panel setting:', loadError)
          if (!isStale()) setError(LOAD_FAILED_MESSAGE)
        })
        .finally(() => {
          if (!isStale()) setIsReady(true)
        })

    return runNowAndOnWindowFocus((isStale) => {
      void load(isStale)
    })
  }, [config])

  const apply = async (next: boolean): Promise<void> => {
    const api = window.electronAPI?.floatingPanels
    // The bridge can vanish (skew); do nothing rather than show an un-persisted value.
    if (!api || !config.available(api)) return

    const previous = value
    setValue(next)
    isSavingRef.current = true
    setIsSaving(true)
    setError(null)
    try {
      const applied = await config.set(api, next)
      setValue(applied)
    } catch (saveError: unknown) {
      log.error('Failed to update panel setting:', saveError)
      setValue(previous)
      setError('Failed to update setting')
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  const bridge = hasMounted
    ? typeof window === 'undefined'
      ? undefined
      : window.electronAPI?.floatingPanels
    : undefined
  const available = bridge !== undefined && config.available(bridge)

  return { value, isReady, isSaving, error, available, apply }
}
