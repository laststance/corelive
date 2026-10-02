'use client'

/**
 * @fileoverview Manual app-update controls for the Electron Settings page.
 *
 * Surfaces a "Check for Updates" action when auto-update does not fire on its
 * own. The mounted Settings page polls the main process's current status;
 * update checks resolve only after the native check settles. When a download finishes, a
 * "Restart to Update" button calls `updater.quitAndInstall()`.
 *
 * @module components/electron/AppUpdateSettings
 */
import { Download, RefreshCw } from 'lucide-react'
import { useState, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type {
  UpdaterDownloadProgress,
  UpdaterStatus,
} from '@/electron/types/ipc'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { UPDATE_DOWNLOAD_PROGRESS_MAX_PERCENT } from '@/lib/constants/appUpdate'
import { log } from '@/lib/logger'
import { cn } from '@/lib/utils'

interface AppUpdateSettingsProps {
  className?: string
}

/** User-facing copy derived from main-process updater status strings. */
function formatUpdaterStatus(rawMessage: string): string {
  if (rawMessage.startsWith('Checking for update')) {
    return 'Checking for updates…'
  }

  if (rawMessage === 'Update available') {
    return 'A new version is available. Follow the prompt to download it.'
  }

  if (rawMessage === 'Update not available') {
    return "You're on the latest version."
  }

  if (rawMessage === 'Update downloaded') {
    return 'Update ready. Restart CoreLive to finish installing.'
  }

  if (rawMessage.startsWith('Downloading update:')) {
    return rawMessage.replace('Downloading update:', 'Downloading update —')
  }

  if (rawMessage === 'Error in auto-updater') {
    return "Couldn't check for updates. Try again in a moment."
  }

  if (rawMessage === 'Failed to download update') {
    return "Couldn't download the update. Try checking again."
  }

  return rawMessage
}

/**
 * Converts a normalized progress payload into the existing updater status copy.
 * @param progress - Download progress emitted by the Electron main process.
 * @returns Human-readable status text with rounded percent.
 * @example
 * formatUpdaterDownloadProgress({ percent: 41.6, bytesPerSecond: 1, transferred: 2, total: 4 }) // => "Downloading update — 42%"
 */
function formatUpdaterDownloadProgress(
  progress: UpdaterDownloadProgress,
): string {
  return formatUpdaterStatus(
    `Downloading update: ${Math.round(progress.percent)}%`,
  )
}

/**
 * Settings card for manually checking and installing desktop app updates.
 *
 * @param props - Component props
 * @param props.className - Optional className forwarded to the Card
 * @returns Update settings card, or a desktop-only fallback
 * @example
 * <AppUpdateSettings />
 */
export const AppUpdateSettings = function AppUpdateSettings({
  className,
}: AppUpdateSettingsProps): ReactElement {
  const hasMounted = useMounted()
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [manualCheckPending, setManualCheckPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus>({
    updateAvailable: false,
    updateDownloaded: false,
    downloadProgress: null,
    isChecking: false,
    message: null,
  })
  const isChecking = manualCheckPending || updaterStatus.isChecking === true
  const updateDownloaded = updaterStatus.updateDownloaded
  const downloadProgress = updateDownloaded
    ? null
    : updaterStatus.downloadProgress
  const statusMessage = isChecking
    ? formatUpdaterStatus('Checking for update...')
    : actionError
      ? actionError
      : updateDownloaded
        ? formatUpdaterStatus('Update downloaded')
        : downloadProgress
          ? formatUpdaterDownloadProgress(downloadProgress)
          : updaterStatus.message
            ? formatUpdaterStatus(updaterStatus.message)
            : null

  useCycleEffect(() => {
    const updaterApi = window.electronAPI?.updater
    const appApi = window.electronAPI?.app
    if (!updaterApi || !appApi) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    void appApi
      .getVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version)
      })
      .catch((error: unknown) => {
        log.error('Failed to load app version:', error)
      })

    // Schedule the next read after this one settles, so IPC polls never overlap.
    const refreshStatus = async () => {
      try {
        const status = await updaterApi.getStatus()
        if (!cancelled) setUpdaterStatus(status)
      } catch (error: unknown) {
        log.error('Failed to load updater status:', error)
        if (!cancelled) {
          setUpdaterStatus({
            updateAvailable: false,
            updateDownloaded: false,
            downloadProgress: null,
            isChecking: false,
            message: 'Error in auto-updater',
          })
        }
      } finally {
        if (!cancelled) timer = setTimeout(() => void refreshStatus(), 1000)
      }
    }
    void refreshStatus()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  /** Checks for an update when the Settings action runs, then reads its terminal native status.
   * @example await handleCheckForUpdates()
   */
  const handleCheckForUpdates = async (): Promise<void> => {
    const updaterApi = window.electronAPI?.updater
    if (!updaterApi) return
    setActionError(null)
    setManualCheckPending(true)
    try {
      const succeeded = await updaterApi.checkForUpdates()
      // Preload returns false on IPC failure instead of rejecting.
      if (!succeeded) throw new Error('Update check failed')
      setUpdaterStatus(await updaterApi.getStatus())
    } catch (error: unknown) {
      log.error('Failed to check for updates:', error)
      setUpdaterStatus({
        updateAvailable: false,
        updateDownloaded: false,
        downloadProgress: null,
        isChecking: false,
        message: 'Error in auto-updater',
      })
    } finally {
      setManualCheckPending(false)
    }
  }

  /**
   * Restarts the app to apply a downloaded update package.
   */
  const handleRestartToUpdate = async (): Promise<void> => {
    const updaterApi = window.electronAPI?.updater
    if (!updaterApi) return

    setActionError(null)
    try {
      if (!(await updaterApi.quitAndInstall())) {
        throw new Error('Update installation failed')
      }
    } catch (installError: unknown) {
      log.error('Failed to restart for update:', installError)
      // Keep the ready update available while reporting a failed restart attempt.
      setActionError("Couldn't restart CoreLive. Try again.")
    }
  }

  if (hasMounted && !window.electronAPI?.updater) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            App Updates
          </CardTitle>
          <CardDescription>
            Update controls are only available in the desktop application.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    // The "App Updates" card title collapsed into the Updates section <h2>
    // (design-review D1 flatten); the running-version line stays as a lead-in.
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-sm text-muted-foreground">
        {appVersion
          ? `You're running CoreLive ${appVersion}.`
          : 'Check for the latest CoreLive release.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleCheckForUpdates}
          disabled={isChecking || downloadProgress !== null}
          aria-busy={isChecking}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isChecking ? 'animate-spin' : ''}`}
            aria-hidden
          />

          {isChecking
            ? 'Checking…'
            : downloadProgress
              ? 'Downloading…'
              : 'Check for Updates'}
        </Button>

        {updateDownloaded ? (
          <Button type="button" size="sm" onClick={handleRestartToUpdate}>
            Restart to Update
          </Button>
        ) : null}
      </div>

      {statusMessage ? (
        <p
          className="text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}

      {downloadProgress ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Download progress</span>
            <span className="font-mono tabular-nums">
              {Math.round(downloadProgress.percent)}%
            </span>
          </div>
          <Progress
            value={downloadProgress.percent}
            max={UPDATE_DOWNLOAD_PROGRESS_MAX_PERCENT}
            aria-label="Update download progress"
            aria-valuenow={Math.round(downloadProgress.percent)}
          />
        </div>
      ) : null}
    </div>
  )
}
