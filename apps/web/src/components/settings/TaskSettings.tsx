'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectShowTodayEmber,
  setShowTodayEmber,
} from '@/lib/redux/slices/settingsSlice'

/**
 * Controls Today Ember when {@link SettingsPage} renders the shared Tasks section.
 *
 * @returns The Tasks settings controls.
 * @example
 * <SettingsSection label="Tasks"><TaskSettings /></SettingsSection>
 */
export const TaskSettings = function TaskSettings() {
  const dispatch = useAppDispatch()
  const showTodayEmber = useAppSelector(selectShowTodayEmber)
  /**
   * Updates the shared Ember visibility when its settings switch changes.
   * @param checked - Whether the LiveEditor should show today's keeps.
   * @returns Nothing after dispatching the persisted setting.
   * @example
   * handleTodayEmberChange(true)
   */
  const handleTodayEmberChange = (checked: boolean): void => {
    dispatch(setShowTodayEmber(checked))
  }

  return (
    <div className="space-y-6">
      {/* Shared by the web editor and the desktop panel through settings sync. */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="show-today-ember" className="settings-label">
            Show Today Ember
          </Label>
          <p
            id="today-ember-description"
            className="type-small leading-5 text-muted-foreground"
          >
            Show today's keeps and a warm glow above the LiveEditor.
          </p>
        </div>
        <Switch
          className="shrink-0"
          id="show-today-ember"
          aria-describedby="today-ember-description"
          checked={showTodayEmber}
          onCheckedChange={handleTodayEmberChange}
        />
      </div>
    </div>
  )
}
