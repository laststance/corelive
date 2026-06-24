import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createPreferencesSyncMiddleware,
  PREFERENCES_SYNC_CHANNEL_NAME,
  PREFERENCES_SYNC_EVENT_TYPE,
} from '@/lib/preferences-sync-channel'
import preferencesReducer, {
  hydratePreferences,
  initialState,
  setAllSoundMoments,
  setBraindumpClearDelayMs,
  setBraindumpClearOnComplete,
  setBraindumpFontFamily,
  setBraindumpFontSize,
  setBraindumpTextColor,
  setSoundMoment,
  setSoundTimbre,
  setSoundVolume,
} from '@/lib/redux/slices/preferencesSlice'

type ChannelListener = (event: MessageEvent) => void

/**
 * A synchronous in-process BroadcastChannel double: postMessage delivers to every
 * OTHER instance on the same name immediately (never echoing to the sender), so a
 * cross-window apply is observable in the same tick. The real (Node) channel is
 * async and would make these assertions racey; the contract under test — which
 * actions propagate and how inbound payloads are validated — is identical.
 */
class FakeBroadcastChannel {
  private static registry = new Map<string, Set<FakeBroadcastChannel>>()
  private listeners = new Set<ChannelListener>()
  onmessage: ChannelListener | null = null

  constructor(public readonly name: string) {
    const peers = FakeBroadcastChannel.registry.get(name) ?? new Set()
    peers.add(this)
    FakeBroadcastChannel.registry.set(name, peers)
  }

  postMessage(data: unknown): void {
    const peers = FakeBroadcastChannel.registry.get(this.name) ?? new Set()
    for (const peer of peers) {
      // Real BroadcastChannel never delivers a message back to its sender.
      if (peer === this) continue
      const event = new MessageEvent('message', { data })
      peer.listeners.forEach((listener) => listener(event))
      peer.onmessage?.(event)
    }
  }

  addEventListener(type: string, listener: ChannelListener): void {
    if (type === 'message') this.listeners.add(listener)
  }

  removeEventListener(type: string, listener: ChannelListener): void {
    if (type === 'message') this.listeners.delete(listener)
  }

  close(): void {
    FakeBroadcastChannel.registry.get(this.name)?.delete(this)
  }

  static reset(): void {
    FakeBroadcastChannel.registry.clear()
  }
}

