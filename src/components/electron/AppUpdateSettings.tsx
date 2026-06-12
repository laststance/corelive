'use client'

/**
 * @fileoverview Manual app-update controls for the Electron Settings page.
 *
 * Surfaces a "Check for Updates" action when auto-update does not fire on its
 * own. Status text comes from the main-process `updater-message` IPC channel;
 * when a download finishes, a "Restart to Update" button calls
 * `updater.quitAndInstall()`.
 *
 * @module components/electron/AppUpdateSettings
 */
import { Download, RefreshCw } from 'lucide-react'
import { memo, useCallback, useState, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { UpdaterDownloadProgress } from '@/electron/types/ipc'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { UPDATE_DOWNLOAD_PROGRESS_MAX_PERCENT } from '@/lib/constants/appUpdate'
import { log } from '@/lib/logger'

interface AppUpdateSettingsProps {
  className?: string
}

/**
 * Verifies the updater progress event payload before rendering the fallback bar.
 * @param value - Unknown IPC payload from the generic Electron event bridge.
 * @returns True when value has the numeric progress fields AppUpdateSettings needs.
 * @example
 * isUpdaterDownloadProgress({ percent: 42, bytesPerSecond: 1, transferred: 2, total: 4 }) // => true
 */
function isUpdaterDownloadProgress(
  value: unknown,
): value is UpdaterDownloadProgress {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<UpdaterDownloadProgress>
  return (
    typeof candidate.percent === 'number' &&
    typeof candidate.bytesPerSecond === 'number' &&
    typeof candidate.transferred === 'number' &&
    typeof candidate.total === 'number'
  )
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
export const AppUpdateSettings = memo(function AppUpdateSettings({
  className,
}: AppUpdateSettingsProps): ReactElement {
  const hasMounted = useMounted()
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [downloadProgress, setDownloadProgress] =
    useState<UpdaterDownloadProgress | null>(null)

  useCycleEffect(() => {
    const updaterApi = window.electronAPI?.updater
    const appApi = window.electronAPI?.app

    if (!updaterApi || !appApi) return

    let cancelled = false

    void appApi
      .getVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version)
      })
      .catch((versionError: unknown) => {
        log.error('Failed to load app version:', versionError)
      })

    void updaterApi
      .getStatus()
      .then((status) => {
        if (cancelled) return
        setUpdateDownloaded(status.updateDownloaded)
        if (status.updateDownloaded) {
          setStatusMessage(formatUpdaterStatus('Update downloaded'))
          setDownloadProgress(null)
          return
        }
        if (status.downloadProgress) {
          setDownloadProgress(status.downloadProgress)
          setStatusMessage(
            formatUpdaterDownloadProgress(status.downloadProgress),
          )
          setIsChecking(true)
        }
      })
      .catch((statusError: unknown) => {
        log.error('Failed to load updater status:', statusError)
      })

    const cleanupMessage = window.electronAPI?.on(
      'updater-message',
      (message: unknown) => {
        if (typeof message !== 'string') return

        setStatusMessage(formatUpdaterStatus(message))
        setIsChecking(message.startsWith('Checking for update'))

        if (message.startsWith('Checking for update')) {
          setDownloadProgress(null)
        }

        if (message === 'Update downloaded') {
          setUpdateDownloaded(true)
          setDownloadProgress(null)
        }

        if (
          message === 'Update not available' ||
          message === 'Error in auto-updater' ||
          message === 'Failed to download update'
        ) {
          setIsChecking(false)
          setDownloadProgress(null)
        }

        if (message.startsWith('Downloading update:')) {
          setIsChecking(true)
        }

        if (message === 'Update available') {
          setIsChecking(false)
          setDownloadProgress(null)
        }
      },
    )

    const cleanupProgress = window.electronAPI?.on(
      'updater-download-progress',
      (progress: unknown) => {
        if (!isUpdaterDownloadProgress(progress)) return
        setDownloadProgress(progress)
        setStatusMessage(formatUpdaterDownloadProgress(progress))
        setIsChecking(true)
      },
    )

    return () => {
      cancelled = true
      cleanupMessage?.()
      cleanupProgress?.()
    }
  }, [])

  /**
   * Triggers a manual update check through the main-process AutoUpdater.
   */
  const handleCheckForUpdates = useCallback(async (): Promise<void> => {
    const updaterApi = window.electronAPI?.updater
    if (!updaterApi) return

    setIsChecking(true)
    setStatusMessage(formatUpdaterStatus('Checking for update...'))
    setDownloadProgress(null)

    try {
      await updaterApi.checkForUpdates()
    } catch (checkError: unknown) {
      log.error('Failed to check for updates:', checkError)
      setStatusMessage(formatUpdaterStatus('Error in auto-updater'))
      setIsChecking(false)
      setDownloadProgress(null)
    }
  }, [])

  /**
   * Restarts the app to apply a downloaded update package.
   */
  const handleRestartToUpdate = useCallback(async (): Promise<void> => {
    const updaterApi = window.electronAPI?.updater
    if (!updaterApi) return

    try {
      await updaterApi.quitAndInstall()
    } catch (installError: unknown) {
      log.error('Failed to restart for update:', installError)
      setStatusMessage(formatUpdaterStatus('Failed to download update'))
      setDownloadProgress(null)
    }
  }, [])

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
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          App Updates
        </CardTitle>
        <CardDescription>
          {appVersion
            ? `You're running CoreLive ${appVersion}.`
            : 'Check for the latest CoreLive release.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCheckForUpdates}
            disabled={isChecking}
            aria-busy={isChecking}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isChecking ? 'animate-spin' : ''}`}
              aria-hidden
            />
            {isChecking ? 'Checking…' : 'Check for Updates'}
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
      </CardContent>
    </Card>
  )
})

export default AppUpdateSettings
