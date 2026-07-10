import type { Middleware } from '@reduxjs/toolkit'

import { foldLegacyCompletionSoundIntoMoments } from '@/lib/redux/foldLegacyCompletionSoundIntoMoments'
import {
  hydrateUserSettings,
  setAllSoundMoments,
  setBraindumpClearDelayMs,
  setBraindumpClearOnComplete,
  setBraindumpFontFamily,
  setBraindumpFontSize,
  setBraindumpTextColor,
  setBraindumpToastDurationMs,
  setCompletionSound,
  setRetainCompletedInList,
  setSoundMoment,
  setSoundTimbre,
  setSoundVolume,
} from '@/lib/redux/slices/settingsSlice'
import {
  type UserSettingsState,
  UserSettingsStateSchema,
} from '@/lib/schemas/settings'

// Keep the v1 wire values so tabs loaded before a deploy still exchange state.
// Only the public constants and application domain move to Settings.
export const SETTINGS_SYNC_CHANNEL_NAME = 'corelive-preferences-sync'
export const SETTINGS_SYNC_EVENT_TYPE = 'preferences-sync'

type UserSettingsSyncMessage = Readonly<{
  type: typeof SETTINGS_SYNC_EVENT_TYPE
  state: UserSettingsState
}>

// The local, user-initiated toggles that should propagate to other windows.
// hydrateUserSettings is deliberately excluded so an applied broadcast never
// re-broadcasts (the loop guard). Referenced via each action creator's `.type`
// (RTK sets it to `'settings/<name>'`) instead of hardcoded strings, so a
// reducer rename can't silently desync this set. Still a MANUAL allowlist of
// WHICH actions broadcast — a NEW set* action stays silent cross-window until
// added here (the Zod schema validates payloads but does NOT decide which
// actions broadcast).
const BROADCASTABLE_ACTION_TYPES = new Set<string>([
  setCompletionSound.type,
  setRetainCompletedInList.type,
  setSoundMoment.type,
  setAllSoundMoments.type,
  setSoundTimbre.type,
  setSoundVolume.type,
  setBraindumpFontFamily.type,
  setBraindumpFontSize.type,
  setBraindumpTextColor.type,
  setBraindumpClearOnComplete.type,
  setBraindumpClearDelayMs.type,
  setBraindumpToastDurationMs.type,
])

/**
 * True only in a browser runtime that supports BroadcastChannel (not SSR).
 * @returns Whether cross-window setting sync can run.
 */
const isBrowserWithChannel = (): boolean =>
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'

/**
 * Narrows an unknown BroadcastChannel payload to a settings-sync ENVELOPE
 * (correct type tag + a `state` field); the inner state is validated separately
 * by the Zod schema so this only confirms the wrapper, not the setting values.
 * @param data - The raw `event.data` from the channel.
 * @returns Whether `data` is a settings-sync envelope.
 * @example
 * isUserSettingsSyncEnvelope({ type: SETTINGS_SYNC_EVENT_TYPE, state: {...} }) // => true
 */
const isUserSettingsSyncEnvelope = (
  data: unknown,
): data is { type: typeof SETTINGS_SYNC_EVENT_TYPE; state: unknown } => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === SETTINGS_SYNC_EVENT_TYPE &&
    'state' in data
  )
}

/**
 * Creates Redux middleware that mirrors local setting changes to other
 * windows/tabs over a BroadcastChannel and applies settings received from
 * them. Why: each window owns its own Redux store + localStorage, so without
 * this a toggle in window A would not reach window B (web, Electron, Floating)
 * until a reload. Loop-free: a received snapshot is applied via
 * hydrateUserSettings (NOT a broadcastable action), and only the user-initiated
 * set* toggles trigger an outgoing broadcast. No-ops on the server / where
 * BroadcastChannel is unavailable.
 *
 * @returns
 * - In a browser: a middleware that broadcasts set* toggles and applies inbound snapshots
 * - On the server / unsupported runtime: a transparent pass-through middleware
 * @example
 * configureStore({
 *   middleware: (gdm) => gdm().concat(createUserSettingsSyncMiddleware()),
 * })
 */
export const createUserSettingsSyncMiddleware = (): Middleware<
  {},
  { settings: UserSettingsState }
> => {
  // No channel on the server (SSR) or in unsupported runtimes — pass through.
  if (!isBrowserWithChannel()) {
    return () => (next) => (action) => next(action)
  }

  const channel = new BroadcastChannel(SETTINGS_SYNC_CHANNEL_NAME)

  return (store) => {
    // Apply settings pushed from another window. hydrateUserSettings is not a
    // broadcastable action, so this never bounces back out (no echo loop).
    channel.addEventListener('message', (event: MessageEvent) => {
      if (!isUserSettingsSyncEnvelope(event.data)) return
      // Validate + coalesce the inbound state through the Zod SSoT: a legacy
      // payload is accepted with new fields defaulted, an out-of-range
      // soundVolume is CLAMPED, and malformed junk (wrong types) is rejected
      // wholesale. Dispatch the PARSED snapshot so we never persist raw,
      // out-of-range, or partial data into Redux.
      const parsed = UserSettingsStateSchema.safeParse(event.data.state)
      if (parsed.success) {
        // A cross-version inbound payload (e.g. an old cached web tab on the
        // same origin) may carry only the legacy `completionSound:true` with no
        // `soundMoments`; the schema would default `complete` to false and drop
        // that intent. Fold the legacy flag in first — mirrors the persisted
        // migratePersistedState path so inbound and on-disk legacy agree.
        const foldedMoments = foldLegacyCompletionSoundIntoMoments(
          event.data.state,
        )
        const nextSettings =
          foldedMoments === undefined
            ? parsed.data
            : { ...parsed.data, soundMoments: foldedMoments }
        store.dispatch(hydrateUserSettings(nextSettings))
      }
    })

    return (next) => (action) => {
      const result = next(action)
      // Broadcast only the local, user-initiated set* toggles, carrying the
      // resulting full settings snapshot so receivers apply an exact copy.
      if (
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        typeof action.type === 'string' &&
        BROADCASTABLE_ACTION_TYPES.has(action.type)
      ) {
        const { settings } = store.getState()
        channel.postMessage({
          type: SETTINGS_SYNC_EVENT_TYPE,
          state: settings,
        } satisfies UserSettingsSyncMessage)
      }
      return result
    }
  }
}
