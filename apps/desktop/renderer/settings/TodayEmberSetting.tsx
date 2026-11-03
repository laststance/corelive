import { Label } from '@corelive/live-editor/ui/label'
import { Switch } from '@corelive/live-editor/ui/switch'

import { useSettings } from './SettingsProvider'

/**
 * Controls Today Ember, the opt-in glow above the LiveEditor (moved from the web
 * `TaskSettings`, which only ever drove the desktop panel).
 *
 * Rendered in the LiveEditor section of {@link ElectronSettingsPage}.
 *
 * @example <TodayEmberSetting />
 */
export function TodayEmberSetting() {
  const { settings, updateSettings } = useSettings()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <Label htmlFor="show-today-ember" className="settings-label">
          Show Today Ember
        </Label>
        <p
          id="today-ember-description"
          className="type-small leading-5 text-muted-foreground"
        >
          Show today&apos;s keeps and a warm glow above the LiveEditor.
        </p>
      </div>
      <Switch
        className="shrink-0"
        id="show-today-ember"
        aria-describedby="today-ember-description"
        checked={settings.showTodayEmber}
        onCheckedChange={(checked) =>
          updateSettings({ showTodayEmber: checked })
        }
      />
    </div>
  )
}
