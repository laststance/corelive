'use client'

import { useOfflinePreferenceOutcome } from '@/components/electron/OfflineSettingsSync'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useMounted } from '@/hooks/use-mounted'
import type { PreferenceOutcome } from '@/lib/offline-settings-sync'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectLiveEditorShowStatusBar,
  setLiveEditorShowStatusBar,
} from '@/lib/redux/slices/settingsSlice'

/** Shows native preference recovery and the capability-gated routine footer switch.
 * Saving and recovery remain active; {@link OfflineSettingsSync} reports durable acknowledgement.
 * @example <LiveEditorStatusSetting />
 */
export function LiveEditorStatusSetting() {
  const mounted = useMounted()
  const visible = useAppSelector(selectLiveEditorShowStatusBar)
  const dispatch = useAppDispatch()
  const { outcome, retry, restore } = useOfflinePreferenceOutcome()
  const supported =
    mounted &&
    window.electronAPI?.offlineSettings?.supportedKeys?.includes(
      'liveEditorShowStatusBar',
    )
  if (!mounted || !window.electronAPI?.offlineSettings) return null
  const pending = outcome.status === 'pending'
  const failed = outcome.status === 'failed' || outcome.status === 'unknown'
  const message = pending
    ? 'Applying settings to LiveEditor…'
    : preferenceFailureMessage(outcome)
  return (
    <div className="space-y-3">
      {supported && (
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
            checked={visible}
            onCheckedChange={(checked) =>
              dispatch(setLiveEditorShowStatusBar(checked))
            }
          />
        </div>
      )}
      {(pending || failed) && (
        <div className="space-y-2">
          <p
            className="type-small leading-5 text-muted-foreground"
            role="status"
          >
            {message}
          </p>
          {outcome.terminal && (
            <Button variant="outline" className="min-h-11" onClick={retry}>
              Retry
            </Button>
          )}
          {outcome.canRestore && (
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => void restore()}
            >
              Restore saved settings
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** Explains confirmed refusal separately from an unconfirmed native write.
 * {@link LiveEditorStatusSetting} uses this for every preference, including older preloads.
 * @example preferenceFailureMessage(outcome)
 */
function preferenceFailureMessage(outcome: PreferenceOutcome): string {
  const recovery = outcome.terminal ? 'Use Retry to try again.' : 'Retrying…'
  if (outcome.certainty === 'unconfirmed')
    return `Could not confirm your saved settings. ${recovery}`
  switch (outcome.reason) {
    case 'storage-failed':
      return `Your settings could not be saved on this Mac. ${recovery}`
    case 'revision-conflict':
      return `Saved settings changed elsewhere. Your latest changes are kept. ${recovery}`
    case 'account-changed':
      return `The active workspace changed before settings were saved. ${recovery}`
    case 'invalid-command':
      return `This desktop version could not apply these settings. ${recovery}`
    default:
      return `LiveEditor is unavailable. Your changes are kept. ${recovery}`
  }
}
