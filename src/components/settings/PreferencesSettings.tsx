'use client'

import { memo, useCallback } from 'react'

import { Box } from '@/components/box'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectCompletionSound,
  selectRetainCompletedInList,
  setCompletionSound,
  setRetainCompletedInList,
} from '@/lib/redux/slices/preferencesSlice'

/**
 * Web-common user preferences section (shown to everyone, web + Electron). Houses
 * the 居残りモード and completion-sound toggles that govern the core todo
 * experience — distinct from the Electron window-chrome settings, which stay
 * gated to the desktop app. Writes the `preferences` Redux slice (persisted to
 * localStorage and synced across windows by the preferences sync middleware).
 *
 * @returns The Preferences settings card.
 * @example
 * <PreferencesSettings />
 */
export const PreferencesSettings = memo(function PreferencesSettings() {
  const dispatch = useAppDispatch()
  const completionSound = useAppSelector(selectCompletionSound)
  const retainCompletedInList = useAppSelector(selectRetainCompletedInList)

  const handleRetainChange = useCallback(
    (checked: boolean): void => {
      dispatch(setRetainCompletedInList(checked))
    },
    [dispatch],
  )

  const handleCompletionSoundChange = useCallback(
    (checked: boolean): void => {
      dispatch(setCompletionSound(checked))
    },
    [dispatch],
  )

  return (
    <Box className="space-y-4 p-4">
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="px-2 pb-2 pt-0">
          <CardTitle className="text-lg">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-2">
          {/* 居残りモード — keep checked tasks in place instead of moving them. */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="retain-completed-in-list"
                className="text-sm font-medium"
              >
                Keep finished tasks in the list
              </Label>
              <p className="text-xs text-muted-foreground">
                Checked tasks stay in place with a line through them, so you can
                watch the day add up — instead of moving to Completed.
              </p>
            </div>
            <Switch
              id="retain-completed-in-list"
              checked={retainCompletedInList}
              onCheckedChange={handleRetainChange}
            />
          </div>

          {/* Opt-in completion sound (default OFF) — the DESIGN.md SFX exception. */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="completion-sound" className="text-sm font-medium">
                Completion sound
              </Label>
              <p className="text-xs text-muted-foreground">
                A soft sound when you check something off. Off by default.
              </p>
            </div>
            <Switch
              id="completion-sound"
              checked={completionSound}
              onCheckedChange={handleCompletionSoundChange}
            />
          </div>
        </CardContent>
      </Card>
    </Box>
  )
})

export default PreferencesSettings
