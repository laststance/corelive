'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectRetainCompletedInList,
  selectShowCompletedTaskStrikethrough,
  setRetainCompletedInList,
  setShowCompletedTaskStrikethrough,
} from '@/lib/redux/slices/settingsSlice'

/**
 * Web-common TASKS settings for completed-task placement and title decoration,
 * rendered under the `TASKS` section header (`src/app/settings/page.tsx`) and
 * persisted + synced across windows through the `settings` Redux slice.
 *
 * @returns The Tasks settings controls.
 * @example
 * <SettingsSection label="Tasks"><TaskSettings /></SettingsSection>
 */
export const TaskSettings = function TaskSettings() {
  const dispatch = useAppDispatch()
  const retainCompletedInList = useAppSelector(selectRetainCompletedInList)
  const showCompletedTaskStrikethrough = useAppSelector(
    selectShowCompletedTaskStrikethrough,
  )

  /**
   * Updates completed-task placement when the keep-in-list switch changes.
   * @param checked - Whether completed tasks should stay in the active list.
   * @returns Nothing after dispatching the persisted setting.
   * @example
   * handleRetainChange(true)
   */
  const handleRetainChange = (checked: boolean): void => {
    dispatch(setRetainCompletedInList(checked))
  }

  /**
   * Updates completed-title decoration when the Tasks settings switch changes.
   * @param checked - Whether completed task titles should show a strikethrough.
   * @returns Nothing after dispatching the persisted setting.
   * @example
   * handleStrikethroughChange(false)
   */
  const handleStrikethroughChange = (checked: boolean): void => {
    dispatch(setShowCompletedTaskStrikethrough(checked))
  }

  return (
    <div className="space-y-4">
      {/* 居残りモード keeps checked tasks in place instead of moving them to Completed. */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label
            htmlFor="retain-completed-in-list"
            className="text-sm font-medium"
          >
            Keep finished tasks in the list
          </Label>
          <p className="text-xs text-muted-foreground">
            Checked tasks stay in place, so you can watch the day add up —
            instead of moving to Completed.
          </p>
        </div>
        <Switch
          id="retain-completed-in-list"
          checked={retainCompletedInList}
          onCheckedChange={handleRetainChange}
        />
      </div>

      {/* This presentation setting applies consistently to every completed-task surface. */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label
            htmlFor="show-completed-task-strikethrough"
            className="text-sm font-medium"
          >
            Show strikethrough on completed tasks
          </Label>
          <p className="text-xs text-muted-foreground">
            Draw a line through finished task titles across CoreLive.
          </p>
        </div>
        <Switch
          id="show-completed-task-strikethrough"
          checked={showCompletedTaskStrikethrough}
          onCheckedChange={handleStrikethroughChange}
        />
      </div>
    </div>
  )
}

export default TaskSettings
