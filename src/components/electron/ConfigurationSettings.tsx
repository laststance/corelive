'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'


interface ElectronConfig {
  version: string
  window: {
    main: {
      width: number
      height: number
      minWidth: number
      minHeight: number
      rememberPosition: boolean
      rememberSize: boolean
      startMaximized: boolean
      centerOnStart: boolean
    }
    floating: {
      width: number
      height: number
      minWidth: number
      minHeight: number
      maxWidth: number
      alwaysOnTop: boolean
      resizable: boolean
      frame: boolean
      rememberPosition: boolean
      rememberSize: boolean
      startVisible: boolean
    }
  }
  tray: {
    enabled: boolean
    minimizeToTray: boolean
    closeToTray: boolean
    startMinimized: boolean
    showNotificationCount: boolean
    doubleClickAction: string
    rightClickAction: string
  }
  shortcuts: {
    enabled: boolean
    [key: string]: string | boolean
  }
  notifications: {
    enabled: boolean
    taskCreated: boolean
    taskCompleted: boolean
    taskUpdated: boolean
    taskDeleted: boolean
    sound: boolean
    showInTray: boolean
    autoHide: boolean
    autoHideDelay: number
    position: string
  }
  appearance: {
    theme: string
    accentColor: string
    fontSize: string
    compactMode: boolean
  }
  behavior: {
    startOnLogin: boolean
    checkForUpdates: boolean
    autoSave: boolean
    autoSaveInterval: number
    confirmOnDelete: boolean
    confirmOnQuit: boolean
  }
  advanced: {
    enableDevTools: boolean
    enableLogging: boolean
    logLevel: string
    maxLogFiles: number
    hardwareAcceleration: boolean
    experimentalFeatures: boolean
  }
}

interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export function ConfigurationSettings() {
  const [config, setConfig] = useState<ElectronConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  })
  const [hasChanges, setHasChanges] = useState(false)

  // Check if we're in Electron environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI

  useEffect(() => {
    if (isElectron) {
      loadConfiguration()
    } else {
      setLoading(false)
    }
  }, [isElectron])

  const loadConfiguration = async () => {
    try {
      setLoading(true)
      const allConfig = await window.electronAPI.config.getAll()
      setConfig(allConfig)

      // Validate configuration
      const validationResult = await window.electronAPI.config.validate()
      setValidation(validationResult)
    } catch (error) {
      console.error('Failed to load configuration:', error)
      toast.error('Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const updateConfig = (path: string, value: any) => {
    if (!config) return

    const keys = path.split('.')
    const newConfig = { ...config }
    let current: any = newConfig

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value

    setConfig(newConfig)
    setHasChanges(true)
  }

  const saveConfiguration = async () => {
    if (!config || !isElectron) return

    try {
      setSaving(true)

      // Validate before saving
      const validationResult = await window.electronAPI.config.validate()
      if (!validationResult.isValid) {
        setValidation(validationResult)
        toast.error('Configuration validation failed')
        return
      }

      // Save configuration
      const updates: Record<string, any> = {}
      const flattenConfig = (obj: any, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const path = prefix ? `${prefix}.${key}` : key
          if (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value)
          ) {
            flattenConfig(value, path)
          } else {
            updates[path] = value
          }
        }
      }

      flattenConfig(config)
      await window.electronAPI.config.update(updates)

      setHasChanges(false)
      toast.success('Configuration saved successfully')
    } catch (error) {
      console.error('Failed to save configuration:', error)
      toast.error('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const resetConfiguration = async () => {
    if (!isElectron) return

    try {
      await window.electronAPI.config.reset()
      await loadConfiguration()
      setHasChanges(false)
      toast.success('Configuration reset to defaults')
    } catch (error) {
      console.error('Failed to reset configuration:', error)
      toast.error('Failed to reset configuration')
    }
  }

  const resetSection = async (section: string) => {
    if (!isElectron) return

    try {
      await window.electronAPI.config.resetSection(section)
      await loadConfiguration()
      setHasChanges(false)
      toast.success(`${section} settings reset to defaults`)
    } catch (error) {
      console.error('Failed to reset section:', error)
      toast.error(`Failed to reset ${section} settings`)
    }
  }

  const exportConfiguration = async () => {
    if (!isElectron) return

    try {
      // In a real implementation, you'd use a file dialog
      // For now, we'll just create a backup

      // For now, we'll just create a backup
      const backupPath = await window.electronAPI.config.backup()
      if (backupPath) {
        toast.success(`Configuration exported to ${backupPath}`)
      } else {
        toast.error('Failed to export configuration')
      }
    } catch (error) {
      console.error('Failed to export configuration:', error)
      toast.error('Failed to export configuration')
    }
  }

  if (!isElectron) {
    return (
      <Alert>
        <AlertDescription>
          Configuration settings are only available in the Electron desktop
          application.
        </AlertDescription>
      </Alert>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
          <p>Loading configuration...</p>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <Alert>
        <AlertDescription>
          Failed to load configuration. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configuration Settings</h2>
          <p className="text-muted-foreground">
            Customize your desktop application preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && <Badge variant="secondary">Unsaved changes</Badge>}
          <Button
            onClick={saveConfiguration}
            disabled={saving || !hasChanges}
            className="min-w-[100px]"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Validation Errors */}
      {!validation.isValid && (
        <Alert variant="destructive">
          <AlertDescription>
            <div className="mb-2 font-medium">
              Configuration Validation Errors:
            </div>
            <ul className="list-inside list-disc space-y-1">
              {validation.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Tabs */}
      <Tabs defaultValue="window" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="window">Window</TabsTrigger>
          <TabsTrigger value="tray">System Tray</TabsTrigger>
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Window Settings */}
        <TabsContent value="window" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Main Window</CardTitle>
              <CardDescription>
                Configure the main application window behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="main-width">Width</Label>
                  <Input
                    id="main-width"
                    type="number"
                    value={config.window.main.width}
                    onChange={(e) =>
                      updateConfig(
                        'window.main.width',
                        parseInt(e.target.value, 10),
                      )
                    }
                    min={config.window.main.minWidth}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="main-height">Height</Label>
                  <Input
                    id="main-height"
                    type="number"
                    value={config.window.main.height}
                    onChange={(e) =>
                      updateConfig(
                        'window.main.height',
                        parseInt(e.target.value, 10),
                      )
                    }
                    min={config.window.main.minHeight}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="remember-position">
                    Remember window position
                  </Label>
                  <Switch
                    id="remember-position"
                    checked={config.window.main.rememberPosition}
                    onCheckedChange={(checked) =>
                      updateConfig('window.main.rememberPosition', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="remember-size">Remember window size</Label>
                  <Switch
                    id="remember-size"
                    checked={config.window.main.rememberSize}
                    onCheckedChange={(checked) =>
                      updateConfig('window.main.rememberSize', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="start-maximized">Start maximized</Label>
                  <Switch
                    id="start-maximized"
                    checked={config.window.main.startMaximized}
                    onCheckedChange={(checked) =>
                      updateConfig('window.main.startMaximized', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="center-on-start">Center on start</Label>
                  <Switch
                    id="center-on-start"
                    checked={config.window.main.centerOnStart}
                    onCheckedChange={(checked) =>
                      updateConfig('window.main.centerOnStart', checked)
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => resetSection('window')}
                  size="sm"
                >
                  Reset Window Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Floating Navigator</CardTitle>
              <CardDescription>
                Configure the floating navigator window
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="floating-width">Width</Label>
                  <Input
                    id="floating-width"
                    type="number"
                    value={config.window.floating.width}
                    onChange={(e) =>
                      updateConfig(
                        'window.floating.width',
                        parseInt(e.target.value, 10),
                      )
                    }
                    min={config.window.floating.minWidth}
                    max={config.window.floating.maxWidth}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="floating-height">Height</Label>
                  <Input
                    id="floating-height"
                    type="number"
                    value={config.window.floating.height}
                    onChange={(e) =>
                      updateConfig(
                        'window.floating.height',
                        parseInt(e.target.value, 10),
                      )
                    }
                    min={config.window.floating.minHeight}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="always-on-top">Always on top</Label>
                  <Switch
                    id="always-on-top"
                    checked={config.window.floating.alwaysOnTop}
                    onCheckedChange={(checked) =>
                      updateConfig('window.floating.alwaysOnTop', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="floating-resizable">Resizable</Label>
                  <Switch
                    id="floating-resizable"
                    checked={config.window.floating.resizable}
                    onCheckedChange={(checked) =>
                      updateConfig('window.floating.resizable', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="floating-frame">Show window frame</Label>
                  <Switch
                    id="floating-frame"
                    checked={config.window.floating.frame}
                    onCheckedChange={(checked) =>
                      updateConfig('window.floating.frame', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="start-visible">Start visible</Label>
                  <Switch
                    id="start-visible"
                    checked={config.window.floating.startVisible}
                    onCheckedChange={(checked) =>
                      updateConfig('window.floating.startVisible', checked)
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tray Settings */}
        <TabsContent value="tray" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Tray</CardTitle>
              <CardDescription>
                Configure system tray integration and behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="tray-enabled">Enable system tray</Label>
                <Switch
                  id="tray-enabled"
                  checked={config.tray.enabled}
                  onCheckedChange={(checked) =>
                    updateConfig('tray.enabled', checked)
                  }
                />
              </div>

              {config.tray.enabled && (
                <>
                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="minimize-to-tray">Minimize to tray</Label>
                      <Switch
                        id="minimize-to-tray"
                        checked={config.tray.minimizeToTray}
                        onCheckedChange={(checked) =>
                          updateConfig('tray.minimizeToTray', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="close-to-tray">Close to tray</Label>
                      <Switch
                        id="close-to-tray"
                        checked={config.tray.closeToTray}
                        onCheckedChange={(checked) =>
                          updateConfig('tray.closeToTray', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="start-minimized">Start minimized</Label>
                      <Switch
                        id="start-minimized"
                        checked={config.tray.startMinimized}
                        onCheckedChange={(checked) =>
                          updateConfig('tray.startMinimized', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="show-notification-count">
                        Show notification count
                      </Label>
                      <Switch
                        id="show-notification-count"
                        checked={config.tray.showNotificationCount}
                        onCheckedChange={(checked) =>
                          updateConfig('tray.showNotificationCount', checked)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="double-click-action">
                        Double-click action
                      </Label>
                      <Select
                        value={config.tray.doubleClickAction}
                        onValueChange={(value) =>
                          updateConfig('tray.doubleClickAction', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restore">
                            Restore window
                          </SelectItem>
                          <SelectItem value="toggle">Toggle window</SelectItem>
                          <SelectItem value="none">No action</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="right-click-action">
                        Right-click action
                      </Label>
                      <Select
                        value={config.tray.rightClickAction}
                        onValueChange={(value) =>
                          updateConfig('tray.rightClickAction', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="menu">
                            Show context menu
                          </SelectItem>
                          <SelectItem value="restore">
                            Restore window
                          </SelectItem>
                          <SelectItem value="none">No action</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => resetSection('tray')}
                  size="sm"
                >
                  Reset Tray Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shortcuts Settings */}
        <TabsContent value="shortcuts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Keyboard Shortcuts</CardTitle>
              <CardDescription>
                Configure global keyboard shortcuts for quick actions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="shortcuts-enabled">Enable shortcuts</Label>
                <Switch
                  id="shortcuts-enabled"
                  checked={config.shortcuts.enabled}
                  onCheckedChange={(checked) =>
                    updateConfig('shortcuts.enabled', checked)
                  }
                />
              </div>

              {config.shortcuts.enabled && (
                <>
                  <Separator />

                  <div className="space-y-4">
                    {Object.entries(config.shortcuts)
                      .filter(([key]) => key !== 'enabled')
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between"
                        >
                          <Label
                            htmlFor={`shortcut-${key}`}
                            className="capitalize"
                          >
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </Label>
                          <Input
                            id={`shortcut-${key}`}
                            value={value as string}
                            onChange={(e) =>
                              updateConfig(`shortcuts.${key}`, e.target.value)
                            }
                            className="w-48"
                            placeholder="e.g., Ctrl+N"
                          />
                        </div>
                      ))}
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => resetSection('shortcuts')}
                  size="sm"
                >
                  Reset Shortcuts
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Configure desktop notifications for task events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="notifications-enabled">
                  Enable notifications
                </Label>
                <Switch
                  id="notifications-enabled"
                  checked={config.notifications.enabled}
                  onCheckedChange={(checked) =>
                    updateConfig('notifications.enabled', checked)
                  }
                />
              </div>

              {config.notifications.enabled && (
                <>
                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="task-created">Task created</Label>
                      <Switch
                        id="task-created"
                        checked={config.notifications.taskCreated}
                        onCheckedChange={(checked) =>
                          updateConfig('notifications.taskCreated', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="task-completed">Task completed</Label>
                      <Switch
                        id="task-completed"
                        checked={config.notifications.taskCompleted}
                        onCheckedChange={(checked) =>
                          updateConfig('notifications.taskCompleted', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="task-updated">Task updated</Label>
                      <Switch
                        id="task-updated"
                        checked={config.notifications.taskUpdated}
                        onCheckedChange={(checked) =>
                          updateConfig('notifications.taskUpdated', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="task-deleted">Task deleted</Label>
                      <Switch
                        id="task-deleted"
                        checked={config.notifications.taskDeleted}
                        onCheckedChange={(checked) =>
                          updateConfig('notifications.taskDeleted', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="notification-sound">Play sound</Label>
                      <Switch
                        id="notification-sound"
                        checked={config.notifications.sound}
                        onCheckedChange={(checked) =>
                          updateConfig('notifications.sound', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="auto-hide">Auto-hide notifications</Label>
                      <Switch
                        id="auto-hide"
                        checked={config.notifications.autoHide}
                        onCheckedChange={(checked) =>
                          updateConfig('notifications.autoHide', checked)
                        }
                      />
                    </div>

                    {config.notifications.autoHide && (
                      <div className="space-y-2">
                        <Label htmlFor="auto-hide-delay">
                          Auto-hide delay:{' '}
                          {config.notifications.autoHideDelay / 1000}s
                        </Label>
                        <Slider
                          id="auto-hide-delay"
                          value={[config.notifications.autoHideDelay]}
                          onValueChange={([value]) =>
                            updateConfig('notifications.autoHideDelay', value)
                          }
                          min={1000}
                          max={30000}
                          step={1000}
                          className="w-full"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="notification-position">
                        Notification position
                      </Label>
                      <Select
                        value={config.notifications.position}
                        onValueChange={(value) =>
                          updateConfig('notifications.position', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="topRight">Top Right</SelectItem>
                          <SelectItem value="topLeft">Top Left</SelectItem>
                          <SelectItem value="bottomRight">
                            Bottom Right
                          </SelectItem>
                          <SelectItem value="bottomLeft">
                            Bottom Left
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => resetSection('notifications')}
                  size="sm"
                >
                  Reset Notification Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Behavior Settings */}
        <TabsContent value="behavior" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Application Behavior</CardTitle>
              <CardDescription>
                Configure general application behavior and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="start-on-login">Start on login</Label>
                <Switch
                  id="start-on-login"
                  checked={config.behavior.startOnLogin}
                  onCheckedChange={(checked) =>
                    updateConfig('behavior.startOnLogin', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="check-for-updates">Check for updates</Label>
                <Switch
                  id="check-for-updates"
                  checked={config.behavior.checkForUpdates}
                  onCheckedChange={(checked) =>
                    updateConfig('behavior.checkForUpdates', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="auto-save">Auto-save</Label>
                <Switch
                  id="auto-save"
                  checked={config.behavior.autoSave}
                  onCheckedChange={(checked) =>
                    updateConfig('behavior.autoSave', checked)
                  }
                />
              </div>

              {config.behavior.autoSave && (
                <div className="space-y-2">
                  <Label htmlFor="auto-save-interval">
                    Auto-save interval:{' '}
                    {config.behavior.autoSaveInterval / 1000}s
                  </Label>
                  <Slider
                    id="auto-save-interval"
                    value={[config.behavior.autoSaveInterval]}
                    onValueChange={([value]) =>
                      updateConfig('behavior.autoSaveInterval', value)
                    }
                    min={5000}
                    max={300000}
                    step={5000}
                    className="w-full"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label htmlFor="confirm-on-delete">Confirm on delete</Label>
                <Switch
                  id="confirm-on-delete"
                  checked={config.behavior.confirmOnDelete}
                  onCheckedChange={(checked) =>
                    updateConfig('behavior.confirmOnDelete', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="confirm-on-quit">Confirm on quit</Label>
                <Switch
                  id="confirm-on-quit"
                  checked={config.behavior.confirmOnQuit}
                  onCheckedChange={(checked) =>
                    updateConfig('behavior.confirmOnQuit', checked)
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => resetSection('behavior')}
                  size="sm"
                >
                  Reset Behavior Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>
                Advanced configuration options for power users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="enable-dev-tools">Enable developer tools</Label>
                <Switch
                  id="enable-dev-tools"
                  checked={config.advanced.enableDevTools}
                  onCheckedChange={(checked) =>
                    updateConfig('advanced.enableDevTools', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="enable-logging">Enable logging</Label>
                <Switch
                  id="enable-logging"
                  checked={config.advanced.enableLogging}
                  onCheckedChange={(checked) =>
                    updateConfig('advanced.enableLogging', checked)
                  }
                />
              </div>

              {config.advanced.enableLogging && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="log-level">Log level</Label>
                    <Select
                      value={config.advanced.logLevel}
                      onValueChange={(value) =>
                        updateConfig('advanced.logLevel', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="error">Error</SelectItem>
                        <SelectItem value="warn">Warning</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="debug">Debug</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-log-files">
                      Max log files: {config.advanced.maxLogFiles}
                    </Label>
                    <Slider
                      id="max-log-files"
                      value={[config.advanced.maxLogFiles]}
                      onValueChange={([value]) =>
                        updateConfig('advanced.maxLogFiles', value)
                      }
                      min={1}
                      max={20}
                      step={1}
                      className="w-full"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-between">
                <Label htmlFor="hardware-acceleration">
                  Hardware acceleration
                </Label>
                <Switch
                  id="hardware-acceleration"
                  checked={config.advanced.hardwareAcceleration}
                  onCheckedChange={(checked) =>
                    updateConfig('advanced.hardwareAcceleration', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="experimental-features">
                  Experimental features
                </Label>
                <Switch
                  id="experimental-features"
                  checked={config.advanced.experimentalFeatures}
                  onCheckedChange={(checked) =>
                    updateConfig('advanced.experimentalFeatures', checked)
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => resetSection('advanced')}
                  size="sm"
                >
                  Reset Advanced Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between border-t pt-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportConfiguration}>
            Export Config
          </Button>
          <Button variant="outline" onClick={resetConfiguration}>
            Reset All
          </Button>
        </div>

        <div className="text-muted-foreground text-sm">
          Configuration version: {config.version}
        </div>
      </div>
    </div>
  )
}
