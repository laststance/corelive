'use client'

import React, { useCallback, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useComponentEffect } from '@/hooks/useComponentEffect'

import { log } from '../../lib/logger'

interface WindowState {
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  displayId: number
  lastSaved: number
}

interface Display {
  id: number
  label: string
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  workArea: {
    x: number
    y: number
    width: number
    height: number
  }
  scaleFactor: number
  isPrimary: boolean
}

interface WindowStateStats {
  windowCount: number
  lastSaved: number
  displays: Display[]
  states: {
    main?: WindowState
    floating?: WindowState
  }
}

type WindowType = 'main' | 'floating'

type SnapEdge =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'maximize'

interface WindowDisplaySelectProps {
  windowType: WindowType
  displays: Display[]
  onMove: (windowType: WindowType, displayId: number) => Promise<void>
}

interface SnapWindowButtonProps {
  windowType: WindowType
  edge: SnapEdge
  label: string
  onSnap: (windowType: WindowType, edge: SnapEdge) => Promise<void>
}

interface ResetWindowButtonProps {
  windowType: WindowType
  label: string
  onReset: (windowType: WindowType) => Promise<void>
}

/**
 * Moves a window to the selected display without inline JSX handlers.
 *
 * @param props - Target window, display list, and move callback.
 * @returns A display Select for the target window.
 * @example
 * <WindowDisplaySelect windowType="main" displays={displays} onMove={moveWindowToDisplay} />
 */
