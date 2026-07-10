'use client'

import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import { useState } from 'react'

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
import { getNotificationSettings } from '@/lib/utils/getNotificationSettings'
import { updateNotificationSettings } from '@/lib/utils/updateNotificationSettings'

import { log } from '../../lib/logger'

interface NotificationSettingsState {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
}

/** Default notification settings for UI state */
const DEFAULT_SETTINGS: NotificationSettingsState = {
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

interface NotificationSettingSwitchProps {
  id: string
  checked: boolean
  disabled: boolean
  settingKey: keyof NotificationSettingsState
  updateSettings: (
    newSettings: Partial<NotificationSettingsState>,
  ) => Promise<void>
}

/**
 * Updates one notification setting without inline JSX handlers.
 *
 * @param props - Setting key, checked state, disabled state, and updater.
 * @returns A controlled Switch for notification settings.
 * @example
 * <NotificationSettingSwitch id="task-created" settingKey="taskCreated" checked updateSettings={updateSettings} disabled={false} />
 */
const NotificationSettingSwitch = function NotificationSettingSwitch({
  id,
  checked,
  disabled,
  settingKey,
  updateSettings,
}: NotificationSettingSwitchProps) {
  const handleCheckedChange = async (nextChecked: boolean) => {
    await updateSettings({ [settingKey]: nextChecked })
  }

  return (
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={handleCheckedChange}
      disabled={disabled}
    />
  )
}

export const NotificationSettings = function NotificationSettings({
  className,
}: NotificationSettingsProps) {
  const [settings, setSettings] = useState<NotificationSettingsState>({
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

  const loadSettings = async () => {
    if (!isElectron) return

    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      const storedSettings = await getNotificationSettings(
        window.electronAPI.notifications,
      )
      const enabled = await window.electronAPI.notifications.isEnabled()

      if (storedSettings) {
        // Transform API response to component's expected format
        setSettings({
          enabled: storedSettings.enabled,
          sound: storedSettings.sound,
          taskCreated:
            storedSettings.taskCreated ?? DEFAULT_SETTINGS.taskCreated,
          taskCompleted:
            storedSettings.taskCompleted ?? DEFAULT_SETTINGS.taskCompleted,
          taskUpdated:
            storedSettings.taskUpdated ?? DEFAULT_SETTINGS.taskUpdated,
          taskDeleted:
            storedSettings.taskDeleted ?? DEFAULT_SETTINGS.taskDeleted,
        })
      }
      setIsSupported(enabled)
    } catch (error) {
      log.error('Failed to load notification settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadActiveCount = async () => {
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
  }

  useCycleEffect(() => {
    if (!isElectron) {
      setIsLoading(false)
      return
    }

    loadSettings()
    loadActiveCount()
  }, [isElectron, loadActiveCount, loadSettings])

  const updateSettings = async (
    newSettings: Partial<NotificationSettingsState>,
  ) => {
    if (!isElectron) return

    setIsSaving(true)
    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      const updatedSettings = { ...settings, ...newSettings }
      const savedSettings = await updateNotificationSettings(
        window.electronAPI.notifications,
        updatedSettings,
      )

      if (savedSettings) {
        setSettings(updatedSettings)
      }
    } catch (error) {
      log.error('Failed to update notification settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const testNotification = async () => {
    if (!isElectron) return

    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      await window.electronAPI.notifications.show(
        'Test Notification',
        'This is a test notification from your TODO app!',
        { silent: !settings.sound },
      )
    } catch (error) {
      log.error('Failed to show test notification:', error)
    }
  }

  const clearAllNotifications = async () => {
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
  }

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
          <CardDescription>Loading notification settings...</CardDescription>
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
          <NotificationSettingSwitch
            id="notifications-enabled"
            checked={settings.enabled}
            settingKey="enabled"
            updateSettings={updateSettings}
            disabled={isSaving}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Notification types */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Notification Types</h4>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="task-created" className="text-sm">
                    Task Created
                  </Label>
                  <NotificationSettingSwitch
                    id="task-created"
                    checked={settings.taskCreated}
                    settingKey="taskCreated"
                    updateSettings={updateSettings}
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-completed" className="text-sm">
                    Task Completed
                  </Label>
                  <NotificationSettingSwitch
                    id="task-completed"
                    checked={settings.taskCompleted}
                    settingKey="taskCompleted"
                    updateSettings={updateSettings}
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-updated" className="text-sm">
                    Task Updated
                  </Label>
                  <NotificationSettingSwitch
                    id="task-updated"
                    checked={settings.taskUpdated}
                    settingKey="taskUpdated"
                    updateSettings={updateSettings}
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-deleted" className="text-sm">
                    Task Deleted
                  </Label>
                  <NotificationSettingSwitch
                    id="task-deleted"
                    checked={settings.taskDeleted}
                    settingKey="taskDeleted"
                    updateSettings={updateSettings}
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
                  {settings.sound ? (
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
              <NotificationSettingSwitch
                id="notification-sound"
                checked={settings.sound}
                settingKey="sound"
                updateSettings={updateSettings}
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
}
