'use client'

/**
 * @fileoverview Floating utility window settings for the Electron Settings page.
 *
 * Surfaces cross-window behavior shared by Floating Navigator and BrainDump.
 * The main process owns the actual BrowserWindow calls so this component only
 * reads and writes the typed preload API.
 *
 * @module components/electron/FloatingWindowSettings
 */
import { Monitor } from 'lucide-react'
import { memo, useCallback, type ReactElement } from 'react'
import { useId, useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useMounted } from '@/hooks/use-mounted'
import { useComponentEffect } from '@/hooks/useComponentEffect'
import { log } from '@/lib/logger'

interface FloatingWindowSettingsProps {
  className?: string
}

/**
 * Settings card for Floating Navigator + BrainDump desktop behavior.
 *
 * Loads the persisted macOS Spaces preference from Electron on mount. Toggling
 * the switch persists the value and applies it to any already-open panels.
 *
 * @param props - Component props
 * @param props.className - Optional className forwarded to the Card
 * @returns Settings card or a compact desktop-app-only fallback
 * @example
 * <FloatingWindowSettings />
 */
export const FloatingWindowSettings = memo(function FloatingWindowSettings({
  className,
}: FloatingWindowSettingsProps): ReactElement {
  const desktopTrackingId = useId()
  const hasMounted = useMounted()
  const [isReady, setIsReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [visibleOnAllWorkspaces, setVisibleOnAllWorkspaces] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch once from the preload bridge after mount; the fallback branch below
  // handles non-Electron renderers without needing a separate effect path.
  useComponentEffect(() => {
    const api =
      typeof window === 'undefined'
        ? undefined
        : window.electronAPI?.floatingPanels
    // Guard on the METHOD, not just the namespace, so an outdated desktop
    // preload that exposes `floatingPanels` without getVisibleOnAllWorkspaces
    // degrades to the fallback card instead of throwing inside this effect.
    if (typeof api?.getVisibleOnAllWorkspaces !== 'function') return

    let cancelled = false

    void api
      .getVisibleOnAllWorkspaces()
      .then((enabled) => {
        if (cancelled) return
        setVisibleOnAllWorkspaces(enabled)
      })
      .catch((loadError: unknown) => {
        log.error('Failed to load floating window settings:', loadError)
        if (!cancelled) {
          setError('Failed to load floating window settings')
        }
      })
      .finally(() => {
        if (!cancelled) setIsReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Persists and applies the desktop-following switch.
   *
   * @param next - true keeps floating panels visible across macOS desktops
   * @returns Promise that resolves once the main process confirms the change
   */
  const handleVisibleOnAllWorkspacesChange = useCallback(
    async (next: boolean): Promise<void> => {
      const previous = visibleOnAllWorkspaces
      setVisibleOnAllWorkspaces(next)
      setIsSaving(true)
      setError(null)

      try {
        const api = window.electronAPI?.floatingPanels
        // If the preload bridge disappears, rollback instead of showing a saved
        // value that the main process never applied.
        if (!api) {
          throw new Error('Electron floating panels API is not available')
        }

        const applied = await api.setVisibleOnAllWorkspaces(next)
        setVisibleOnAllWorkspaces(applied)
      } catch (saveError: unknown) {
        log.error('Failed to update floating window settings:', saveError)
        setVisibleOnAllWorkspaces(previous)
        setError('Failed to update floating window settings')
      } finally {
        setIsSaving(false)
      }
    },
    [visibleOnAllWorkspaces],
  )

  if (hasMounted && !window.electronAPI?.floatingPanels) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Floating windows
          </CardTitle>
          <CardDescription>
            Floating window settings are only available in the desktop
            application.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Outdated desktop app: the floatingPanels bridge exists but predates
  // getVisibleOnAllWorkspaces. Invite an update instead of crashing the page.
  if (
    hasMounted &&
    typeof window.electronAPI?.floatingPanels?.getVisibleOnAllWorkspaces !==
      'function'
  ) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Floating windows
          </CardTitle>
          <CardDescription>
            Update CoreLive to the latest version to manage floating windows.
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
            <Monitor className="h-5 w-5" />
            Floating windows
          </CardTitle>
          <CardDescription>Loading floating window settings...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const platform =
    typeof window === 'undefined' ? undefined : window.electronEnv?.platform
  const isMac = !platform || platform === 'darwin'

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Floating windows
        </CardTitle>
        <CardDescription>
          Shared behavior for Floating Navigator and BrainDump.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-destructive/10 rounded-md p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor={desktopTrackingId} className="text-sm font-medium">
              Show on all Mac desktops
            </Label>
            <p className="text-xs text-muted-foreground">
              Keep both panels visible while switching Spaces, including
              fullscreen Spaces.
            </p>
          </div>
          <Switch
            id={desktopTrackingId}
            checked={visibleOnAllWorkspaces}
            disabled={!isMac || isSaving}
            onCheckedChange={handleVisibleOnAllWorkspacesChange}
          />
        </div>

        {!isMac && (
          <p className="text-xs text-muted-foreground">
            This option only applies on macOS.
          </p>
        )}
      </CardContent>
    </Card>
  )
})

export default FloatingWindowSettings