const WindowDisplaySelect = React.memo(function WindowDisplaySelect({
  windowType,
  displays,
  onMove,
}: WindowDisplaySelectProps): React.ReactNode {
  const handleValueChange = useCallback(
    async (value: string) => {
      await onMove(windowType, parseInt(value, 10))
    },
    [onMove, windowType],
  )

  return (
    <Select onValueChange={handleValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select display" />
      </SelectTrigger>
      <SelectContent>
        {displays.map((display) => (
          <SelectItem key={display.id} value={display.id.toString()}>
            {display.label} {display.isPrimary && '(Primary)'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
})

/**
 * Snaps a window to a fixed edge without inline JSX handlers.
 *
 * @param props - Target window, edge, label, and snap callback.
 * @returns A small outline Button.
 * @example
 * <SnapWindowButton windowType="main" edge="left" label="Left" onSnap={snapWindowToEdge} />
 */
const SnapWindowButton = React.memo(function SnapWindowButton({
  windowType,
  edge,
  label,
  onSnap,
}: SnapWindowButtonProps): React.ReactNode {
  const handleClick = useCallback(async () => {
    await onSnap(windowType, edge)
  }, [edge, onSnap, windowType])

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      {label}
    </Button>
  )
})

/**
 * Resets one window state without inline JSX handlers.
 *
 * @param props - Target window, label, and reset callback.
 * @returns A small outline Button.
 * @example
 * <ResetWindowButton windowType="main" label="Reset Main Window" onReset={resetWindowState} />
 */
const ResetWindowButton = React.memo(function ResetWindowButton({
  windowType,
  label,
  onReset,
}: ResetWindowButtonProps): React.ReactNode {
  const handleClick = useCallback(async () => {
    await onReset(windowType)
  }, [onReset, windowType])

  return (
    <Button variant="outline" onClick={handleClick} size="sm">
      {label}
    </Button>
  )
})

export const WindowStateSettings = React.memo(function WindowStateSettings() {
  const [stats, setStats] = useState<WindowStateStats | null>(null)
  const [displays, setDisplays] = useState<Display[]>([])
  const [loading, setLoading] = useState(true)

  // Check if we're in Electron environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI

  const loadWindowStateData = useCallback(async () => {
    try {
      setLoading(true)

      if (!window.electronAPI?.windowState) {
        throw new Error('Electron API not available')
      }
      const [apiStats, displaysData, mainState, floatingState] =
        await Promise.all([
          window.electronAPI.windowState.getStats(),
          window.electronAPI.windowState.getAllDisplays(),
          window.electronAPI.windowState.get('main'),
          window.electronAPI.windowState.get('floating'),
        ])

      // Transform API stats to component's expected format
      const transformedDisplays: Display[] = displaysData.map((d, index) => ({
        id: d.id,
        label: d.isPrimary ? 'Primary Display' : `Display ${index + 1}`,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
        isPrimary: d.isPrimary,
      }))

      const statsData: WindowStateStats = {
        windowCount: apiStats.windowCount ?? apiStats.saves ?? 0,
        lastSaved: apiStats.lastSaved ?? 0,
        displays: transformedDisplays,
        states: {
          main: mainState
            ? {
                bounds: {
                  x: mainState.x,
                  y: mainState.y,
                  width: mainState.width,
                  height: mainState.height,
                },
                displayId: mainState.displayId ?? 0,
                lastSaved: mainState.lastSaved ?? 0,
              }
            : undefined,
          floating: floatingState
            ? {
                bounds: {
                  x: floatingState.x,
                  y: floatingState.y,
                  width: floatingState.width,
                  height: floatingState.height,
                },
                displayId: floatingState.displayId ?? 0,
                lastSaved: floatingState.lastSaved ?? 0,
              }
            : undefined,
        },
      }

      setStats(statsData)
      setDisplays(transformedDisplays)
    } catch (error) {
      log.error('Failed to load window state data:', error)
      toast.error('Failed to load window state information')
    } finally {
      setLoading(false)
    }
  }, [])

  const moveWindowToDisplay = useCallback(
    async (windowType: WindowType, displayId: number) => {
      try {
        if (!window.electronAPI?.windowState) {
          throw new Error('Electron API not available')
        }
        const success = await window.electronAPI.windowState.moveToDisplay(
          windowType,
          displayId,
        )
        if (success) {
          toast.success(`${windowType} window moved to display ${displayId}`)
          await loadWindowStateData() // Refresh data
        } else {
          toast.error(`Failed to move ${windowType} window`)
        }
      } catch (error) {
        log.error('Failed to move window:', error)
        toast.error(`Failed to move ${windowType} window`)
      }
    },
    [loadWindowStateData],
  )

  const snapWindowToEdge = useCallback(
    async (windowType: WindowType, edge: SnapEdge) => {
      try {
        if (!window.electronAPI?.windowState) {
          throw new Error('Electron API not available')
        }
        const success = await window.electronAPI.windowState.snapToEdge(
          windowType,
          edge,
        )
        if (success) {
          toast.success(`${windowType} window snapped to ${edge}`)
          await loadWindowStateData() // Refresh data
        } else {
          toast.error(`Failed to snap ${windowType} window`)
        }
      } catch (error) {
        log.error('Failed to snap window:', error)
        toast.error(`Failed to snap ${windowType} window`)
      }
    },
    [loadWindowStateData],
  )

  const resetWindowState = useCallback(
    async (windowType: WindowType) => {
      try {
        if (!window.electronAPI?.windowState) {
          throw new Error('Electron API not available')
        }
        await window.electronAPI.windowState.reset(windowType)
        toast.success(`${windowType} window state reset to defaults`)
        await loadWindowStateData() // Refresh data
      } catch (error) {
        log.error('Failed to reset window state:', error)
        toast.error(`Failed to reset ${windowType} window state`)
      }
    },
    [loadWindowStateData],
  )

  useComponentEffect(() => {
    if (isElectron) {
      loadWindowStateData()
    } else {
      setLoading(false)
    }
  }, [isElectron, loadWindowStateData])

  const formatLastSaved = (timestamp: number) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleString()
  }

  const getDisplayLabel = (displayId: number) => {
    const display = displays.find((d) => d.id === displayId)
    return display ? display.label : `Display ${displayId}`
  }

  if (!isElectron) {
    return (
      <Alert>
        <AlertDescription>
          Window state management is only available in the Electron desktop
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
          <p>Loading window state information...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <Alert>
        <AlertDescription>
          Failed to load window state information. Please try refreshing the
          page.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Window State Management</h2>
          <p className="text-muted-foreground">
            Manage window positions, sizes, and multi-monitor settings
          </p>
        </div>
        <Button onClick={loadWindowStateData} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Display Information */}
      <Card>
        <CardHeader>
          <CardTitle>Display Configuration</CardTitle>
          <CardDescription>
            Current display setup and monitor information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {displays.length} display{displays.length !== 1 ? 's' : ''}{' '}
              detected
            </div>

            <div className="grid gap-4">
              {displays.map((display) => (
                <div
                  key={display.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{display.label}</span>
                      {display.isPrimary && (
                        <Badge variant="secondary">Primary</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {display.bounds.width} × {display.bounds.height}
                      {display.scaleFactor !== 1 &&
                        ` (${display.scaleFactor}x)`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Position: ({display.bounds.x}, {display.bounds.y})
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    ID: {display.id}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Window State */}
      {stats.states.main && (
        <Card>
          <CardHeader>
            <CardTitle>Main Window</CardTitle>
            <CardDescription>
              Main application window position and size
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium">Position</div>
                <div className="text-sm text-muted-foreground">
                  ({stats.states.main.bounds.x}, {stats.states.main.bounds.y})
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Size</div>
                <div className="text-sm text-muted-foreground">
                  {stats.states.main.bounds.width} ×{' '}
                  {stats.states.main.bounds.height}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Display</div>
                <div className="text-sm text-muted-foreground">
                  {getDisplayLabel(stats.states.main.displayId)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Last Saved</div>
                <div className="text-sm text-muted-foreground">
                  {formatLastSaved(stats.states.main.lastSaved)}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium">Move to Display</div>
                <WindowDisplaySelect
                  windowType="main"
                  displays={displays}
                  onMove={moveWindowToDisplay}
                />
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">Snap to Edge</div>
                <div className="grid grid-cols-3 gap-2">
                  <SnapWindowButton
                    windowType="main"
                    edge="left"
                    label="Left"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="main"
                    edge="top"
                    label="Top"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="main"
                    edge="right"
                    label="Right"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="main"
                    edge="top-left"
                    label="Top Left"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="main"
                    edge="maximize"
                    label="Maximize"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="main"
                    edge="top-right"
                    label="Top Right"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="main"
                    edge="bottom-left"
                    label="Bottom Left"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="main"
                    edge="bottom"
                    label="Bottom"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="main"
                    edge="bottom-right"
                    label="Bottom Right"
                    onSnap={snapWindowToEdge}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <ResetWindowButton
                  windowType="main"
                  label="Reset Main Window"
                  onReset={resetWindowState}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Floating Navigator State */}
      {stats.states.floating && (
        <Card>
          <CardHeader>
            <CardTitle>Floating Navigator</CardTitle>
            <CardDescription>
              Floating navigator window position and size
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium">Position</div>
                <div className="text-sm text-muted-foreground">
                  ({stats.states.floating.bounds.x},{' '}
                  {stats.states.floating.bounds.y})
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Size</div>
                <div className="text-sm text-muted-foreground">
                  {stats.states.floating.bounds.width} ×{' '}
                  {stats.states.floating.bounds.height}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Display</div>
                <div className="text-sm text-muted-foreground">
                  {getDisplayLabel(stats.states.floating.displayId)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Last Saved</div>
                <div className="text-sm text-muted-foreground">
                  {formatLastSaved(stats.states.floating.lastSaved)}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium">Move to Display</div>
                <WindowDisplaySelect
                  windowType="floating"
                  displays={displays}
                  onMove={moveWindowToDisplay}
                />
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">Quick Position</div>
                <div className="grid grid-cols-2 gap-2">
                  <SnapWindowButton
                    windowType="floating"
                    edge="top-left"
                    label="Top Left"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="floating"
                    edge="top-right"
                    label="Top Right"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="floating"
                    edge="bottom-left"
                    label="Bottom Left"
                    onSnap={snapWindowToEdge}
                  />
                  <SnapWindowButton
                    windowType="floating"
                    edge="bottom-right"
                    label="Bottom Right"
                    onSnap={snapWindowToEdge}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <ResetWindowButton
                  windowType="floating"
                  label="Reset Floating Navigator"
                  onReset={resetWindowState}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
          <CardDescription>
            Window state management statistics and information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium">Windows Tracked</div>
              <div className="text-sm text-muted-foreground">
                {stats.windowCount}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">Last State Save</div>
              <div className="text-sm text-muted-foreground">
                {formatLastSaved(stats.lastSaved)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})
