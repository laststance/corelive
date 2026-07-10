import { useRef, useState } from 'react'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { log } from '@/lib/logger'

/** The preload bridge these settings drive (reused from the electron-api source of truth). */
export type FloatingPanelsBridge = NonNullable<
  NonNullable<Window['electronAPI']>['floatingPanels']
>

/**
 * Describes ONE floating-panel boolean setting: its default, how to read it,
 * how to write it, and how to tell whether THIS setting's pair of methods
 * exists on the preload. `available` is per-setting (Arch-2) — an outdated
 * preload missing one setter degrades only that toggle, never the whole section.
 * The single descriptor is the source of truth a consumer passes to the hook.
 */
export interface FloatingPanelSettingConfig {
  /** Shown until the mount load resolves (mirrors the main-process default). */
  defaultValue: boolean
  /** Reads the persisted value from the main process. */
  get: (api: FloatingPanelsBridge) => Promise<boolean>
  /** Writes the new value; resolves to the value the main process actually applied. */
  set: (api: FloatingPanelsBridge, next: boolean) => Promise<boolean>
  /** True only when both `get` and `set` exist on this preload (per-method skew guard). */
  available: (api: FloatingPanelsBridge) => boolean
}

/** What a consumer renders from: the current value plus load/save/skew status. */
export interface FloatingPanelSetting {
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
 * Manages one `floatingPanels.*` boolean setting (Spaces visibility or a
 * per-window keep-on-top pin): loads it once on mount, applies optimistically with
 * rollback, and reports per-method availability so a single row can hide itself on
 * an outdated preload. Shared by the Floating Navigator pin, the Brain Dump pin,
 * and the Application "show on all desktops" toggle — each previously duplicated in
 * the monolithic FloatingWindowSettings before the settings regroup.
 *
 * Intentionally load-once + apply-with-rollback only; §6d's cross-window pin sync
 * lives in the TARGET windows, not this Settings-side hook, so it grafts on later.
 *
 * @param config - The descriptor (default + get/set/available) for this setting.
 * @returns The setting's value + status + an `apply` setter.
 * @example
 * const pin = useFloatingPanelSetting(FLOATING_NAVIGATOR_PIN_SETTING)
 * <Switch checked={pin.value} disabled={pin.isSaving} onCheckedChange={pin.apply} />
 */
export function useFloatingPanelSetting(
  config: FloatingPanelSettingConfig,
): FloatingPanelSetting {
  const hasMounted = useMounted()
  const [value, setValue] = useState(config.defaultValue)
  const [isReady, setIsReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Last value the main process confirmed — the rollback target, so a failed
  // write never restores the in-flight optimistic value.
  const lastGoodRef = useRef(config.defaultValue)

  // Load once on mount. The availability guard means web / outdated-preload
  // renderers simply never flip `isReady` and the consumer hides the row.
  useCycleEffect(() => {
    const api =
      typeof window === 'undefined'
        ? undefined
        : window.electronAPI?.floatingPanels
    if (!api || !config.available(api)) return

    let cancelled = false

    void config
      .get(api)
      .then((loaded) => {
        if (cancelled) return
        setValue(loaded)
        lastGoodRef.current = loaded
      })
      .catch((loadError: unknown) => {
        log.error('Failed to load floating panel setting:', loadError)
        if (!cancelled) setError('Failed to load setting')
      })
      .finally(() => {
        if (!cancelled) setIsReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const apply = async (next: boolean): Promise<void> => {
    const api = window.electronAPI?.floatingPanels
    // The bridge can vanish (skew); do nothing rather than show an un-persisted value.
    if (!api || !config.available(api)) return

    const previous = value
    setValue(next)
    setIsSaving(true)
    setError(null)
    try {
      const applied = await config.set(api, next)
      setValue(applied)
      lastGoodRef.current = applied
    } catch (saveError: unknown) {
      log.error('Failed to update floating panel setting:', saveError)
      setValue(previous)
      setError('Failed to update setting')
    } finally {
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
