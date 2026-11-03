import type { LiveEditorAPI } from '@corelive/desktop-contract/electron-api'
import {
  LIVE_EDITOR_OPACITY_MAX,
  LIVE_EDITOR_OPACITY_MIN,
} from '@corelive/desktop-contract/live-editor-constants'
import { useEffect, useRef, useState } from 'react'

/** Loads native window preferences and applies opacity/Spaces changes for {@link LiveEditor}.
 * @param isMounted - Hydration guard shared with the editor's host detection.
 * @returns Controlled native settings, readiness, and update handlers.
 * @example useLiveEditorWindowSettings(isMounted)
 */
export function useEditorWindowSettings(
  isMounted: boolean,
  getHost: () => Pick<LiveEditorAPI, 'window' | 'spaces'>,
  preferencesVersion: number | string | null,
  onChanged: () => void,
  onError: (message: string, error: unknown) => void,
) {
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
  useEffect(() => {
    if (!isMounted) return
    let cancelled = false
    const api = getHost()
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
        onError('Failed to load LiveEditor settings', error)
        setIsLiveEditorConfigReady(true)
      })
    return (): void => {
      cancelled = true
    }
  }, [isMounted, preferencesVersion, getHost, onError])

  const handleOpacityChange = async (next: number): Promise<void> => {
    const clamped = Math.max(
      LIVE_EDITOR_OPACITY_MIN,
      Math.min(LIVE_EDITOR_OPACITY_MAX, next),
    )
    setOpacity(clamped)
    try {
      await getHost().window.setOpacity(clamped)
      onChanged()
    } catch (error) {
      onError('Failed to update window opacity', error)
      // Reload the last confirmed native value after a failed optimistic update.
      const restored = await getHost()
        .window.getOpacity()
        .catch(() => opacity)
      setOpacity(restored)
    }
  }

  const handleOpacityValueChange = (values: number[]): void => {
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
      const applied = await getHost().spaces?.setVisibleOnAllWorkspaces(enabled)
      setSpacesTrackingEnabled(applied ?? enabled)
      onChanged()
    } catch (error) {
      setSpacesTrackingEnabled(previous)
      onError('Failed to update desktop tracking', error)
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
