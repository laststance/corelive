import { Label } from '@corelive/live-editor/ui/label'
import { Switch } from '@corelive/live-editor/ui/switch'

import { useSettings } from './SettingsProvider'

/**
 * The routine save/sync footer switch, plus the one calm message shown when a preference
 * write is refused.
 *
 * Saving, error alerts and recovery in Details stay active when the footer is hidden. Rendered
 * in the LiveEditor section of {@link ElectronSettingsPage}; reads and writes the device
 * workspace through {@link SettingsProvider}.
 *
 * @example <LiveEditorStatusSetting />
 */
export function LiveEditorStatusSetting() {
  const { settings, updateSettings, saveFailed } = useSettings()
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="live-editor-show-status" className="settings-label">
            Show save and sync status
          </Label>
          <p
            id="live-editor-show-status-description"
            className="type-small leading-5 text-muted-foreground"
          >
            Show two status lines below your writing. Saving, error alerts and
            recovery in Details stay active when hidden.
          </p>
        </div>
        <Switch
          id="live-editor-show-status"
          className="shrink-0"
          aria-describedby="live-editor-show-status-description"
          checked={settings.liveEditorShowStatusBar}
          onCheckedChange={(checked) =>
            updateSettings({ liveEditorShowStatusBar: checked })
          }
        />
      </div>
      {saveFailed && (
        <p className="type-small leading-5 text-muted-foreground" role="status">
          Your settings could not be saved on this Mac. Your last saved choices
          are kept.
        </p>
      )}
    </div>
  )
}
