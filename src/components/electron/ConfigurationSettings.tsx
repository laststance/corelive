'use client'

import React, { useCallback, useMemo, useState } from 'react'
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
import { useComponentEffect } from '@/hooks/useComponentEffect'

import type { ConfigSection } from '../../../electron/types/ipc'
import { log } from '../../lib/logger'

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

type ConfigValue = string | number | boolean
type ConfigUpdater = (path: string, value: ConfigValue) => void

interface ConfigFieldProps {
  id: string
  path: string
  updateConfig: ConfigUpdater
}

interface ConfigInputProps extends ConfigFieldProps {
  value: string
  className?: string
  placeholder?: string
}

interface ConfigNumberInputProps extends ConfigFieldProps {
  value: number
  min?: number
  max?: number
}

interface ConfigSwitchProps extends ConfigFieldProps {
  checked: boolean
}

interface ConfigSelectProps extends ConfigFieldProps {
  value: string
  children: React.ReactNode
}

interface ConfigSliderProps extends ConfigFieldProps {
  value: number
  min: number
  max: number
  step: number
}

interface ResetSectionButtonProps {
  section: ConfigSection
  label: string
  onReset: (section: ConfigSection) => Promise<void>
}

/**
 * Updates a string config value from a shadcn Input without inline JSX handlers.
 *
 * @param props - Input metadata, value, and config updater.
 * @returns A controlled Input for string config values.
 * @example
 * <ConfigInput id="shortcut" path="shortcuts.createTask" value="Cmd+N" updateConfig={updateConfig} />
 */
const ConfigInput = React.memo(function ConfigInput({
  id,
  path,
  value,
  updateConfig,
  className,
  placeholder,
}: ConfigInputProps): React.ReactNode {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateConfig(path, event.target.value)
    },
    [path, updateConfig],
  )

  return (
    <Input
      id={id}
      value={value}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
    />
  )
})

/**
 * Updates a numeric config value from a shadcn Input.
 *
 * @param props - Input metadata, numeric value bounds, and config updater.
 * @returns A controlled number Input.
 * @example
 * <ConfigNumberInput id="width" path="window.main.width" value={1024} min={480} updateConfig={updateConfig} />
 */
const ConfigNumberInput = React.memo(function ConfigNumberInput({
  id,
  path,
  value,
  updateConfig,
  min,
  max,
}: ConfigNumberInputProps): React.ReactNode {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateConfig(path, parseInt(event.target.value, 10))
    },
    [path, updateConfig],
  )

  return (
    <Input
      id={id}
      type="number"
      value={value}
      onChange={handleChange}
      min={min}
      max={max}
    />
  )
})

/**
 * Updates a boolean config value from a shadcn Switch.
 *
 * @param props - Switch metadata, checked value, and config updater.
 * @returns A controlled Switch.
 * @example
 * <ConfigSwitch id="enabled" path="tray.enabled" checked updateConfig={updateConfig} />
 */
const ConfigSwitch = React.memo(function ConfigSwitch({
  id,
  path,
  checked,
  updateConfig,
}: ConfigSwitchProps): React.ReactNode {
  const handleCheckedChange = useCallback(
    (nextChecked: boolean) => {
      updateConfig(path, nextChecked)
    },
    [path, updateConfig],
  )

  return (
    <Switch id={id} checked={checked} onCheckedChange={handleCheckedChange} />
  )
})

/**
 * Updates a string config value from a shadcn Select.
 *
 * @param props - Select value, options as children, and config updater.
 * @returns A controlled Select.
 * @example
 * <ConfigSelect path="tray.doubleClickAction" value="restore" updateConfig={updateConfig}>...</ConfigSelect>
 */
const ConfigSelect = React.memo(function ConfigSelect({
  id,
  path,
  value,
  updateConfig,
  children,
}: ConfigSelectProps): React.ReactNode {
  const handleValueChange = useCallback(
    (nextValue: string) => {
      updateConfig(path, nextValue)
    },
    [path, updateConfig],
  )

  return (
    <Select value={value} onValueChange={handleValueChange}>
      {React.Children.map(children, (child): React.ReactNode => {
        if (
          React.isValidElement<{ id?: string }>(child) &&
          child.type === SelectTrigger
        ) {
          return React.cloneElement(child, { id })
        }

        return child
      })}
    </Select>
  )
})

