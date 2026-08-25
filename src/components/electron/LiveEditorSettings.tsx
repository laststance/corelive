'use client'

import { Brain, Eye, Keyboard } from 'lucide-react'
import React, { useId, useRef, useState } from 'react'

import { KeybindingCaptureInput } from '@/components/electron/KeybindingCaptureInput'
import { SettingsStateCard } from '@/components/electron/SettingsStateCard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { getLiveEditorSettingsAPI } from '@/electron/utils/electron-client'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { useShortcutCapture } from '@/hooks/useShortcutCapture'
import {
  type LiveEditorOpacity,
  type LiveEditorSyncMode,
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
 * - `syncMode`  — when on, LiveEditor follows the FloatingNavigator category
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
}

/**
 * LiveEditor Note settings card.
 *
 * Reads initial state from the main process on mount and pushes each change
 * back via IPC. The Settings UI updates optimistically — on IPC failure the
 * local state stays put (the main-side persistence is the source of truth, so
 * the next render after a failure stays consistent).
 *
 * @returns Settings card with toggle, slider, and shortcut input. Renders a
 *   short fallback in non-Electron environments.
 *
 * @example
 * <LiveEditorSettings />
 */
export const LiveEditorSettings = function LiveEditorSettings({
  className,
}: LiveEditorSettingsProps): React.ReactElement {
  const syncId = useId()
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
  const [syncMode, setSyncMode] = useState<LiveEditorSyncMode>(true)
  const [opacity, setOpacity] = useState<LiveEditorOpacity>(1.0)
  const [error, setError] = useState<string | null>(null)
  // Last successfully persisted opacity — a rollback target so we don't restore
  // the in-flight optimistic value (held in `opacity`) while the IPC call pends.
  const lastGoodOpacityRef = useRef<LiveEditorOpacity>(1.0)
  // Shortcut capture (optimistic set + conflict rollback) shared with the
  // Floating Navigator row via the hook; persists over the `liveEditor` bridge.
  const {
    shortcut,
    setLoadedShortcut,
    capture: handleShortcutCapture,
  } = useShortcutCapture({
    persist: async (accelerator) =>
      getLiveEditorSettingsAPI()?.setShortcut(accelerator) ??
      Promise.resolve(undefined),
    onError: setError,
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
    onError: setError,
  })

  // Compute inside the effect so the dependency array stays stable across
  // renders and the env check runs only once on mount.
  // The non-Electron branch is rendered via the early-return below, so it
  // never observes `isReady`; we only flip it after the IPC fetch resolves.
  useCycleEffect(() => {
    const api =
      typeof window === 'undefined' ? undefined : getLiveEditorSettingsAPI()
    // Guard on the METHODS, not just the namespace: an outdated desktop preload
    // can expose `liveEditor` (the window toggle) without the newer settings
    // getters. A missing method in this Promise.all throws synchronously inside
    // the effect and bubbles to global-error, so bail out and let the
    // fallback card render instead.
    if (
      typeof api?.getSyncMode !== 'function' ||
      typeof api?.getOpacity !== 'function' ||
      typeof api?.getShortcut !== 'function'
    )
      return

    let cancelled = false

    void Promise.all([
      api.getSyncMode(),
      api.getOpacity(),
      api.getShortcut(),
      // Newer than the three above — an older preload lacks it, so the optional
      // call yields undefined and the second box stays hidden (see the render).
      api.getShortcutSecondary?.() ?? '',
    ])
      .then(([sync, op, sc, secondarySc]) => {
        if (cancelled) return
        setSyncMode(sync)
        setOpacity(op)
        setLoadedShortcut(sc)
        setLoadedSecondaryShortcut(secondarySc)
        lastGoodOpacityRef.current = op
      })
      .catch((loadError: unknown) => {
        log.error('Failed to load LiveEditor settings:', loadError)
        if (!cancelled) {
          setError('Failed to load LiveEditor settings')
        }
      })
      .finally(() => {
        if (!cancelled) setIsReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSyncChange = async (next: LiveEditorSyncMode): Promise<void> => {
    const previous = syncMode
    setSyncMode(next)
    setError(null)
    try {
      await getLiveEditorSettingsAPI()?.setSyncMode(next)
    } catch (err) {
      log.error('Failed to update LiveEditor sync mode:', err)
      setSyncMode(previous)
      setError('Failed to update sync setting')
    }
  }

  const handleOpacityChange = (values: number[]): void => {
    const next = values[0]
    if (next === undefined) return
    setOpacity(next)
  }

  const handleOpacityCommit = async (values: number[]): Promise<void> => {
    const next = values[0]
    if (next === undefined) return
    setError(null)
    try {
      const applied = await getLiveEditorSettingsAPI()?.setOpacity(next)
      const persisted = typeof applied === 'number' ? applied : next
      setOpacity(persisted)
      lastGoodOpacityRef.current = persisted
    } catch (err) {
      log.error('Failed to update LiveEditor opacity:', err)
      // Roll back to the last value the main process confirmed, not the
      // in-flight optimistic value held in `opacity` state.
      setOpacity(lastGoodOpacityRef.current)
      setError('Failed to update opacity')
    }
  }

  const handleOpenLiveEditor = async (): Promise<void> => {
    try {
      await getLiveEditorSettingsAPI()?.toggle()
    } catch (err) {
      log.error('Failed to toggle LiveEditor window:', err)
      setError('Failed to toggle LiveEditor window')
    }
  }

  const handleOpenConfigFile = async (): Promise<void> => {
    setError(null)
    try {
      const opened = await window.electronAPI?.config?.open()
      if (!opened) {
        setError('Failed to open config file')
      }
    } catch (err) {
      log.error('Failed to open config file:', err)
      setError('Failed to open config file')
    }
  }

  const opacityValue = [opacity]

  // Defer the non-Electron fallback until after hydration so server and
  // first client render produce the same markup. Until `hasMounted` is
  // true we keep rendering the "Loading" branch below.
  if (hasMounted && !getLiveEditorSettingsAPI()) {
    return (
      <SettingsStateCard
        icon={Brain}
        title="LiveEditor Note"
        description="LiveEditor Note is only available in the desktop application."
        className={className}
      />
    )
  }

  // Outdated desktop app: the `liveEditor` bridge exists but predates the settings
  // getters. Invite an update instead of crashing the page.
  if (
    hasMounted &&
    (typeof getLiveEditorSettingsAPI()?.getSyncMode !== 'function' ||
      typeof getLiveEditorSettingsAPI()?.getOpacity !== 'function' ||
      typeof getLiveEditorSettingsAPI()?.getShortcut !== 'function')
  ) {
    return (
      <SettingsStateCard
        icon={Brain}
        title="LiveEditor Note"
        description="Update CoreLive to the latest version to manage LiveEditor Note."
        className={className}
      />
    )
  }

  if (!isReady) {
    return (
      <SettingsStateCard
        icon={Brain}
        title="LiveEditor Note"
        description="Loading LiveEditor settings…"
        className={className}
      />
    )
  }

  const opacityPercent = Math.round(opacity * 100)
  // Second-slot support arrived after the first three getters, so an installed
  // app running an older preload gets the single box it can actually persist.
  const canBindSecondShortcut =
    typeof getLiveEditorSettingsAPI()?.setShortcutSecondary === 'function'

  return (
    // The "LiveEditor Note" card title collapsed into the LiveEditor section
    // <h2> (design-review D1 flatten); the behavior copy stays as a lead-in.
    <div className={cn('space-y-6', className)}>
      <p className="text-sm text-muted-foreground">
        A frameless scratchpad for the active category. Checked items become
        Completed entries with a 5-second undo window.
      </p>
      {error && (
        <div className="bg-destructive/10 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor={syncId} className="text-sm font-medium">
            Follow Floating Navigator category
          </Label>
          <p className="text-xs text-muted-foreground">
            When on, LiveEditor always shows the same category as the floating
            navigator. Turn off to keep its own selection.
          </p>
        </div>
        <Switch
          id={syncId}
          checked={syncMode}
          onCheckedChange={handleSyncChange}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor={opacityId}
            className="flex items-center gap-2 text-sm font-medium"
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
        />

        <p className="text-xs text-muted-foreground">
          {Math.round(LIVE_EDITOR_OPACITY_MIN * 100)}% is the minimum so the
          window stays discoverable.
        </p>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor={shortcutId}
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Keyboard className="h-4 w-4" />
          Toggle shortcut
        </Label>
        <KeybindingCaptureInput
          id={shortcutId}
          value={shortcut}
          ariaLabel="Toggle shortcut"
          onChange={handleShortcutCapture}
        />

        <p className="text-xs text-muted-foreground">
          Click, then press the keys you want. Esc cancels; Backspace clears it
          to disable the global shortcut.
        </p>
      </div>

      {canBindSecondShortcut && (
        <div className="space-y-2">
          <Label
            htmlFor={secondaryShortcutId}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Keyboard className="h-4 w-4" />
            Second toggle shortcut
          </Label>
          <KeybindingCaptureInput
            id={secondaryShortcutId}
            value={secondaryShortcut}
            ariaLabel="Second toggle shortcut"
            onChange={handleSecondaryShortcutCapture}
          />

          <p className="text-xs text-muted-foreground">
            Optional — another key that opens the same LiveEditor. It has to
            differ from the one above.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Open config file</p>
          <p className="text-xs text-muted-foreground">
            LiveEditor text is saved per category in config.json on this device.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleOpenConfigFile}>
          Open config.json
        </Button>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={handleOpenLiveEditor}>
          Toggle LiveEditor window
        </Button>
      </div>
    </div>
  )
}

export default LiveEditorSettings
