'use client'

import { Brain, Eye, Keyboard } from 'lucide-react'
import React, {
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useMounted } from '@/hooks/use-mounted'
import { useComponentEffect } from '@/hooks/useComponentEffect'
import {
  type BrainDumpOpacity,
  type BrainDumpShortcut,
  type BrainDumpSyncMode,
  BRAINDUMP_OPACITY_MAX,
  BRAINDUMP_OPACITY_MIN,
  BRAINDUMP_OPACITY_STEP,
} from '@/lib/constants/braindump'
import { log } from '@/lib/logger'

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
export const BrainDumpSettings = memo(function BrainDumpSettings({
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
  const [shortcut, setShortcut] = useState<BrainDumpShortcut>('')
  const [error, setError] = useState<string | null>(null)
  // Last successfully persisted values — used as rollback targets so we
  // don't restore the in-flight optimistic value (which is what local
  // `opacity`/`shortcut` state holds while the IPC call is pending).
  const lastGoodOpacityRef = useRef<BrainDumpOpacity>(1.0)
  const lastGoodShortcutRef = useRef<BrainDumpShortcut>('')

  // Compute inside the effect so the dependency array stays stable across
  // renders and the env check runs only once on mount.
  // The non-Electron branch is rendered via the early-return below, so it
  // never observes `isReady`; we only flip it after the IPC fetch resolves.
  useComponentEffect(() => {
    const api =
      typeof window === 'undefined' ? undefined : window.electronAPI?.brainDump
    if (!api) return

    let cancelled = false

    void Promise.all([api.getSyncMode(), api.getOpacity(), api.getShortcut()])
      .then(([sync, op, sc]) => {
        if (cancelled) return
        setSyncMode(sync)
        setOpacity(op)
        setShortcut(sc)
        lastGoodOpacityRef.current = op
        lastGoodShortcutRef.current = sc
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

  const handleSyncChange = useCallback(
    async (next: BrainDumpSyncMode): Promise<void> => {
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
    },
    [syncMode],
  )

  const handleOpacityChange = useCallback((values: number[]): void => {
    const next = values[0]
    if (next === undefined) return
    setOpacity(next)
  }, [])

  const handleOpacityCommit = useCallback(
    async (values: number[]): Promise<void> => {
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
    },
    [],
  )

  const handleShortcutBlur = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const ok = await window.electronAPI?.brainDump?.setShortcut(shortcut)
      if (ok === false) {
        setError('Shortcut could not be registered (it may already be in use).')
        setShortcut(lastGoodShortcutRef.current)
        return
      }
      lastGoodShortcutRef.current = shortcut
    } catch (err) {
      log.error('Failed to update BrainDump shortcut:', err)
      setShortcut(lastGoodShortcutRef.current)
      setError('Failed to update shortcut')
    }
  }, [shortcut])

  const handleOpenBrainDump = useCallback(async (): Promise<void> => {
    try {
      await window.electronAPI?.brainDump?.toggle()
    } catch (err) {
      log.error('Failed to toggle BrainDump window:', err)
      setError('Failed to toggle BrainDump window')
    }
  }, [])

  const handleShortcutChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setShortcut(event.target.value)
    },
    [],
  )
  const opacityValue = useMemo(() => [opacity], [opacity])

  // Defer the non-Electron fallback until after hydration so server and
  // first client render produce the same markup. Until `hasMounted` is
  // true we keep rendering the "Loading" branch below.
  if (hasMounted && !window.electronAPI?.brainDump) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            BrainDump Note
          </CardTitle>
          <CardDescription>
            BrainDump Note is only available in the desktop application.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!isReady) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            BrainDump Note
          </CardTitle>
          <CardDescription>Loading BrainDump settings…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const opacityPercent = Math.round(opacity * 100)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          BrainDump Note
        </CardTitle>
        <CardDescription>
          A frameless, always-on-top scratchpad for the active category. Checked
          items become Completed entries with a 5-second undo window.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          <Input
            id={shortcutId}
            value={shortcut}
            placeholder="e.g. CommandOrControl+Shift+B"
            onChange={handleShortcutChange}
            onBlur={handleShortcutBlur}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to disable the global shortcut. Use Electron accelerator
            syntax (e.g. <code>CommandOrControl+Shift+B</code>).
          </p>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={handleOpenBrainDump}>
            Toggle BrainDump window
          </Button>
        </div>
      </CardContent>
    </Card>
  )
})

export default BrainDumpSettings