/**
 * Updates a numeric config value from a shadcn Slider.
 *
 * @param props - Slider metadata, numeric bounds, and config updater.
 * @returns A controlled Slider.
 * @example
 * <ConfigSlider id="delay" path="notifications.autoHideDelay" value={5000} min={1000} max={30000} step={1000} updateConfig={updateConfig} />
 */
const ConfigSlider = React.memo(function ConfigSlider({
  id,
  path,
  value,
  updateConfig,
  min,
  max,
  step,
}: ConfigSliderProps): React.ReactNode {
  const sliderValue = useMemo(() => [value], [value])
  const handleValueChange = useCallback(
    ([nextValue]: number[]) => {
      if (nextValue === undefined) return
      updateConfig(path, nextValue)
    },
    [path, updateConfig],
  )

  return (
    <Slider
      id={id}
      value={sliderValue}
      onValueChange={handleValueChange}
      min={min}
      max={max}
      step={step}
      className="w-full"
    />
  )
})

/**
 * Resets a single config section without creating inline JSX handlers.
 *
 * @param props - Section identifier, label, and reset callback.
 * @returns A reset Button for one config section.
 * @example
 * <ResetSectionButton section="window" label="Reset Window Settings" onReset={resetSection} />
 */
const ResetSectionButton = React.memo(function ResetSectionButton({
  section,
  label,
  onReset,
}: ResetSectionButtonProps): React.ReactNode {
  const handleClick = useCallback(async () => {
    await onReset(section)
  }, [onReset, section])

  return (
    <Button variant="outline" onClick={handleClick} size="sm">
      {label}
    </Button>
  )
})

