'use client'

import { getLiveEditorSettingsAPI } from '@corelive/desktop-contract/client'
import { Brain, Eye, Keyboard } from 'lucide-react'
import React, { useId, useRef, useState } from 'react'

import { KeybindingCaptureInput } from '@/components/electron/KeybindingCaptureInput'
import { SettingsStateCard } from '@/components/electron/SettingsStateCard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import {
  notifyNativeWindowPreferencesChanged,
  useNativeWindowPreferencesVersion,
} from '@/hooks/useNativeWindowPreferencesVersion'
import { useShortcutCapture } from '@/hooks/useShortcutCapture'
import {
  type LiveEditorOpacity,
  LIVE_EDITOR_OPACITY_MAX,
  LIVE_EDITOR_OPACITY_MIN,
  LIVE_EDITOR_OPACITY_STEP,
} from '@/lib/constants/live-editor'
import { log } from '@/lib/logger'
import { cn } from '@/lib/utils'

/**
 * @fileoverview LiveEditor Note settings panel for the Electron Settings page.
 *
 * Surfaces the per-device LiveEditor configuration that is persisted in
 * `electron-store` (`liveEditor.*`):
 *
 * - `opacity`   — frameless window opacity, 30%–100%
 * - `shortcut`  — global accelerator (empty string disables)
 *
 * The component is rendered inside the main Electron window's Settings page,
 * so it talks to the main process via `window.electronAPI.liveEditor.*`. The
 * LiveEditor window itself uses its own preload (`window.liveEditorAPI`).
 *
 * @module components/electron/LiveEditorSettings
 */
interface LiveEditorSettingsProps {
  className?: string
  children?: (controls: {
    opacity: React.ReactNode
    shortcuts: React.ReactNode
    config: React.ReactNode
  }) => React.ReactElement
}

/**
 * LiveEditor Note settings card.
 *
 * Reads initial state from the main process on mount and pushes each change
 * back via IPC. The Settings UI updates optimistically — on IPC failure the
 * local state stays put (the main-side persistence is the source of truth, so
 * the next render after a failure stays consistent).
 *
 * @returns Settings card with the opacity slider and shortcut inputs. Renders a
 *   short fallback in non-Electron environments.
 *
 * @example
 * <LiveEditorSettings />
 */
