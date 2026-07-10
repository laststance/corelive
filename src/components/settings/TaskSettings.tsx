'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectRetainCompletedInList,
  setRetainCompletedInList,
} from '@/lib/redux/slices/settingsSlice'

/**
 * Web-common TASKS settings — the 居残りモード toggle, which previously floated
 * with no header inside the old common settings card. Now rendered under the
 * `TASKS` section header (`src/app/settings/page.tsx`). Writes the `settings`
 * Redux slice (persisted + synced across windows).
 *
 * @returns The Tasks settings controls.
 * @example
 * <SettingsSection label="Tasks"><TaskSettings /></SettingsSection>
 */
export const TaskSettings = function TaskSettings() {
  const dispatch = useAppDispatch()
  const retainCompletedInList = useAppSelector(selectRetainCompletedInList)

  const handleRetainChange = (checked: boolean): void => {
    dispatch(setRetainCompletedInList(checked))
  }

  return (
    // 居残りモード — keep checked tasks in place instead of moving them to Completed.
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label
          htmlFor="retain-completed-in-list"
          className="text-sm font-medium"
        >
          Keep finished tasks in the list
        </Label>
        <p className="text-xs text-muted-foreground">
          Checked tasks stay in place with a line through them, so you can watch
          the day add up — instead of moving to Completed.
        </p>
      </div>
      <Switch
        id="retain-completed-in-list"
        checked={retainCompletedInList}
        onCheckedChange={handleRetainChange}
      />
    </div>
  )
}

export default TaskSettings
