'use client'

import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import { memo, useCallback, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useCycleEffect } from '@/hooks/use-cycle-effect'

import { log } from '../../lib/logger'

interface NotificationPreferences {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
}

/** Default notification preferences for UI state */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  taskCreated: true,
  taskCompleted: true,
  taskUpdated: true,
  taskDeleted: false,
  sound: true,
}

interface NotificationSettingsProps {
  className?: string
}

interface NotificationPreferenceSwitchProps {
  id: string
  checked: boolean
  disabled: boolean
  preferenceKey: keyof NotificationPreferences
  updatePreferences: (
    newPreferences: Partial<NotificationPreferences>,
  ) => Promise<void>
}

/**
 * Updates one notification preference without inline JSX handlers.
 *
 * @param props - Preference key, checked state, disabled state, and updater.
 * @returns A controlled Switch for notification preferences.
 * @example
 * <NotificationPreferenceSwitch id="task-created" preferenceKey="taskCreated" checked updatePreferences={updatePreferences} disabled={false} />
 */
const NotificationPreferenceSwitch = memo(
  function NotificationPreferenceSwitch({
    id,
    checked,
    disabled,
    preferenceKey,
    updatePreferences,
  }: NotificationPreferenceSwitchProps) {
    const handleCheckedChange = useCallback(
      async (nextChecked: boolean) => {
        await updatePreferences({ [preferenceKey]: nextChecked })
      },
      [preferenceKey, updatePreferences],
    )

    return (
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={handleCheckedChange}
        disabled={disabled}
      />
    )
  },
)

export const NotificationSettings = memo(function NotificationSettings({
  className,
}: NotificationSettingsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    enabled: true,
    taskCreated: true,
    taskCompleted: true,
    taskUpdated: true,
    taskDeleted: false,
    sound: true,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeCount, setActiveCount] = useState(0)
  const [isSupported, setIsSupported] = useState(false)

  // Check if we're in Electron environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI

  const loadPreferences = useCallback(async () => {
    if (!isElectron) return

    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      const prefs = await window.electronAPI.notifications.getPreferences()
      const enabled = await window.electronAPI.notifications.isEnabled()

      if (prefs) {
        // Transform API response to component's expected format
        setPreferences({
          enabled: prefs.enabled,
          sound: prefs.sound,
          taskCreated: prefs.taskCreated ?? DEFAULT_PREFERENCES.taskCreated,
          taskCompleted:
            prefs.taskCompleted ?? DEFAULT_PREFERENCES.taskCompleted,
          taskUpdated: prefs.taskUpdated ?? DEFAULT_PREFERENCES.taskUpdated,
          taskDeleted: prefs.taskDeleted ?? DEFAULT_PREFERENCES.taskDeleted,
        })
      }
      setIsSupported(enabled)
    } catch (error) {
      log.error('Failed to load notification preferences:', error)
    } finally {
      setIsLoading(false)
    }
  }, [isElectron])

  const loadActiveCount = useCallback(async () => {
    if (!isElectron) return

    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      const count = await window.electronAPI.notifications.getActiveCount()
      setActiveCount(count)
    } catch (error) {
      log.error('Failed to load active notification count:', error)
    }
  }, [isElectron])

  useCycleEffect(() => {
    if (!isElectron) {
      setIsLoading(false)
      return
    }

    loadPreferences()
    loadActiveCount()
  }, [isElectron, loadActiveCount, loadPreferences])

  const updatePreferences = useCallback(
    async (newPreferences: Partial<NotificationPreferences>) => {
      if (!isElectron) return

      setIsSaving(true)
      try {
        if (!window.electronAPI?.notifications) {
          throw new Error('Electron API not available')
        }
        const updatedPrefs = { ...preferences, ...newPreferences }
        const success =
          await window.electronAPI.notifications.updatePreferences(updatedPrefs)

        if (success) {
          setPreferences(updatedPrefs)
        }
      } catch (error) {
        log.error('Failed to update notification preferences:', error)
      } finally {
        setIsSaving(false)
      }
    },
    [isElectron, preferences],
  )

  const testNotification = useCallback(async () => {
    if (!isElectron) return

    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      await window.electronAPI.notifications.show(
        'Test Notification',
        'This is a test notification from your TODO app!',
        { silent: !preferences.sound },
      )
    } catch (error) {
      log.error('Failed to show test notification:', error)
    }
  }, [isElectron, preferences.sound])

  const clearAllNotifications = useCallback(async () => {
    if (!isElectron) return

    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      await window.electronAPI.notifications.clearAll()
      setActiveCount(0)
    } catch (error) {
      log.error('Failed to clear notifications:', error)
    }
  }, [isElectron])

  if (!isElectron) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Notification settings are only available in the desktop app.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Loading notification preferences...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!isSupported) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Notifications are not supported on this system.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {activeCount} active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Configure when and how you receive desktop notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="notifications-enabled" className="text-base">
              Enable Notifications
            </Label>
            <div className="text-sm text-muted-foreground">
              Turn on desktop notifications for task updates
            </div>
          </div>
          <NotificationPreferenceSwitch
            id="notifications-enabled"
            checked={preferences.enabled}
            preferenceKey="enabled"
            updatePreferences={updatePreferences}
            disabled={isSaving}
          />
        </div>

        {preferences.enabled && (
          <>
            {/* Notification types */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Notification Types</h4>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="task-created" className="text-sm">
                    Task Created
                  </Label>
                  <NotificationPreferenceSwitch
                    id="task-created"
                    checked={preferences.taskCreated}
                    preferenceKey="taskCreated"
                    updatePreferences={updatePreferences}
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-completed" className="text-sm">
                    Task Completed
                  </Label>
                  <NotificationPreferenceSwitch
                    id="task-completed"
                    checked={preferences.taskCompleted}
                    preferenceKey="taskCompleted"
                    updatePreferences={updatePreferences}
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-updated" className="text-sm">
                    Task Updated
                  </Label>
                  <NotificationPreferenceSwitch
                    id="task-updated"
                    checked={preferences.taskUpdated}
                    preferenceKey="taskUpdated"
                    updatePreferences={updatePreferences}
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-deleted" className="text-sm">
                    Task Deleted
                  </Label>
                  <NotificationPreferenceSwitch
                    id="task-deleted"
                    checked={preferences.taskDeleted}
                    preferenceKey="taskDeleted"
                    updatePreferences={updatePreferences}
                    disabled={isSaving}
                  />
                </div>
              </div>
            </div>

            {/* Sound settings */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="notification-sound"
                  className="flex items-center gap-2 text-base"
                >
                  {preferences.sound ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                  Notification Sound
                </Label>
                <div className="text-sm text-muted-foreground">
                  Play sound with notifications
                </div>
              </div>
              <NotificationPreferenceSwitch
                id="notification-sound"
                checked={preferences.sound}
                preferenceKey="sound"
                updatePreferences={updatePreferences}
                disabled={isSaving}
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={testNotification}
                disabled={isSaving}
              >
                Test Notification
              </Button>

              {activeCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAllNotifications}
                  disabled={isSaving}
                >
                  Clear All ({activeCount})
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
})
