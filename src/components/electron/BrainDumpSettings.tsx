'use client'

import { Brain, Eye, Keyboard } from 'lucide-react'
import React, { useId, useRef, useState } from 'react'

import { KeybindingCaptureInput } from '@/components/electron/KeybindingCaptureInput'
import { SettingsStateCard } from '@/components/electron/SettingsStateCard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { useShortcutCapture } from '@/hooks/useShortcutCapture'
import {
  type BrainDumpOpacity,
  type BrainDumpSyncMode,
  BRAINDUMP_OPACITY_MAX,
  BRAINDUMP_OPACITY_MIN,
  BRAINDUMP_OPACITY_STEP,
} from '@/lib/constants/braindump'
import { log } from '@/lib/logger'
import { cn } from '@/lib/utils'

/**
 * @fileoverview BrainDump Note settings panel for the Electron Settings page.
 *
 * Surfaces the per-device BrainDump configuration that is persisted in
 * `electron-store` (`braindump.*`):
 *
 * - `syncMode`  — when on, BrainDump follows the FloatingNavigator category
 * - `opacity`   — frameless window opacity, 30%–100%
 * - `shortcut`  — global accelerator (empty string disables)
 *
 * The component is rendered inside the main Electron window's Settings page,
 * so it talks to the main process via `window.electronAPI.brainDump.*`. The
 * BrainDump window itself uses its own preload (`window.brainDumpAPI`).
 *
 * @module components/electron/BrainDumpSettings
 */
interface BrainDumpSettingsProps {
  className?: string
}

/**
 * BrainDump Note settings card.
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
 * <BrainDumpSettings />
 */
export const BrainDumpSettings = function BrainDumpSettings({
  className,
}: BrainDumpSettingsProps): React.ReactElement {
  const syncId = useId()
  const opacityId = useId()
  const shortcutId = useId()

  const [isReady, setIsReady] = useState(false)
  // True after the first client-side render. Until then we render the same
  // "Loading" markup the server emitted so React doesn't see a mismatch
  // between SSR (no `window`) and the first client paint (where `window` may
  // exist without `electronAPI` in non-Electron browsers). Uses
  // useSyncExternalStore under the hood for tear-free SSR semantics.
  const hasMounted = useMounted()
  const [syncMode, setSyncMode] = useState<BrainDumpSyncMode>(true)
  const [opacity, setOpacity] = useState<BrainDumpOpacity>(1.0)
  const [error, setError] = useState<string | null>(null)
  // Last successfully persisted opacity — a rollback target so we don't restore
  // the in-flight optimistic value (held in `opacity`) while the IPC call pends.
  const lastGoodOpacityRef = useRef<BrainDumpOpacity>(1.0)
  // Shortcut capture (optimistic set + conflict rollback) shared with the
  // Floating Navigator row via the hook; persists over the `brainDump` bridge.
  const {
    shortcut,
    setLoadedShortcut,
    capture: handleShortcutCapture,
  } = useShortcutCapture({
    persist: async (accelerator) =>
      window.electronAPI?.brainDump?.setShortcut(accelerator) ??
      Promise.resolve(undefined),
    onError: setError,
  })

  // Compute inside the effect so the dependency array stays stable across
  // renders and the env check runs only once on mount.
  // The non-Electron branch is rendered via the early-return below, so it
  // never observes `isReady`; we only flip it after the IPC fetch resolves.
  useCycleEffect(() => {
    const api =
      typeof window === 'undefined' ? undefined : window.electronAPI?.brainDump
    // Guard on the METHODS, not just the namespace: an outdated desktop preload
    // can expose `brainDump` (the window toggle) without the newer settings
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

    void Promise.all([api.getSyncMode(), api.getOpacity(), api.getShortcut()])
      .then(([sync, op, sc]) => {
        if (cancelled) return
        setSyncMode(sync)
        setOpacity(op)
        setLoadedShortcut(sc)
        lastGoodOpacityRef.current = op
      })
      .catch((loadError: unknown) => {
        log.error('Failed to load BrainDump settings:', loadError)
        if (!cancelled) {
          setError('Failed to load BrainDump settings')
        }
      })
      .finally(() => {
        if (!cancelled) setIsReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSyncChange = async (next: BrainDumpSyncMode): Promise<void> => {
    const previous = syncMode
    setSyncMode(next)
    setError(null)
    try {
      await window.electronAPI?.brainDump?.setSyncMode(next)
    } catch (err) {
      log.error('Failed to update BrainDump sync mode:', err)
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
      const applied = await window.electronAPI?.brainDump?.setOpacity(next)
      const persisted = typeof applied === 'number' ? applied : next
      setOpacity(persisted)
      lastGoodOpacityRef.current = persisted
    } catch (err) {
      log.error('Failed to update BrainDump opacity:', err)
      // Roll back to the last value the main process confirmed, not the
      // in-flight optimistic value held in `opacity` state.
      setOpacity(lastGoodOpacityRef.current)
      setError('Failed to update opacity')
    }
  }

  const handleOpenBrainDump = async (): Promise<void> => {
    try {
      await window.electronAPI?.brainDump?.toggle()
    } catch (err) {
      log.error('Failed to toggle BrainDump window:', err)
      setError('Failed to toggle BrainDump window')
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
  if (hasMounted && !window.electronAPI?.brainDump) {
    return (
      <SettingsStateCard
        icon={Brain}
        title="BrainDump Note"
        description="BrainDump Note is only available in the desktop application."
        className={className}
      />
    )
  }

  // Outdated desktop app: the brainDump bridge exists but predates the settings
  // getters. Invite an update instead of crashing the page.
  if (
    hasMounted &&
    (typeof window.electronAPI?.brainDump?.getSyncMode !== 'function' ||
      typeof window.electronAPI?.brainDump?.getOpacity !== 'function' ||
      typeof window.electronAPI?.brainDump?.getShortcut !== 'function')
  ) {
    return (
      <SettingsStateCard
        icon={Brain}
        title="BrainDump Note"
        description="Update CoreLive to the latest version to manage BrainDump Note."
        className={className}
      />
    )
  }

  if (!isReady) {
    return (
      <SettingsStateCard
        icon={Brain}
        title="BrainDump Note"
        description="Loading BrainDump settings…"
        className={className}
      />
    )
  }

  const opacityPercent = Math.round(opacity * 100)

  return (
    // The "BrainDump Note" card title collapsed into the Brain Dump section
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
            When on, BrainDump always shows the same category as the floating
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
          min={BRAINDUMP_OPACITY_MIN}
          max={BRAINDUMP_OPACITY_MAX}
          step={BRAINDUMP_OPACITY_STEP}
          value={opacityValue}
          onValueChange={handleOpacityChange}
          onValueCommit={handleOpacityCommit}
          aria-label="BrainDump window opacity"
        />

        <p className="text-xs text-muted-foreground">
          {Math.round(BRAINDUMP_OPACITY_MIN * 100)}% is the minimum so the
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

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Open config file</Label>
          <p className="text-xs text-muted-foreground">
            BrainDump text is saved per category in config.json on this device.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleOpenConfigFile}>
          Open config.json
        </Button>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={handleOpenBrainDump}>
          Toggle BrainDump window
        </Button>
      </div>
    </div>
  )
}

export default BrainDumpSettings
