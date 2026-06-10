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
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { log } from '@/lib/logger'

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
        }
      })
      .catch((statusError: unknown) => {
        log.error('Failed to load updater status:', statusError)
      })

    const cleanup = window.electronAPI?.on(
      'updater-message',
      (message: unknown) => {
        if (typeof message !== 'string') return

        setStatusMessage(formatUpdaterStatus(message))
        setIsChecking(message.startsWith('Checking for update'))

        if (message === 'Update downloaded') {
          setUpdateDownloaded(true)
        }

        if (
          message === 'Update not available' ||
          message === 'Error in auto-updater' ||
          message === 'Failed to download update'
        ) {
          setIsChecking(false)
        }

        if (message.startsWith('Downloading update:')) {
          setIsChecking(true)
        }

        if (message === 'Update available') {
          setIsChecking(false)
        }
      },
    )

    return () => {
      cancelled = true
      cleanup?.()
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

    try {
      await updaterApi.checkForUpdates()
    } catch (checkError: unknown) {
      log.error('Failed to check for updates:', checkError)
      setStatusMessage(formatUpdaterStatus('Error in auto-updater'))
      setIsChecking(false)
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
      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  )
})

export default AppUpdateSettings
