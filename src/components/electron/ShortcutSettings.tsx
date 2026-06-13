'use client'

import { Keyboard, RotateCcw, Save, AlertCircle } from 'lucide-react'
import { memo, useCallback, useState, type MouseEvent } from 'react'

import { KeybindingCaptureInput } from '@/components/electron/KeybindingCaptureInput'
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
  toggleBrainDump: 'Toggle BrainDump',
  minimize: 'Minimize window',
  toggleAlwaysOnTop: 'Toggle always on top',
  focusFloatingNavigator: 'Focus floating navigator',
}

export const ShortcutSettings = memo(function ShortcutSettings({
  className,
}: ShortcutSettingsProps) {
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

  const loadShortcuts = useCallback(async () => {
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

      // Transform ShortcutDefinition[] to ShortcutConfig (key-value pairs)
      const registeredConfig: ShortcutConfig = {}
      for (const shortcut of registered) {
        registeredConfig[shortcut.id] = shortcut.accelerator
      }

      const defaultsConfig: ShortcutConfig = {}
      for (const shortcut of defaults) {
        defaultsConfig[shortcut.id] = shortcut.accelerator
      }

      // Use stats directly from main process
      // The IPC response now matches our ShortcutStats type
      const statsFormatted: ShortcutStats = {
        totalRegistered: currentStats.totalRegistered,
        isEnabled: currentStats.isEnabled,
        platform: currentStats.platform,
        shortcuts: registeredConfig,
      }

      setShortcuts(registeredConfig)
      setDefaultShortcuts(defaultsConfig)
      setStats(statsFormatted)
      setHasChanges(false)
      setError(null)
    } catch (error) {
      log.error('Failed to load shortcuts:', error)
      setError('Failed to load shortcut settings')
    } finally {
      setIsLoading(false)
    }
  }, [isElectron])

  useCycleEffect(() => {
    if (!isElectron) {
      setIsLoading(false)
      return
    }

    loadShortcuts()
  }, [isElectron, loadShortcuts])

  const updateShortcut = useCallback((id: string, accelerator: string) => {
    setShortcuts((prev) => ({
      ...prev,
      [id]: accelerator,
    }))
    setHasChanges(true)
    setError(null)
  }, [])

  /**
   * Persist every pending shortcut edit to the main process in one batch, then
   * surface success/failure. Sends the full id→accelerator record to update()
   * (the preload bridge rejects a per-shortcut loop — see the body comment).
   * @returns Resolves when the batch save settles; sets error state on any failure.
   * @example saveShortcuts() // flushes pending edits, clears the unsaved-changes flag on success
   */
  const saveShortcuts = useCallback(async () => {
    if (!isElectron) return

    setIsSaving(true)
    setError(null)

    try {
      if (!window.electronAPI?.shortcuts) {
        throw new Error('Electron API not available')
      }
      // Persist every shortcut in one batch — the preload bridge takes the full
      // id→accelerator record. A per-shortcut loop calling update(id, accel)
      // throws in preload, which expects a Record, not positional args.
      const allSuccess = await window.electronAPI.shortcuts.update(shortcuts)

      if (allSuccess) {
        setHasChanges(false)
        await loadShortcuts() // Reload to get current state
      } else {
        setError(
          'Failed to update shortcuts. Some shortcuts may be in use by other applications.',
        )
      }
    } catch (error) {
      log.error('Failed to save shortcuts:', error)
      setError('Failed to save shortcut settings')
    } finally {
      setIsSaving(false)
    }
  }, [isElectron, loadShortcuts, shortcuts])

  const resetToDefaults = useCallback(() => {
    setShortcuts({ ...defaultShortcuts })
    setHasChanges(true)
    setError(null)
  }, [defaultShortcuts])

  const toggleShortcuts = useCallback(async () => {
    if (!isElectron || !stats) return

    try {
      if (!window.electronAPI?.shortcuts) {
        throw new Error('Electron API not available')
      }
      // Toggle each shortcut individually
      const shortcutIds = Object.keys(shortcuts)
      for (const id of shortcutIds) {
        if (stats.isEnabled) {
          await window.electronAPI.shortcuts.disable(id)
        } else {
          await window.electronAPI.shortcuts.enable(id)
        }
      }
      await loadShortcuts()
    } catch (error) {
      log.error('Failed to toggle shortcuts:', error)
      setError('Failed to toggle shortcuts')
    }
  }, [isElectron, loadShortcuts, shortcuts, stats])

  const testShortcut = useCallback(
    async (id: string) => {
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
        log.error('Failed to test shortcut:', error)
        setError('Failed to test shortcut')
      }
    },
    [isElectron, shortcuts],
  )

  const handleTestShortcutClick = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      const shortcutId = event.currentTarget.dataset.shortcutId
      if (shortcutId) await testShortcut(shortcutId)
    },
    [testShortcut],
  )

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
              <div className="text-sm text-muted-foreground">
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
              <div className="bg-destructive/10 flex items-center gap-2 rounded-md p-3 text-destructive">
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
                    <ShortcutRow
                      key={id}
                      id={id}
                      description={description}
                      value={shortcuts[id] || ''}
                      platform={
                        stats?.platform === 'darwin' ? 'darwin' : 'other'
                      }
                      disabled={isSaving}
                      onChange={updateShortcut}
                      onTest={handleTestShortcutClick}
                    />
                  ),
                )}
              </div>
            </div>

            {/* Platform info */}
            {stats && (
              <div className="text-sm text-muted-foreground">
                <p>Platform: {stats.platform}</p>
                <p>Registered shortcuts: {stats.totalRegistered}</p>
                <p className="mt-2">
                  <strong>Tip:</strong> Click a shortcut, then press the key
                  combination you want — Esc cancels, Backspace clears it.
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
})

