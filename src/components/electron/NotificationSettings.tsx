'use client'

import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import { useState, useEffect } from 'react'

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

interface NotificationPreferences {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
}

interface NotificationSettingsProps {
  className?: string
}

export function NotificationSettings({ className }: NotificationSettingsProps) {
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

  useEffect(() => {
    if (!isElectron) {
      setIsLoading(false)
      return
    }

    loadPreferences()
    loadActiveCount()
  }, [isElectron])

  const loadPreferences = async () => {
    if (!isElectron) return

    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      const prefs = await window.electronAPI.notifications.getPreferences()
      const enabled = await window.electronAPI.notifications.isEnabled()

      if (prefs) {
        setPreferences(prefs)
      }
      setIsSupported(enabled)
    } catch (error) {
      console.error('Failed to load notification preferences:', error)
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
      console.error('Failed to load active notification count:', error)
    }
  }

  const updatePreferences = async (
    newPreferences: Partial<NotificationPreferences>,
  ) => {
    if (!isElectron) return

    setIsSaving(true)
    try {
      if (!window.electronAPI?.notifications) {
        throw new Error('Electron API not available')
      }
      const updatedPrefs = { ...preferences, ...newPreferences }
      const result =
        await window.electronAPI.notifications.updatePreferences(updatedPrefs)

      if (result) {
        setPreferences(result)
      }
    } catch (error) {
      console.error('Failed to update notification preferences:', error)
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
        { silent: !preferences.sound },
      )
    } catch (error) {
      console.error('Failed to show test notification:', error)
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
      console.error('Failed to clear notifications:', error)
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
            <div className="text-muted-foreground text-sm">
              Turn on desktop notifications for task updates
            </div>
          </div>
          <Switch
            id="notifications-enabled"
            checked={preferences.enabled}
            onCheckedChange={async (checked) =>
              updatePreferences({ enabled: checked })
            }
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
                  <Switch
                    id="task-created"
                    checked={preferences.taskCreated}
                    onCheckedChange={async (checked) =>
                      updatePreferences({ taskCreated: checked })
                    }
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-completed" className="text-sm">
                    Task Completed
                  </Label>
                  <Switch
                    id="task-completed"
                    checked={preferences.taskCompleted}
                    onCheckedChange={async (checked) =>
                      updatePreferences({ taskCompleted: checked })
                    }
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-updated" className="text-sm">
                    Task Updated
                  </Label>
                  <Switch
                    id="task-updated"
                    checked={preferences.taskUpdated}
                    onCheckedChange={async (checked) =>
                      updatePreferences({ taskUpdated: checked })
                    }
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="task-deleted" className="text-sm">
                    Task Deleted
                  </Label>
                  <Switch
                    id="task-deleted"
                    checked={preferences.taskDeleted}
                    onCheckedChange={async (checked) =>
                      updatePreferences({ taskDeleted: checked })
                    }
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
                <div className="text-muted-foreground text-sm">
                  Play sound with notifications
                </div>
              </div>
              <Switch
                id="notification-sound"
                checked={preferences.sound}
                onCheckedChange={async (checked) =>
                  updatePreferences({ sound: checked })
                }
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
