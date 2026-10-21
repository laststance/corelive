import { useEditorWindowSettings } from '@corelive/live-editor/window-settings'
import { toast } from 'sonner'

import {
  notifyNativeWindowPreferencesChanged,
  useNativeWindowPreferencesVersion,
} from '@/hooks/useNativeWindowPreferencesVersion'
import { getLiveEditorHost } from '@/lib/live-editor/liveEditorHost'
import { log } from '@/lib/logger'

const reportError = (message: string, error: unknown): void => {
  toast.error(message)
  log.error(message, error)
}

/** Adapts shared native window controls to the web Settings notification channel.
 * @example const controls = useLiveEditorWindowSettings(isMounted)
 */
export function useLiveEditorWindowSettings(isMounted: boolean) {
  return useEditorWindowSettings(
    isMounted,
    getLiveEditorHost,
    useNativeWindowPreferencesVersion(),
    notifyNativeWindowPreferencesChanged,
    reportError,
  )
}