interface ShortcutRowProps {
  /** Shortcut id (map key); also builds the stable `shortcut-${id}` control id. */
  id: string
  /** Human-readable shortcut name shown in the Label and as the box's aria-label. */
  description: string
  /** Bound accelerator string (`''` when unbound). */
  value: string
  /** Glyph platform forwarded to the capture box. */
  platform: 'darwin' | 'other'
  /** Whether a save is in flight — disables capture and the Test button. */
  disabled: boolean
  /** Buffers a captured accelerator into the parent's pending edits. */
  onChange: (id: string, accelerator: string) => void
  /** Fires the Test action; reads `data-shortcut-id` off the clicked button. */
  onTest: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * One configurable shortcut line — label, VSCode-style capture box, and Test button.
 * Extracted so each row owns a stable per-id onChange (useCallback): an inline
 * `(accel) => onChange(id, accel)` in the parent's .map would allocate a fresh
 * function every render and trip the prefer-usecallback lint.
 * @param props - See {@link ShortcutRowProps}.
 * @returns The shortcut's settings row.
 * @example <ShortcutRow id="toggleBrainDump" description="Toggle BrainDump" value="Alt+Space" platform="darwin" disabled={false} onChange={updateShortcut} onTest={handleTestShortcutClick} />
 */
const ShortcutRow = memo(function ShortcutRow({
  id,
  description,
  value,
  platform,
  disabled,
  onChange,
  onTest,
}: ShortcutRowProps) {
  // Bind the parent's (id, accelerator) handler to this row's id so the capture
  // box receives a stable reference instead of a fresh inline closure each render.
  const handleChange = useCallback(
    (accelerator: string) => onChange(id, accelerator),
    [id, onChange],
  )

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <Label htmlFor={`shortcut-${id}`} className="text-sm">
          {description}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <KeybindingCaptureInput
          id={`shortcut-${id}`}
          value={value}
          ariaLabel={description}
          platform={platform}
          disabled={disabled}
          onChange={handleChange}
        />
        <Button
          variant="outline"
          size="sm"
          data-shortcut-id={id}
          onClick={onTest}
          disabled={disabled || !value}
        >
          Test
        </Button>
      </div>
    </div>
  )
})
