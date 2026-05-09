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
'use client'

import { Brain, Eye, Keyboard } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

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
import { log } from '@/lib/logger'

/** Min opacity allowed by the main process. Mirrors `BRAINDUMP_OPACITY_MIN`. */
const OPACITY_MIN = 0.3
/** Max opacity allowed by the main process. */
const OPACITY_MAX = 1.0
/** Slider step (5%) — matches the granularity that's visually distinguishable. */
const OPACITY_STEP = 0.05

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
export function BrainDumpSettings({
  className,
}: BrainDumpSettingsProps): React.ReactElement {
  const syncId = useId()
  const opacityId = useId()
  const shortcutId = useId()

  const [isReady, setIsReady] = useState(false)
  const [syncMode, setSyncMode] = useState(true)
  const [opacity, setOpacity] = useState(1.0)
  const [shortcut, setShortcut] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isElectron =
    typeof window !== 'undefined' && Boolean(window.electronAPI?.brainDump)

  useEffect(() => {
    if (!isElectron) {
      setIsReady(true)
      return
    }

    const api = window.electronAPI?.brainDump
    if (!api) {
      setIsReady(true)
      return
    }

    let cancelled = false

    void Promise.all([api.getSyncMode(), api.getOpacity(), api.getShortcut()])
      .then(([sync, op, sc]) => {
        if (cancelled) return
        setSyncMode(sync)
        setOpacity(op)
        setShortcut(sc)
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
  }, [isElectron])

  const handleSyncChange = async (next: boolean): Promise<void> => {
    setSyncMode(next)
    setError(null)
    try {
      await window.electronAPI?.brainDump?.setSyncMode(next)
    } catch (err) {
      log.error('Failed to update BrainDump sync mode:', err)
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
      if (typeof applied === 'number') setOpacity(applied)
    } catch (err) {
      log.error('Failed to update BrainDump opacity:', err)
      setError('Failed to update opacity')
    }
  }

  const handleShortcutBlur = async (): Promise<void> => {
    setError(null)
    try {
      const ok = await window.electronAPI?.brainDump?.setShortcut(shortcut)
      if (ok === false) {
        setError('Shortcut could not be registered (it may already be in use).')
      }
    } catch (err) {
      log.error('Failed to update BrainDump shortcut:', err)
      setError('Failed to update shortcut')
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

  if (!isElectron) {
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

  // Display value as percentage (e.g., 0.85 → "85%")
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

        {/* Sync mode toggle */}
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

        {/* Opacity slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor={opacityId}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <Eye className="h-4 w-4" />
              Window opacity
            </Label>
            {/* eslint-disable-next-line dslint/token-only -- tabular-nums is standard Tailwind utility */}
            <span className="text-xs tabular-nums text-muted-foreground">
              {opacityPercent}%
            </span>
          </div>
          <Slider
            id={opacityId}
            min={OPACITY_MIN}
            max={OPACITY_MAX}
            step={OPACITY_STEP}
            value={[opacity]}
            onValueChange={handleOpacityChange}
            onValueCommit={handleOpacityCommit}
            aria-label="BrainDump window opacity"
          />
          <p className="text-xs text-muted-foreground">
            {Math.round(OPACITY_MIN * 100)}% is the minimum so the window stays
            discoverable.
          </p>
        </div>

        {/* Shortcut */}
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
            onChange={(event) => setShortcut(event.target.value)}
            onBlur={handleShortcutBlur}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to disable the global shortcut. Use Electron accelerator
            syntax (e.g. <code>CommandOrControl+Shift+B</code>).
          </p>
        </div>

        {/* Open / toggle button */}
        <div className="flex justify-end">
          <Button variant="outline" onClick={handleOpenBrainDump}>
            Toggle BrainDump window
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default BrainDumpSettings