/** A fresh store wired with the sync middleware — stands in for one app window. */
function makeWindowStore() {
  return configureStore({
    reducer: { preferences: preferencesReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(
        createPreferencesSyncMiddleware(),
      ),
  })
}

describe('preferences cross-window sync', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel

  beforeEach(() => {
    FakeBroadcastChannel.reset()
    // @ts-expect-error — installing a synchronous test double over the DOM type.
    globalThis.BroadcastChannel = FakeBroadcastChannel
  })

  afterEach(() => {
    globalThis.BroadcastChannel = originalBroadcastChannel
  })

  it('propagates a sound-moment toggle to another window', () => {
    // Arrange — two windows, each with its own store + sync middleware.
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — turn the "clear" cue ON in window A.
    windowA.dispatch(setSoundMoment({ moment: 'clear', enabled: true }))

    // Assert — window B sees the same toggle without a reload.
    expect(windowB.getState().preferences.soundMoments.clear).toBe(true)
  })

  it('propagates a master all-cues toggle to another window', () => {
    // Arrange — two windows, each with its own store + sync middleware.
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — flip every cue ON via the master toggle in window A.
    windowA.dispatch(setAllSoundMoments(true))

    // Assert — window B sees all three cues enabled without a reload.
    expect(windowB.getState().preferences.soundMoments).toEqual({
      'task-create': true,
      complete: true,
      clear: true,
    })
  })

  it('propagates a timbre change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act
    windowA.dispatch(setSoundTimbre('wood'))

    // Assert
    expect(windowB.getState().preferences.soundTimbre).toBe('wood')
  })

  it('propagates a volume change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act
    windowA.dispatch(setSoundVolume(0.25))

    // Assert
    expect(windowB.getState().preferences.soundVolume).toBe(0.25)
  })

  it('propagates a BrainDump font-family change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — switch the editor face away from the default 'mono' in window A.
    windowA.dispatch(setBraindumpFontFamily('serif'))

    // Assert — window B reflects the chosen face without a reload (the action is
    // in the broadcast allowlist).
    expect(windowB.getState().preferences.braindumpFontFamily).toBe('serif')
  })

  it('propagates a BrainDump font-size change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — bump the editor size off the default 14px in window A.
    windowA.dispatch(setBraindumpFontSize(20))

    // Assert — window B reflects the new size without a reload.
    expect(windowB.getState().preferences.braindumpFontSize).toBe(20)
  })

  it('propagates a BrainDump text-color change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — pick a non-default editor color in window A.
    windowA.dispatch(setBraindumpTextColor('var(--primary)'))

    // Assert — window B reflects the new color without a reload.
    expect(windowB.getState().preferences.braindumpTextColor).toBe(
      'var(--primary)',
    )
  })

  it('propagates a BrainDump clear-on-complete toggle to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — opt into clearing finished lines in window A.
    windowA.dispatch(setBraindumpClearOnComplete(true))

    // Assert — window B reflects the toggle without a reload (the action is in
    // the broadcast allowlist; a NEW set* action would stay silent until added).
    expect(windowB.getState().preferences.braindumpClearOnComplete).toBe(true)
  })

  it('propagates a BrainDump clear-delay change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — move the linger off the default 500 ms in window A.
    windowA.dispatch(setBraindumpClearDelayMs(1500))

    // Assert — window B reflects the new delay without a reload (the action is in
    // the broadcast allowlist; a NEW set* action would stay silent until added).
    expect(windowB.getState().preferences.braindumpClearDelayMs).toBe(1500)
  })

  it('clamps an out-of-range inbound volume when applying a raw broadcast', () => {
    // Arrange — a window plus a raw sender on the same wire protocol.
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(PREFERENCES_SYNC_CHANNEL_NAME)

    // Act — push a payload whose volume is well above the [0,1] range.
    sender.postMessage({
      type: PREFERENCES_SYNC_EVENT_TYPE,
      state: { soundVolume: 50 },
    })

    // Assert — the receiver applies the CLAMPED value, never the raw 50.
    expect(windowB.getState().preferences.soundVolume).toBe(1)
  })

  it('clamps and heals out-of-range inbound BrainDump fields when applying a raw broadcast', () => {
    // Arrange — a window plus a raw sender on the same wire protocol.
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(PREFERENCES_SYNC_CHANNEL_NAME)

    // Act — push a payload whose BrainDump fields are out of range / off-shape.
    sender.postMessage({
      type: PREFERENCES_SYNC_EVENT_TYPE,
      state: {
        braindumpFontFamily: 'comic-sans',
        braindumpFontSize: 99,
        braindumpTextColor: 'red',
      },
    })

    // Assert — the receiver applies the HEALED family (the default 'mono'),
    // CLAMPED size (24, the max), and HEALED color (the default token), never
    // the raw 'comic-sans' / 99 / 'red'.
    expect(windowB.getState().preferences.braindumpFontFamily).toBe('mono')
    expect(windowB.getState().preferences.braindumpFontSize).toBe(24)
    expect(windowB.getState().preferences.braindumpTextColor).toBe(
      'var(--foreground)',
    )
  })

  it('folds a legacy-only inbound payload so the completion cue is not silently lost', () => {
    // Arrange — a window plus a raw sender posting a pre-palette snapshot that
    // carries ONLY the legacy completionSound flag (no soundMoments at all),
    // exactly what an old cached web tab on the same origin would broadcast.
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(PREFERENCES_SYNC_CHANNEL_NAME)

    // Act — push the cross-version legacy payload.
    sender.postMessage({
      type: PREFERENCES_SYNC_EVENT_TYPE,
      state: { completionSound: true },
    })

    // Assert — the legacy "completion sound ON" intent survives as complete:true
    // instead of being defaulted to false by the schema (the fold mirrors the
    // persisted migratePersistedState path).
    expect(windowB.getState().preferences.soundMoments.complete).toBe(true)
  })

  it('ignores a malformed inbound payload, leaving the receiver state unchanged', () => {
    // Arrange
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(PREFERENCES_SYNC_CHANNEL_NAME)
    const before = windowB.getState().preferences

    // Act — a wrong-typed volume must fail validation wholesale.
    sender.postMessage({
      type: PREFERENCES_SYNC_EVENT_TYPE,
      state: { soundVolume: 'loud' },
    })

    // Assert — nothing was applied.
    expect(windowB.getState().preferences).toEqual(before)
  })

  it('ignores a message with the wrong type tag', () => {
    // Arrange
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(PREFERENCES_SYNC_CHANNEL_NAME)
    const before = windowB.getState().preferences

    // Act — a foreign message on the same channel name.
    sender.postMessage({
      type: 'some-other-event',
      state: { soundTimbre: 'paper' },
    })

    // Assert
    expect(windowB.getState().preferences).toEqual(before)
  })

  it('does not re-broadcast an applied snapshot (hydratePreferences is the loop guard)', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — hydratePreferences is the APPLY action, not a user toggle, so it must
    // never trigger an outgoing broadcast (otherwise windows would echo forever).
    windowA.dispatch(
      hydratePreferences({ ...initialState, soundTimbre: 'paper' }),
    )

    // Assert — window B never received it; it keeps its own default timbre.
    expect(windowB.getState().preferences.soundTimbre).toBe('felt')
  })
})