export const ConfigurationSettings = React.memo(
  function ConfigurationSettings() {
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

    const loadConfiguration = useCallback(async () => {
      try {
        setLoading(true)
        if (!window.electronAPI?.config) {
          throw new Error('Electron API not available')
        }
        const allConfig = await window.electronAPI.config.getAll()
        setConfig(allConfig as unknown as ElectronConfig)

        // Validate configuration
        const validationResult = await window.electronAPI.config.validate()
        setValidation({
          isValid: validationResult.isValid,
          errors: validationResult.errors ?? [],
        })
      } catch (error) {
        log.error('Failed to load configuration:', error)
        toast.error('Failed to load configuration')
      } finally {
        setLoading(false)
      }
    }, [])

    const updateConfig = useCallback((path: string, value: ConfigValue) => {
      if (typeof value === 'number' && Number.isNaN(value)) return

      const keys = path.split('.')
      setConfig((currentConfig) => {
        if (!currentConfig) return currentConfig

        const nextConfig = { ...currentConfig } as ElectronConfig
        let currentRecord = nextConfig as unknown as Record<string, unknown>

        for (let index = 0; index < keys.length - 1; index++) {
          const key = keys[index]
          if (!key) continue

          const nestedValue = currentRecord[key]
          if (
            typeof nestedValue !== 'object' ||
            nestedValue === null ||
            Array.isArray(nestedValue)
          ) {
            return currentConfig
          }

          const nextNestedValue = { ...nestedValue }
          currentRecord[key] = nextNestedValue
          currentRecord = nextNestedValue as Record<string, unknown>
        }

        const lastKey = keys[keys.length - 1]
        if (!lastKey) return currentConfig

        currentRecord[lastKey] = value
        return nextConfig
      })
      setHasChanges(true)
    }, [])

    const saveConfiguration = useCallback(async () => {
      if (!config || !isElectron) return

      try {
        setSaving(true)

        // Validate before saving
        if (!window.electronAPI?.config) {
          throw new Error('Electron API not available')
        }
        const validationResult = await window.electronAPI.config.validate()
        if (!validationResult.isValid) {
          setValidation({
            isValid: validationResult.isValid,
            errors: validationResult.errors ?? [],
          })
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
        if (!window.electronAPI?.config) {
          throw new Error('Electron API not available')
        }
        await window.electronAPI.config.update(updates)

        setHasChanges(false)
        toast.success('Configuration saved successfully')
      } catch (error) {
        log.error('Failed to save configuration:', error)
        toast.error('Failed to save configuration')
      } finally {
        setSaving(false)
      }
    }, [config, isElectron])

    const resetConfiguration = useCallback(async () => {
      if (!isElectron) return

      try {
        if (!window.electronAPI?.config) {
          throw new Error('Electron API not available')
        }
        await window.electronAPI.config.reset()
        await loadConfiguration()
        setHasChanges(false)
        toast.success('Configuration reset to defaults')
      } catch (error) {
        log.error('Failed to reset configuration:', error)
        toast.error('Failed to reset configuration')
      }
    }, [isElectron, loadConfiguration])

    const resetSection = useCallback(
      async (section: ConfigSection) => {
        if (!isElectron) return

        try {
          if (!window.electronAPI?.config) {
            throw new Error('Electron API not available')
          }
          await window.electronAPI.config.resetSection(section)
          await loadConfiguration()
          setHasChanges(false)
          toast.success(`${section} settings reset to defaults`)
        } catch (error) {
          log.error('Failed to reset section:', error)
          toast.error(`Failed to reset ${section} settings`)
        }
      },
      [isElectron, loadConfiguration],
    )

    const exportConfiguration = useCallback(async () => {
      if (!isElectron) return

      try {
        // In a real implementation, you'd use a file dialog
        // For now, we'll just create a backup

        // For now, we'll just create a backup
        if (!window.electronAPI?.config) {
          throw new Error('Electron API not available')
        }
        const backupPath = await window.electronAPI.config.backup()
        if (backupPath) {
          toast.success(`Configuration exported to ${backupPath}`)
        } else {
          toast.error('Failed to export configuration')
        }
      } catch (error) {
        log.error('Failed to export configuration:', error)
        toast.error('Failed to export configuration')
      }
    }, [isElectron])

    useComponentEffect(() => {
      if (isElectron) {
        loadConfiguration()
      } else {
        setLoading(false)
      }
    }, [isElectron, loadConfiguration])

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
              className="min-w-24"
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
                    <ConfigNumberInput
                      id="main-width"
                      value={config.window.main.width}
                      path="window.main.width"
                      updateConfig={updateConfig}
                      min={config.window.main.minWidth}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="main-height">Height</Label>
                    <ConfigNumberInput
                      id="main-height"
                      value={config.window.main.height}
                      path="window.main.height"
                      updateConfig={updateConfig}
                      min={config.window.main.minHeight}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="remember-position">
                      Remember window position
                    </Label>
                    <ConfigSwitch
                      id="remember-position"
                      checked={config.window.main.rememberPosition}
                      path="window.main.rememberPosition"
                      updateConfig={updateConfig}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="remember-size">Remember window size</Label>
                    <ConfigSwitch
                      id="remember-size"
                      checked={config.window.main.rememberSize}
                      path="window.main.rememberSize"
                      updateConfig={updateConfig}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="start-maximized">Start maximized</Label>
                    <ConfigSwitch
                      id="start-maximized"
                      checked={config.window.main.startMaximized}
                      path="window.main.startMaximized"
                      updateConfig={updateConfig}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="center-on-start">Center on start</Label>
                    <ConfigSwitch
                      id="center-on-start"
                      checked={config.window.main.centerOnStart}
                      path="window.main.centerOnStart"
                      updateConfig={updateConfig}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <ResetSectionButton
                    section="window"
                    label="Reset Window Settings"
                    onReset={resetSection}
                  />
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
                    <ConfigNumberInput
                      id="floating-width"
                      value={config.window.floating.width}
                      path="window.floating.width"
                      updateConfig={updateConfig}
                      min={config.window.floating.minWidth}
                      max={config.window.floating.maxWidth}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="floating-height">Height</Label>
                    <ConfigNumberInput
                      id="floating-height"
                      value={config.window.floating.height}
                      path="window.floating.height"
                      updateConfig={updateConfig}
                      min={config.window.floating.minHeight}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="always-on-top">Always on top</Label>
                    <ConfigSwitch
                      id="always-on-top"
                      checked={config.window.floating.alwaysOnTop}
                      path="window.floating.alwaysOnTop"
                      updateConfig={updateConfig}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="floating-resizable">Resizable</Label>
                    <ConfigSwitch
                      id="floating-resizable"
                      checked={config.window.floating.resizable}
                      path="window.floating.resizable"
                      updateConfig={updateConfig}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="floating-frame">Show window frame</Label>
                    <ConfigSwitch
                      id="floating-frame"
                      checked={config.window.floating.frame}
                      path="window.floating.frame"
                      updateConfig={updateConfig}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="start-visible">Start visible</Label>
                    <ConfigSwitch
                      id="start-visible"
                      checked={config.window.floating.startVisible}
                      path="window.floating.startVisible"
                      updateConfig={updateConfig}
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
                  <ConfigSwitch
                    id="tray-enabled"
                    checked={config.tray.enabled}
                    path="tray.enabled"
                    updateConfig={updateConfig}
                  />
                </div>

                {config.tray.enabled && (
                  <>
                    <Separator />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="minimize-to-tray">
                          Minimize to tray
                        </Label>
                        <ConfigSwitch
                          id="minimize-to-tray"
                          checked={config.tray.minimizeToTray}
                          path="tray.minimizeToTray"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="close-to-tray">Close to tray</Label>
                        <ConfigSwitch
                          id="close-to-tray"
                          checked={config.tray.closeToTray}
                          path="tray.closeToTray"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="start-minimized">Start minimized</Label>
                        <ConfigSwitch
                          id="start-minimized"
                          checked={config.tray.startMinimized}
                          path="tray.startMinimized"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="show-notification-count">
                          Show notification count
                        </Label>
                        <ConfigSwitch
                          id="show-notification-count"
                          checked={config.tray.showNotificationCount}
                          path="tray.showNotificationCount"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="double-click-action">
                          Double-click action
                        </Label>
                        <ConfigSelect
                          id="double-click-action"
                          value={config.tray.doubleClickAction}
                          path="tray.doubleClickAction"
                          updateConfig={updateConfig}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="restore">
                              Restore window
                            </SelectItem>
                            <SelectItem value="toggle">
                              Toggle window
                            </SelectItem>
                            <SelectItem value="none">No action</SelectItem>
                          </SelectContent>
                        </ConfigSelect>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="right-click-action">
                          Right-click action
                        </Label>
                        <ConfigSelect
                          id="right-click-action"
                          value={config.tray.rightClickAction}
                          path="tray.rightClickAction"
                          updateConfig={updateConfig}
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
                        </ConfigSelect>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex justify-end">
                  <ResetSectionButton
                    section="tray"
                    label="Reset Tray Settings"
                    onReset={resetSection}
                  />
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
                  <ConfigSwitch
                    id="shortcuts-enabled"
                    checked={config.shortcuts.enabled}
                    path="shortcuts.enabled"
                    updateConfig={updateConfig}
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
                            <ConfigInput
                              id={`shortcut-${key}`}
                              value={value as string}
                              path={`shortcuts.${key}`}
                              updateConfig={updateConfig}
                              className="w-48"
                              placeholder="e.g., Ctrl+N"
                            />
                          </div>
                        ))}
                    </div>
                  </>
                )}

                <div className="flex justify-end">
                  <ResetSectionButton
                    section="shortcuts"
                    label="Reset Shortcuts"
                    onReset={resetSection}
                  />
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
                  <ConfigSwitch
                    id="notifications-enabled"
                    checked={config.notifications.enabled}
                    path="notifications.enabled"
                    updateConfig={updateConfig}
                  />
                </div>

                {config.notifications.enabled && (
                  <>
                    <Separator />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="task-created">Task created</Label>
                        <ConfigSwitch
                          id="task-created"
                          checked={config.notifications.taskCreated}
                          path="notifications.taskCreated"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="task-completed">Task completed</Label>
                        <ConfigSwitch
                          id="task-completed"
                          checked={config.notifications.taskCompleted}
                          path="notifications.taskCompleted"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="task-updated">Task updated</Label>
                        <ConfigSwitch
                          id="task-updated"
                          checked={config.notifications.taskUpdated}
                          path="notifications.taskUpdated"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="task-deleted">Task deleted</Label>
                        <ConfigSwitch
                          id="task-deleted"
                          checked={config.notifications.taskDeleted}
                          path="notifications.taskDeleted"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="notification-sound">Play sound</Label>
                        <ConfigSwitch
                          id="notification-sound"
                          checked={config.notifications.sound}
                          path="notifications.sound"
                          updateConfig={updateConfig}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="auto-hide">
                          Auto-hide notifications
                        </Label>
                        <ConfigSwitch
                          id="auto-hide"
                          checked={config.notifications.autoHide}
                          path="notifications.autoHide"
                          updateConfig={updateConfig}
                        />
                      </div>

                      {config.notifications.autoHide && (
                        <div className="space-y-2">
                          <Label htmlFor="auto-hide-delay">
                            Auto-hide delay:{' '}
                            {config.notifications.autoHideDelay / 1000}s
                          </Label>
                          <ConfigSlider
                            id="auto-hide-delay"
                            value={config.notifications.autoHideDelay}
                            path="notifications.autoHideDelay"
                            updateConfig={updateConfig}
                            min={1000}
                            max={30000}
                            step={1000}
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="notification-position">
                          Notification position
                        </Label>
                        <ConfigSelect
                          id="notification-position"
                          value={config.notifications.position}
                          path="notifications.position"
                          updateConfig={updateConfig}
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
                        </ConfigSelect>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex justify-end">
                  <ResetSectionButton
                    section="notifications"
                    label="Reset Notification Settings"
                    onReset={resetSection}
                  />
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
                  <ConfigSwitch
                    id="start-on-login"
                    checked={config.behavior.startOnLogin}
                    path="behavior.startOnLogin"
                    updateConfig={updateConfig}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="check-for-updates">Check for updates</Label>
                  <ConfigSwitch
                    id="check-for-updates"
                    checked={config.behavior.checkForUpdates}
                    path="behavior.checkForUpdates"
                    updateConfig={updateConfig}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-save">Auto-save</Label>
                  <ConfigSwitch
                    id="auto-save"
                    checked={config.behavior.autoSave}
                    path="behavior.autoSave"
                    updateConfig={updateConfig}
                  />
                </div>

                {config.behavior.autoSave && (
                  <div className="space-y-2">
                    <Label htmlFor="auto-save-interval">
                      Auto-save interval:{' '}
                      {config.behavior.autoSaveInterval / 1000}s
                    </Label>
                    <ConfigSlider
                      id="auto-save-interval"
                      value={config.behavior.autoSaveInterval}
                      path="behavior.autoSaveInterval"
                      updateConfig={updateConfig}
                      min={5000}
                      max={300000}
                      step={5000}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Label htmlFor="confirm-on-delete">Confirm on delete</Label>
                  <ConfigSwitch
                    id="confirm-on-delete"
                    checked={config.behavior.confirmOnDelete}
                    path="behavior.confirmOnDelete"
                    updateConfig={updateConfig}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="confirm-on-quit">Confirm on quit</Label>
                  <ConfigSwitch
                    id="confirm-on-quit"
                    checked={config.behavior.confirmOnQuit}
                    path="behavior.confirmOnQuit"
                    updateConfig={updateConfig}
                  />
                </div>

                <div className="flex justify-end">
                  <ResetSectionButton
                    section="behavior"
                    label="Reset Behavior Settings"
                    onReset={resetSection}
                  />
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
                  <Label htmlFor="enable-dev-tools">
                    Enable developer tools
                  </Label>
                  <ConfigSwitch
                    id="enable-dev-tools"
                    checked={config.advanced.enableDevTools}
                    path="advanced.enableDevTools"
                    updateConfig={updateConfig}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="enable-logging">Enable logging</Label>
                  <ConfigSwitch
                    id="enable-logging"
                    checked={config.advanced.enableLogging}
                    path="advanced.enableLogging"
                    updateConfig={updateConfig}
                  />
                </div>

                {config.advanced.enableLogging && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="log-level">Log level</Label>
                      <ConfigSelect
                        id="log-level"
                        value={config.advanced.logLevel}
                        path="advanced.logLevel"
                        updateConfig={updateConfig}
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
                      </ConfigSelect>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max-log-files">
                        Max log files: {config.advanced.maxLogFiles}
                      </Label>
                      <ConfigSlider
                        id="max-log-files"
                        value={config.advanced.maxLogFiles}
                        path="advanced.maxLogFiles"
                        updateConfig={updateConfig}
                        min={1}
                        max={20}
                        step={1}
                      />
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between">
                  <Label htmlFor="hardware-acceleration">
                    Hardware acceleration
                  </Label>
                  <ConfigSwitch
                    id="hardware-acceleration"
                    checked={config.advanced.hardwareAcceleration}
                    path="advanced.hardwareAcceleration"
                    updateConfig={updateConfig}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="experimental-features">
                    Experimental features
                  </Label>
                  <ConfigSwitch
                    id="experimental-features"
                    checked={config.advanced.experimentalFeatures}
                    path="advanced.experimentalFeatures"
                    updateConfig={updateConfig}
                  />
                </div>

                <div className="flex justify-end">
                  <ResetSectionButton
                    section="advanced"
                    label="Reset Advanced Settings"
                    onReset={resetSection}
                  />
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

          <div className="text-sm text-muted-foreground">
            Configuration version: {config.version}
          </div>
        </div>
      </div>
    )
  },
)
