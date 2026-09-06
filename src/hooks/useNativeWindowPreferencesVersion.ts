import { useSyncExternalStore } from 'react'

import { NATIVE_WINDOW_PREFERENCES_STORAGE_KEY } from '@/lib/live-editor/constants'
import { createLocalId } from '@/lib/live-editor/createLocalId'
import { createLocalStorageSlot } from '@/lib/live-editor/localStorageSlot'

const slot = createLocalStorageSlot(NATIVE_WINDOW_PREFERENCES_STORAGE_KEY)
let publishedMarker: string | null = null
let receivedMarker: string | null = null

/** Subscribes consumers to other windows' saves while the saving control retains its confirmed setter result.
 * @param listener - React's external-store update callback.
 * @returns Cleanup for the shared storage subscription.
 * @example const unsubscribe = subscribeToRemotePreferences(listener)
 */
function subscribeToRemotePreferences(listener: () => void): () => void {
  return slot.subscribe(() => {
    const marker = slot.read()
    // A local save already updated its control; only peers need another native read.
    if (marker === publishedMarker) return
    receivedMarker = marker
    listener()
  })
}

/** Notifies open native settings controls after a confirmed save; values remain authoritative in the main process.
 * @returns Nothing; other windows reload their native preferences.
 * @example notifyNativeWindowPreferencesChanged()
 */
export function notifyNativeWindowPreferencesChanged(): void {
  publishedMarker = createLocalId()
  slot.write(publishedMarker)
}

/** Re-renders native preference consumers when another control saves, using the existing cross-window storage subscription.
 * @returns A stable change marker, or null before any save and during SSR.
 * @example const preferencesVersion = useNativeWindowPreferencesVersion()
 */
export function useNativeWindowPreferencesVersion(): string | null {
  return useSyncExternalStore(
    subscribeToRemotePreferences,
    () => receivedMarker,
    () => null,
  )
}
