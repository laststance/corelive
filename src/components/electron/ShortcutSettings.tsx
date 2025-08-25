'use client'

import { Keyboard, RotateCcw, Save, AlertCircle } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface ShortcutSettingsProps {
  className?: string
}

interface ShortcutConfig {
  [key: string]: string
}

interface ShortcutStats {
  totalRegistered: number
  isEnabled: boolean
  platform: string
  shortcuts: Record<string, string>
}

const SHORTCUT_DESCRIPTIONS: Record<string, string> = {
  newTask: 'Create new task',
  search: 'Focus search',
  toggleFloatingNavigator: 'Toggle floating navigator',
  showMainWindow: 'Show main window',
  minimize: 'Minimize window',
  toggleAlwaysOnTop: 'Toggle always on top',
  focusFloatingNavigator: 'Focus floating navigator',
}

export function ShortcutSettings({ className }: ShortcutSettingsProps) {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>({})
  const [defaultShortcuts, setDefaultShortcuts] = useState<ShortcutConfig>({})
  const [stats, setStats] = useState<ShortcutStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if we're in Electron environment
  const isElectron =
    typeof window !== 'undefined' && window.electronAPI?.shortcuts

  useEffect(() => {
    if (!isElectron) {
      setIsLoading(false)
      return
    }

    loadShortcuts()
  }, [isElectron])

  const loadShortcuts = async () => {
    if (!isElectron) return

    try {
      if (!window.electronAPI?.shortcuts) {
        throw new Error('Electron API not available')
      }
      const [registered, defaults, currentStats] = await Promise.all([
        window.electronAPI.shortcuts.getRegistered(),
        window.electronAPI.shortcuts.getDefaults(),
        window.electronAPI.shortcuts.getStats(),
      ])

      setShortcuts(registered)
      setDefaultShortcuts(defaults)
      setStats(currentStats)
      setHasChanges(false)
      setError(null)
    } catch (error) {
      console.error('Failed to load shortcuts:', error)
      setError('Failed to load shortcut settings')
    } finally {
      setIsLoading(false)
    }
  }

  const updateShortcut = (id: string, accelerator: string) => {
    setShortcuts((prev) => ({
      ...prev,
      [id]: accelerator,
    }))
    setHasChanges(true)
    setError(null)
  }

  const saveShortcuts = async () => {
    if (!isElectron) return

    setIsSaving(true)
    setError(null)

    try {
      if (!window.electronAPI?.shortcuts) {
        throw new Error('Electron API not available')
      }
      const success = await window.electronAPI.shortcuts.update(shortcuts)

      if (success) {
        setHasChanges(false)
        await loadShortcuts() // Reload to get current state
      } else {
        setError(
          'Failed to update shortcuts. Some shortcuts may be in use by other applications.',
        )
      }
    } catch (error) {
      console.error('Failed to save shortcuts:', error)
      setError('Failed to save shortcut settings')
    } finally {
      setIsSaving(false)
    }
  }

  const resetToDefaults = () => {
    setShortcuts({ ...defaultShortcuts })
    setHasChanges(true)
    setError(null)
  }

  const toggleShortcuts = async () => {
    if (!isElectron || !stats) return

    try {
      if (!window.electronAPI?.shortcuts) {
        throw new Error('Electron API not available')
      }
      if (stats.isEnabled) {
        await window.electronAPI.shortcuts.disable()
      } else {
        await window.electronAPI.shortcuts.enable()
      }
      await loadShortcuts()
    } catch (error) {
      console.error('Failed to toggle shortcuts:', error)
      setError('Failed to toggle shortcuts')
    }
  }

  const testShortcut = async (id: string) => {
    if (!isElectron) return

    try {
      const accelerator = shortcuts[id]
      if (accelerator) {
        if (
          !window.electronAPI?.shortcuts ||
          !window.electronAPI?.notifications
        ) {
          throw new Error('Electron API not available')
        }
        const isRegistered =
          await window.electronAPI.shortcuts.isRegistered(accelerator)
        if (isRegistered) {
          // Show a notification that the shortcut is working
          await window.electronAPI.notifications.show(
            'Shortcut Test',
            `${SHORTCUT_DESCRIPTIONS[id]} (${accelerator}) is registered and working`,
            { silent: true },
          )
        } else {
          setError(`Shortcut ${accelerator} is not currently registered`)
        }
      }
    } catch (error) {
      console.error('Failed to test shortcut:', error)
      setError('Failed to test shortcut')
    }
  }

  if (!isElectron) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </CardTitle>
          <CardDescription>
            Keyboard shortcuts are only available in the desktop app.
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
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </CardTitle>
          <CardDescription>Loading shortcut settings...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Keyboard className="h-5 w-5" />
          Keyboard Shortcuts
          {stats && (
            <Badge
              variant={stats.isEnabled ? 'default' : 'secondary'}
              className="ml-auto"
            >
              {stats.isEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Configure global keyboard shortcuts for quick access to TODO app
          features.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master toggle */}
        {stats && (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Keyboard Shortcuts</Label>
              <div className="text-muted-foreground text-sm">
                Turn on global keyboard shortcuts
              </div>
            </div>
            <Switch
              checked={stats.isEnabled}
              onCheckedChange={toggleShortcuts}
              disabled={isSaving}
            />
          </div>
        )}

        {stats?.isEnabled && (
          <>
            {/* Error display */}
            {error && (
              <div className="bg-destructive/10 text-destructive flex items-center gap-2 rounded-md p-3">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Shortcut configuration */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Shortcut Configuration</h4>

              <div className="space-y-3">
                {Object.entries(SHORTCUT_DESCRIPTIONS).map(
                  ([id, description]) => (
                    <div key={id} className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label htmlFor={`shortcut-${id}`} className="text-sm">
                          {description}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`shortcut-${id}`}
                          value={shortcuts[id] || ''}
                          onChange={(e) => updateShortcut(id, e.target.value)}
                          placeholder="e.g. Ctrl+N"
                          className="w-32 text-sm"
                          disabled={isSaving}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => testShortcut(id)}
                          disabled={isSaving || !shortcuts[id]}
                        >
                          Test
                        </Button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Platform info */}
            {stats && (
              <div className="text-muted-foreground text-sm">
                <p>Platform: {stats.platform}</p>
                <p>Registered shortcuts: {stats.totalRegistered}</p>
                <p className="mt-2">
                  <strong>Tip:</strong> Use{' '}
                  {stats.platform === 'darwin' ? 'Cmd' : 'Ctrl'} as the main
                  modifier key. Examples:{' '}
                  {stats.platform === 'darwin'
                    ? 'Cmd+N, Cmd+Shift+F'
                    : 'Ctrl+N, Ctrl+Shift+F'}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={saveShortcuts}
                disabled={!hasChanges || isSaving}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>

              <Button
                variant="outline"
                onClick={resetToDefaults}
                disabled={isSaving}
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reset to Defaults
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
