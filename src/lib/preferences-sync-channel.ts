import type { Middleware } from '@reduxjs/toolkit'

import {
  hydratePreferences,
  type PreferencesState,
} from '@/lib/redux/slices/preferencesSlice'

const PREFERENCES_SYNC_CHANNEL_NAME = 'corelive-preferences-sync'
const PREFERENCES_SYNC_EVENT_TYPE = 'preferences-sync'

type PreferencesSyncMessage = Readonly<{
  type: typeof PREFERENCES_SYNC_EVENT_TYPE
  state: PreferencesState
}>

// The local, user-initiated toggles that should propagate to other windows.
// hydratePreferences is deliberately excluded so an applied broadcast never
// re-broadcasts (the loop guard).
const BROADCASTABLE_ACTION_TYPES = new Set<string>([
  'preferences/setCompletionSound',
  'preferences/setRetainCompletedInList',
])

/**
 * True only in a browser runtime that supports BroadcastChannel (not SSR).
 * @returns Whether cross-window preference sync can run.
 */
const isBrowserWithChannel = (): boolean =>
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'

/**
 * Narrows an unknown BroadcastChannel payload to a preferences-sync message.
 * @param data - The raw `event.data` from the channel.
 * @returns Whether `data` is a well-formed preferences-sync message.
 * @example
 * isPreferencesSyncMessage({ type: 'preferences-sync', state: {...} }) // => true
 */
const isPreferencesSyncMessage = (
  data: unknown,
): data is PreferencesSyncMessage => {
  if (typeof data !== 'object' || data === null) return false
  const message = data as Partial<PreferencesSyncMessage>
  if (message.type !== PREFERENCES_SYNC_EVENT_TYPE) return false
  // Validate the inner preference fields, not just that `state` is an object: a
  // malformed channel payload (e.g. `completionSound: 'yes'`) would otherwise be
  // hydrated into Redux and persisted, since the selectors only coalesce
  // null/undefined and would let non-boolean junk through unchanged.
  const state = message.state as Partial<PreferencesState> | undefined
  return (
    typeof state === 'object' &&
    state !== null &&
    typeof state.completionSound === 'boolean' &&
    typeof state.retainCompletedInList === 'boolean'
  )
}

/**
 * Creates Redux middleware that mirrors local preference changes to other
 * windows/tabs over a BroadcastChannel and applies preferences received from
 * them. Why: each window owns its own Redux store + localStorage, so without
 * this a toggle in window A would not reach window B (web, Electron, Floating)
 * until a reload. Loop-free: a received snapshot is applied via
 * hydratePreferences (NOT a broadcastable action), and only the user-initiated
 * set* toggles trigger an outgoing broadcast. No-ops on the server / where
 * BroadcastChannel is unavailable.
 *
 * @returns Redux middleware to concat into the store's middleware chain.
 * @returns
 * - In a browser: a middleware that broadcasts set* toggles and applies inbound snapshots
 * - On the server / unsupported runtime: a transparent pass-through middleware
 * @example
 * configureStore({
 *   middleware: (gdm) => gdm().concat(createPreferencesSyncMiddleware()),
 * })
 */
export const createPreferencesSyncMiddleware = (): Middleware => {
  // No channel on the server (SSR) or in unsupported runtimes — pass through.
  if (!isBrowserWithChannel()) {
    return () => (next) => (action) => next(action)
  }

  const channel = new BroadcastChannel(PREFERENCES_SYNC_CHANNEL_NAME)

  return (store) => {
    // Apply preferences pushed from another window. hydratePreferences is not a
    // broadcastable action, so this never bounces back out (no echo loop).
    channel.addEventListener('message', (event: MessageEvent) => {
      if (isPreferencesSyncMessage(event.data)) {
        store.dispatch(hydratePreferences(event.data.state))
      }
    })

    return (next) => (action) => {
      const result = next(action)
      // Broadcast only the local, user-initiated set* toggles, carrying the
      // resulting full preferences snapshot so receivers apply an exact copy.
      if (
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        typeof action.type === 'string' &&
        BROADCASTABLE_ACTION_TYPES.has(action.type)
      ) {
        const { preferences } = store.getState() as {
          preferences: PreferencesState
        }
        channel.postMessage({
          type: PREFERENCES_SYNC_EVENT_TYPE,
          state: preferences,
        } satisfies PreferencesSyncMessage)
      }
      return result
    }
  }
}
