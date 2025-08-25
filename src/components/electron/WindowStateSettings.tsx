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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

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

export function WindowStateSettings() {
  const [stats, setStats] = useState<WindowStateStats | null>(null)
  const [displays, setDisplays] = useState<Display[]>([])
  const [loading, setLoading] = useState(true)

  // Check if we're in Electron environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI

  useEffect(() => {
    if (isElectron) {
      loadWindowStateData()
    } else {
      setLoading(false)
    }
  }, [isElectron])

  const loadWindowStateData = async () => {
    try {
      setLoading(true)

      if (!window.electronAPI?.windowState) {
        throw new Error('Electron API not available')
      }
      const [statsData, displaysData] = await Promise.all([
        window.electronAPI.windowState.getStats(),
        window.electronAPI.windowState.getAllDisplays(),
      ])

      setStats(statsData)
      setDisplays(displaysData)
    } catch (error) {
      console.error('Failed to load window state data:', error)
      toast.error('Failed to load window state information')
    } finally {
      setLoading(false)
    }
  }

  const moveWindowToDisplay = async (windowType: string, displayId: number) => {
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
      console.error('Failed to move window:', error)
      toast.error(`Failed to move ${windowType} window`)
    }
  }

  const snapWindowToEdge = async (windowType: string, edge: string) => {
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
      console.error('Failed to snap window:', error)
      toast.error(`Failed to snap ${windowType} window`)
    }
  }

  const resetWindowState = async (windowType: string) => {
    try {
      if (!window.electronAPI?.windowState) {
        throw new Error('Electron API not available')
      }
      const success = await window.electronAPI.windowState.reset(windowType)
      if (success) {
        toast.success(`${windowType} window state reset to defaults`)
        await loadWindowStateData() // Refresh data
      } else {
        toast.error(`Failed to reset ${windowType} window state`)
      }
    } catch (error) {
      console.error('Failed to reset window state:', error)
      toast.error(`Failed to reset ${windowType} window state`)
    }
  }

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
            <div className="text-muted-foreground text-sm">
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
                    <div className="text-muted-foreground text-sm">
                      {display.bounds.width} × {display.bounds.height}
                      {display.scaleFactor !== 1 &&
                        ` (${display.scaleFactor}x)`}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Position: ({display.bounds.x}, {display.bounds.y})
                    </div>
                  </div>
                  <div className="text-muted-foreground text-right text-sm">
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
                <div className="text-muted-foreground text-sm">
                  ({stats.states.main.bounds.x}, {stats.states.main.bounds.y})
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Size</div>
                <div className="text-muted-foreground text-sm">
                  {stats.states.main.bounds.width} ×{' '}
                  {stats.states.main.bounds.height}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Display</div>
                <div className="text-muted-foreground text-sm">
                  {getDisplayLabel(stats.states.main.displayId)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Last Saved</div>
                <div className="text-muted-foreground text-sm">
                  {formatLastSaved(stats.states.main.lastSaved)}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium">Move to Display</div>
                <Select
                  onValueChange={async (value) =>
                    moveWindowToDisplay('main', parseInt(value, 10))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select display" />
                  </SelectTrigger>
                  <SelectContent>
                    {displays.map((display) => (
                      <SelectItem
                        key={display.id}
                        value={display.id.toString()}
                      >
                        {display.label} {display.isPrimary && '(Primary)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">Snap to Edge</div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => snapWindowToEdge('main', 'left')}
                  >
                    Left
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => snapWindowToEdge('main', 'top')}
                  >
                    Top
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => snapWindowToEdge('main', 'right')}
                  >
                    Right
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => snapWindowToEdge('main', 'top-left')}
                  >
                    Top Left
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => snapWindowToEdge('main', 'maximize')}
                  >
                    Maximize
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => snapWindowToEdge('main', 'top-right')}
                  >
                    Top Right
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () =>
                      snapWindowToEdge('main', 'bottom-left')
                    }
                  >
                    Bottom Left
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => snapWindowToEdge('main', 'bottom')}
                  >
                    Bottom
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () =>
                      snapWindowToEdge('main', 'bottom-right')
                    }
                  >
                    Bottom Right
                  </Button>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => resetWindowState('main')}
                  size="sm"
                >
                  Reset Main Window
                </Button>
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
                <div className="text-muted-foreground text-sm">
                  ({stats.states.floating.bounds.x},{' '}
                  {stats.states.floating.bounds.y})
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Size</div>
                <div className="text-muted-foreground text-sm">
                  {stats.states.floating.bounds.width} ×{' '}
                  {stats.states.floating.bounds.height}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Display</div>
                <div className="text-muted-foreground text-sm">
                  {getDisplayLabel(stats.states.floating.displayId)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Last Saved</div>
                <div className="text-muted-foreground text-sm">
                  {formatLastSaved(stats.states.floating.lastSaved)}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium">Move to Display</div>
                <Select
                  onValueChange={async (value) =>
                    moveWindowToDisplay('floating', parseInt(value, 10))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select display" />
                  </SelectTrigger>
                  <SelectContent>
                    {displays.map((display) => (
                      <SelectItem
                        key={display.id}
                        value={display.id.toString()}
                      >
                        {display.label} {display.isPrimary && '(Primary)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">Quick Position</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () =>
                      snapWindowToEdge('floating', 'top-left')
                    }
                  >
                    Top Left
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () =>
                      snapWindowToEdge('floating', 'top-right')
                    }
                  >
                    Top Right
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () =>
                      snapWindowToEdge('floating', 'bottom-left')
                    }
                  >
                    Bottom Left
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () =>
                      snapWindowToEdge('floating', 'bottom-right')
                    }
                  >
                    Bottom Right
                  </Button>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => resetWindowState('floating')}
                  size="sm"
                >
                  Reset Floating Navigator
                </Button>
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
              <div className="text-muted-foreground text-sm">
                {stats.windowCount}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">Last State Save</div>
              <div className="text-muted-foreground text-sm">
                {formatLastSaved(stats.lastSaved)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