export const LiveEditorSettings = function LiveEditorSettings({
  className,
  children,
}: LiveEditorSettingsProps): React.ReactElement {
  const preferencesVersion = useNativeWindowPreferencesVersion()
  const opacityId = useId()
  const shortcutId = useId()
  const secondaryShortcutId = useId()

  const [isReady, setIsReady] = useState(false)
  // True after the first client-side render. Until then we render the same
  // "Loading" markup the server emitted so React doesn't see a mismatch
  // between SSR (no `window`) and the first client paint (where `window` may
  // exist without `electronAPI` in non-Electron browsers). Uses
  // useSyncExternalStore under the hood for tear-free SSR semantics.
  const hasMounted = useMounted()
  const [opacity, setOpacity] = useState<LiveEditorOpacity>(1.0)
  const [errors, setErrors] = useState<
    Record<'opacity' | 'shortcuts' | 'config', string | null>
  >({ opacity: null, shortcuts: null, config: null })
  const setError = (source: keyof typeof errors, text: string | null): void => {
    setErrors((current) => ({ ...current, [source]: text }))
  }
  // Last successfully persisted opacity — a rollback target so we don't restore
  // the in-flight optimistic value (held in `opacity`) while the IPC call pends.
  const lastGoodOpacityRef = useRef<LiveEditorOpacity>(1.0)
  // Shortcut capture (optimistic set + conflict rollback) via the shared hook;
  // persists over the `liveEditor` bridge.
  const {
    shortcut,
    setLoadedShortcut,
    capture: handleShortcutCapture,
  } = useShortcutCapture({
    persist: async (accelerator) =>
      getLiveEditorSettingsAPI()?.setShortcut(accelerator) ??
      Promise.resolve(undefined),
    onError: (text) => setError('shortcuts', text),
  })
  // Second, equally-live key for the same toggle. `setShortcutSecondary` is
  // optional on the bridge (an installed app's preload is frozen while this web
  // bundle updates), so the optional call resolves `undefined` on an old preload
  // and the hook simply reverts instead of throwing.
  const {
    shortcut: secondaryShortcut,
    setLoadedShortcut: setLoadedSecondaryShortcut,
    capture: handleSecondaryShortcutCapture,
  } = useShortcutCapture({
    persist: async (accelerator) =>
      getLiveEditorSettingsAPI()?.setShortcutSecondary?.(accelerator) ??
      Promise.resolve(undefined),
    onError: (text) => setError('shortcuts', text),
  })

  // Reload native values on mount and after a save in either open window.
  // The non-Electron branch is rendered via the early-return below, so it
  // never observes `isReady`; we only flip it after the IPC fetch resolves.
  useCycleEffect(() => {
    const api =
      typeof window === 'undefined' ? undefined : getLiveEditorSettingsAPI()
    // Guard on the METHODS, not just the namespace: an outdated desktop preload
    // can expose `liveEditor` without the settings getters. A missing method
    // in this Promise.all throws synchronously inside
    // the effect and bubbles to global-error, so bail out and let the
    // fallback card render instead.
    if (
      typeof api?.getOpacity !== 'function' ||
      typeof api?.getShortcut !== 'function'
    )
      return

    let cancelled = false

    // Load failures belong beside their controls, even when another group loads successfully.
    void Promise.all([
      api
        .getOpacity()
        .then((op) => {
          if (cancelled) return
          setOpacity(op)
          lastGoodOpacityRef.current = op
        })
        .catch((loadError: unknown) => {
          log.error('Failed to load LiveEditor opacity:', loadError)
          if (!cancelled) setError('opacity', 'Failed to load window opacity')
        }),
      Promise.all([
        api.getShortcut(),
        // Older preloads lack the second slot, so keep its capture box hidden.
        api.getShortcutSecondary?.() ?? '',
      ])
        .then(([sc, secondarySc]) => {
          if (cancelled) return
          setLoadedShortcut(sc)
          setLoadedSecondaryShortcut(secondarySc)
        })
        .catch((loadError: unknown) => {
          log.error('Failed to load LiveEditor shortcuts:', loadError)
          if (!cancelled)
            setError('shortcuts', 'Failed to load toggle shortcuts')
        }),
    ]).finally(() => {
      if (!cancelled) setIsReady(true)
    })

    return (): void => {
      cancelled = true
    }
  }, [preferencesVersion])

  const handleOpacityChange = (values: number[]): void => {
    const next = values[0]
    if (next === undefined) return
    setOpacity(next)
  }

  const handleOpacityCommit = async (values: number[]): Promise<void> => {
    const next = values[0]
    if (next === undefined) return
    setError('opacity', null)
    try {
      const applied = await getLiveEditorSettingsAPI()?.setOpacity(next)
      const persisted = typeof applied === 'number' ? applied : next
      setOpacity(persisted)
      lastGoodOpacityRef.current = persisted
      notifyNativeWindowPreferencesChanged()
    } catch (err) {
      log.error('Failed to update LiveEditor opacity:', err)
      // Roll back to the last value the main process confirmed, not the
      // in-flight optimistic value held in `opacity` state.
      setOpacity(lastGoodOpacityRef.current)
      setError('opacity', 'Failed to update opacity')
    }
  }

  const handleOpenConfigFile = async (): Promise<void> => {
    setError('config', null)
    try {
      const opened = await window.electronAPI?.config?.open()
      if (!opened) {
        setError('config', 'Failed to open config file')
      }
    } catch (err) {
      log.error('Failed to open config file:', err)
      setError('config', 'Failed to open config file')
    }
  }

  const opacityValue = [opacity]

  const renderUnavailable = (message: React.ReactNode): React.ReactElement =>
    children ? (
      children({ opacity: message, shortcuts: null, config: null })
    ) : (
      <>{message}</>
    )

  // Defer the non-Electron fallback until after hydration so server and
  // first client render produce the same markup. Until `hasMounted` is
  // true we keep rendering the "Loading" branch below.
  if (hasMounted && !getLiveEditorSettingsAPI()) {
    return renderUnavailable(
      <SettingsStateCard
        icon={Brain}
        title="LiveEditor Note"
        description="LiveEditor Note is only available in the desktop application."
        className={className}
      />,
    )
  }

  // Outdated desktop app: the `liveEditor` bridge exists but predates the settings
  // getters. Invite an update instead of crashing the page.
  if (
    hasMounted &&
    (typeof getLiveEditorSettingsAPI()?.getOpacity !== 'function' ||
      typeof getLiveEditorSettingsAPI()?.getShortcut !== 'function')
  ) {
    return renderUnavailable(
      <SettingsStateCard
        icon={Brain}
        title="LiveEditor Note"
        description="Update CoreLive to the latest version to manage LiveEditor Note."
        className={className}
      />,
    )
  }

  if (!isReady) {
    return renderUnavailable(
      <SettingsStateCard
        icon={Brain}
        title="LiveEditor Note"
        description="Loading LiveEditor settings…"
        className={className}
      />,
    )
  }

  const opacityPercent = Math.round(opacity * 100)
  // Second-slot support arrived after the first three getters, so an installed
  // app running an older preload gets the single box it can actually persist.
  const canBindSecondShortcut =
    typeof getLiveEditorSettingsAPI()?.setShortcutSecondary === 'function'
  const errorFor = (source: keyof typeof errors): React.ReactNode =>
    errors[source] && (
      <p role="alert" className="type-small text-destructive">
        {errors[source]}
      </p>
    )

  const controls = {
    opacity: (
      <div className="space-y-6">
        {errorFor('opacity')}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Label
              htmlFor={opacityId}
              className="settings-label flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              Window opacity
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {opacityPercent}%
            </span>
          </div>
          <Slider
            id={opacityId}
            min={LIVE_EDITOR_OPACITY_MIN}
            max={LIVE_EDITOR_OPACITY_MAX}
            step={LIVE_EDITOR_OPACITY_STEP}
            value={opacityValue}
            onValueChange={handleOpacityChange}
            onValueCommit={handleOpacityCommit}
            aria-label="LiveEditor window opacity"
            aria-describedby={`${opacityId}-description`}
          />

          <p
            id={`${opacityId}-description`}
            className="type-small leading-5 text-muted-foreground"
          >
            {Math.round(LIVE_EDITOR_OPACITY_MIN * 100)}% is the minimum so the
            window stays discoverable.
          </p>
        </div>
      </div>
    ),
    shortcuts: (
      <div className="space-y-6">
        {errorFor('shortcuts')}
        <div className="space-y-2">
          <Label
            htmlFor={shortcutId}
            className="settings-label flex items-center gap-2"
          >
            <Keyboard className="h-4 w-4" />
            Toggle shortcut
          </Label>
          <KeybindingCaptureInput
            id={shortcutId}
            value={shortcut}
            ariaLabel="Toggle shortcut"
            ariaDescribedBy={`${shortcutId}-description`}
            onChange={handleShortcutCapture}
          />

          <p
            id={`${shortcutId}-description`}
            className="type-small leading-5 text-muted-foreground"
          >
            Click, then press the keys you want. Esc cancels; Backspace clears
            it to disable the global shortcut.
          </p>
        </div>

        {canBindSecondShortcut && (
          <div className="space-y-2">
            <Label
              htmlFor={secondaryShortcutId}
              className="settings-label flex items-center gap-2"
            >
              <Keyboard className="h-4 w-4" />
              Second toggle shortcut
            </Label>
            <KeybindingCaptureInput
              id={secondaryShortcutId}
              value={secondaryShortcut}
              ariaLabel="Second toggle shortcut"
              ariaDescribedBy={`${secondaryShortcutId}-description`}
              onChange={handleSecondaryShortcutCapture}
            />

            <p
              id={`${secondaryShortcutId}-description`}
              className="type-small leading-5 text-muted-foreground"
            >
              Optional — another key that opens the same LiveEditor. It has to
              differ from the one above.
            </p>
          </div>
        )}
      </div>
    ),
    config: (
      <div className="space-y-2">
        {errorFor('config')}
        <div className="settings-action-row flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="settings-label">Open config file</p>
            <p className="type-small leading-5 text-muted-foreground">
              Open native window and shortcut preferences on this Mac.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleOpenConfigFile}>
            Open config.json
          </Button>
        </div>
      </div>
    ),
  }
  return children ? (
    children(controls)
  ) : (
    <div className={cn('space-y-6', className)}>
      {controls.opacity}
      {controls.shortcuts}
      {controls.config}
    </div>
  )
}
