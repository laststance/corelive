import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import {
  notifyNativeWindowPreferencesChanged,
  useNativeWindowPreferencesVersion,
} from '@/hooks/useNativeWindowPreferencesVersion'
import {
  LIVE_EDITOR_OPACITY_MAX,
  LIVE_EDITOR_OPACITY_MIN,
} from '@/lib/constants/live-editor'
import { getLiveEditorHost } from '@/lib/live-editor/liveEditorHost'
import { log } from '@/lib/logger'

/** Loads native window preferences and applies opacity/Spaces changes for {@link LiveEditor}.
 * @param isMounted - Hydration guard shared with the editor's host detection.
 * @returns Controlled native settings, readiness, and update handlers.
 * @example useLiveEditorWindowSettings(isMounted)
 */
export function useLiveEditorWindowSettings(isMounted: boolean) {
  const preferencesVersion = useNativeWindowPreferencesVersion()
  const [opacity, setOpacity] = useState<number>(LIVE_EDITOR_OPACITY_MAX)
  const [isLiveEditorConfigReady, setIsLiveEditorConfigReady] =
    useState<boolean>(false)
  const [spacesTrackingEnabled, setSpacesTrackingEnabled] =
    useState<boolean>(false)
  const [isUpdatingSpacesTracking, setIsUpdatingSpacesTracking] =
    useState<boolean>(false)
  // Synchronous guard because state-driven disabled UI applies after render.
  const isUpdatingSpacesTrackingRef = useRef<boolean>(false)

  // Pull opacity + Spaces tracking on mount and after a native settings save (the main process,
  // or the web host's instant defaults — which is what marks the browser
  // editor ready with no preload).
  useCycleEffect(() => {
    if (!isMounted) return
    let cancelled = false
    const api = getLiveEditorHost()
    void Promise.all([
      api.window.getOpacity(),
      api.spaces?.getVisibleOnAllWorkspaces?.() ?? Promise.resolve(false),
    ])
      .then(([opacityValue, followsSpaces]) => {
        if (cancelled) return
        setOpacity(opacityValue)
        setSpacesTrackingEnabled(followsSpaces)
        setIsLiveEditorConfigReady(true)
      })
      .catch((error) => {
        // Failures here keep the safe defaults seeded by useState; surface
        // a toast so the user knows their persisted settings didn't load.
        if (cancelled) return
        toast.error('Failed to load LiveEditor settings')
        log.error('LiveEditor settings load failed', error)
        setIsLiveEditorConfigReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [isMounted, preferencesVersion])

  const handleOpacityChange = async (next: number): Promise<void> => {
    const clamped = Math.max(
      LIVE_EDITOR_OPACITY_MIN,
      Math.min(LIVE_EDITOR_OPACITY_MAX, next),
    )
    setOpacity(clamped)
    try {
      await getLiveEditorHost().window.setOpacity(clamped)
      notifyNativeWindowPreferencesChanged()
    } catch (error) {
      log.error('LiveEditor opacity update failed', error)
      toast.error('Failed to update window opacity')
      // Reload the last confirmed native value after a failed optimistic update.
      const restored = await getLiveEditorHost()
        .window.getOpacity()
        .catch(() => opacity)
      setOpacity(restored)
    }
  }

  const handleOpacityValueChange = (values: number[]) => {
    const next = values[0]
    if (next !== undefined) void handleOpacityChange(next)
  }

  /**
   * Applies the Mac Spaces tracking switch from the LiveEditor header.
   *
   * @param enabled - true keeps both utility panels visible across Spaces.
   * @returns Promise that settles after the main process confirms or rolls back.
   * @example
   * await handleSpacesTrackingChange(true)
   */
  const handleSpacesTrackingChange = async (
    enabled: boolean,
  ): Promise<void> => {
    if (isUpdatingSpacesTrackingRef.current) return
    isUpdatingSpacesTrackingRef.current = true
    setIsUpdatingSpacesTracking(true)

    const previous = spacesTrackingEnabled
    setSpacesTrackingEnabled(enabled)

    try {
      const applied =
        await getLiveEditorHost().spaces?.setVisibleOnAllWorkspaces(enabled)
      setSpacesTrackingEnabled(applied ?? enabled)
      notifyNativeWindowPreferencesChanged()
    } catch (error) {
      setSpacesTrackingEnabled(previous)
      toast.error('Failed to update desktop tracking')
      log.error('LiveEditor Spaces tracking update failed', error)
    } finally {
      isUpdatingSpacesTrackingRef.current = false
      setIsUpdatingSpacesTracking(false)
    }
  }

  return {
    opacity,
    spacesTrackingEnabled,
    isUpdatingSpacesTracking,
    isLiveEditorConfigReady,
    handleOpacityValueChange,
    handleSpacesTrackingChange,
  }
}
