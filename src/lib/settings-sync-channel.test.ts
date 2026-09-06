import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import userSettingsReducer, {
  hydrateUserSettings,
  initialState,
  setLiveEditorClearDelayMs,
  setLiveEditorClearOnComplete,
  setLiveEditorFontFamily,
  setLiveEditorFontSize,
  setLiveEditorTextColor,
  setLiveEditorToastDurationMs,
  setShowCompletedTaskStrikethrough,
  setShowTodayEmber,
} from '@/lib/redux/slices/settingsSlice'
import {
  createUserSettingsSyncMiddleware,
  SETTINGS_SYNC_CHANNEL_NAME,
  SETTINGS_SYNC_EVENT_TYPE,
} from '@/lib/settings-sync-channel'

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
    reducer: { settings: userSettingsReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(
        createUserSettingsSyncMiddleware(),
      ),
  })
}

describe('settings cross-window sync', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel

  beforeEach(() => {
    FakeBroadcastChannel.reset()
    // @ts-expect-error — installing a synchronous test double over the DOM type.
    globalThis.BroadcastChannel = FakeBroadcastChannel
  })

  afterEach(() => {
    globalThis.BroadcastChannel = originalBroadcastChannel
  })

  test('shows and hides Today Ember in an already-open editor when settings change in another window', () => {
    // Arrange
    const settingsWindow = makeWindowStore()
    const editorWindow = makeWindowStore()

    // Act
    settingsWindow.dispatch(setShowTodayEmber(true))

    // Assert
    expect(editorWindow.getState().settings.showTodayEmber).toBe(true)

    // Act
    settingsWindow.dispatch(setShowTodayEmber(false))

    // Assert
    expect(editorWindow.getState().settings.showTodayEmber).toBe(false)
  })

  test('keeps the existing wire identifiers so tabs from the previous release still sync', () => {
    // Arrange / Act — read the deployed protocol identifiers.
    const channelName = SETTINGS_SYNC_CHANNEL_NAME
    const eventType = SETTINGS_SYNC_EVENT_TYPE

    // Assert — changing either literal would isolate already-open app windows.
    expect(channelName).toBe('corelive-preferences-sync')
    expect(eventType).toBe('preferences-sync')
  })

  test('updates completed-history strikethrough in both windows without reloading', () => {
    // Arrange
    const firstWindow = makeWindowStore()
    const secondWindow = makeWindowStore()

    // Act
    firstWindow.dispatch(setShowCompletedTaskStrikethrough(false))

    // Assert
    expect(
      secondWindow.getState().settings.showCompletedTaskStrikethrough,
    ).toBe(false)

    // Act
    secondWindow.dispatch(setShowCompletedTaskStrikethrough(true))

    // Assert
    expect(firstWindow.getState().settings.showCompletedTaskStrikethrough).toBe(
      true,
    )
  })

  test('accepts older windows without restoring retired settings or losing current choices', () => {
    // Arrange
    const receiver = makeWindowStore()
    const sender = new FakeBroadcastChannel(SETTINGS_SYNC_CHANNEL_NAME)

    // Act
    sender.postMessage({
      type: 'preferences-sync',
      state: {
        retainCompletedInList: true,
        completionSound: true,
        soundMoments: { complete: true },
        soundTimbre: 'paper',
        soundVolume: 'corrupt retired value',
        showCompletedTaskStrikethrough: false,
        braindumpFontFamily: 'serif',
        braindumpFontSize: 21,
        braindumpTextColor: '#c2410c',
        braindumpClearOnComplete: true,
        braindumpClearDelayMs: 1200,
        braindumpToastDurationMs: 6400,
      },
    })

    // Assert
    expect(receiver.getState().settings).toEqual({
      showCompletedTaskStrikethrough: false,
      showTodayEmber: false,
      liveEditorFontFamily: 'serif',
      liveEditorFontSize: 21,
      liveEditorTextColor: '#c2410c',
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 1200,
      liveEditorToastDurationMs: 6400,
    })
  })

  test('propagates a LiveEditor font-family change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — switch the editor face away from the default 'mono' in window A.
    windowA.dispatch(setLiveEditorFontFamily('serif'))

    // Assert — window B reflects the chosen face without a reload (the action is
    // in the broadcast allowlist).
    expect(windowB.getState().settings.liveEditorFontFamily).toBe('serif')
  })

  test('propagates a LiveEditor font-size change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — bump the editor size off the default 14px in window A.
    windowA.dispatch(setLiveEditorFontSize(20))

    // Assert — window B reflects the new size without a reload.
    expect(windowB.getState().settings.liveEditorFontSize).toBe(20)
  })

  test('propagates a LiveEditor text-color change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — pick a non-default editor color in window A.
    windowA.dispatch(setLiveEditorTextColor('var(--primary)'))

    // Assert — window B reflects the new color without a reload.
    expect(windowB.getState().settings.liveEditorTextColor).toBe(
      'var(--primary)',
    )
  })

  test('propagates a LiveEditor clear-on-complete toggle to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — opt into clearing finished lines in window A.
    windowA.dispatch(setLiveEditorClearOnComplete(true))

    // Assert — window B reflects the toggle without a reload (the action is in
    // the broadcast allowlist; a NEW set* action would stay silent until added).
    expect(windowB.getState().settings.liveEditorClearOnComplete).toBe(true)
  })

  test('propagates a LiveEditor clear-delay change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — move the linger off the default 500 ms in window A.
    windowA.dispatch(setLiveEditorClearDelayMs(1500))

    // Assert — window B reflects the new delay without a reload (the action is in
    // the broadcast allowlist; a NEW set* action would stay silent until added).
    expect(windowB.getState().settings.liveEditorClearDelayMs).toBe(1500)
  })

  test('propagates a LiveEditor toast-duration change to another window', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — move the completion-toast display time off the default 5000 ms in
    // window A.
    windowA.dispatch(setLiveEditorToastDurationMs(8000))

    // Assert — window B reflects the new duration without a reload (the action is
    // in the broadcast allowlist; a NEW set* action would stay silent until added).
    expect(windowB.getState().settings.liveEditorToastDurationMs).toBe(8000)
  })

  test('clamps and heals out-of-range inbound LiveEditor fields when applying a raw broadcast', () => {
    // Arrange — a window plus a raw sender on the same wire protocol.
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(SETTINGS_SYNC_CHANNEL_NAME)

    // Act — push a payload whose LiveEditor fields are out of range / off-shape.
    sender.postMessage({
      type: SETTINGS_SYNC_EVENT_TYPE,
      state: {
        liveEditorFontFamily: 'comic-sans',
        liveEditorFontSize: 99,
        liveEditorTextColor: 'red',
      },
    })

    // Assert — the receiver applies the HEALED family (the default 'sans'),
    // CLAMPED size (24, the max), and HEALED color (the default token), never
    // the raw 'comic-sans' / 99 / 'red'.
    expect(windowB.getState().settings.liveEditorFontFamily).toBe('sans')
    expect(windowB.getState().settings.liveEditorFontSize).toBe(24)
    expect(windowB.getState().settings.liveEditorTextColor).toBe(
      'var(--foreground)',
    )
  })

  test('preserves every pre-rename LiveEditor preference received from an older window', () => {
    // Arrange — a current window plus a raw sender that still uses v2 keys.
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(SETTINGS_SYNC_CHANNEL_NAME)

    // Act — push all six legacy fields exactly as an already-open old tab does.
    sender.postMessage({
      type: SETTINGS_SYNC_EVENT_TYPE,
      state: {
        braindumpFontFamily: 'serif',
        braindumpFontSize: 21,
        braindumpTextColor: '#c2410c',
        braindumpClearOnComplete: true,
        braindumpClearDelayMs: 1200,
        braindumpToastDurationMs: 6400,
      },
    })

    // Assert — the receiver exposes the exact choices under canonical keys.
    expect(windowB.getState().settings).toMatchObject({
      liveEditorFontFamily: 'serif',
      liveEditorFontSize: 21,
      liveEditorTextColor: '#c2410c',
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 1200,
      liveEditorToastDurationMs: 6400,
    })
  })

  test('ignores a malformed inbound payload, leaving the receiver state unchanged', () => {
    // Arrange
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(SETTINGS_SYNC_CHANNEL_NAME)
    const before = windowB.getState().settings

    // Act — a wrong-typed retained preference must fail validation wholesale.
    sender.postMessage({
      type: SETTINGS_SYNC_EVENT_TYPE,
      state: { showCompletedTaskStrikethrough: 'yes' },
    })

    // Assert — nothing was applied.
    expect(windowB.getState().settings).toEqual(before)
  })

  test('ignores a message with the wrong type tag', () => {
    // Arrange
    const windowB = makeWindowStore()
    const sender = new FakeBroadcastChannel(SETTINGS_SYNC_CHANNEL_NAME)
    const before = windowB.getState().settings

    // Act — a foreign message on the same channel name.
    sender.postMessage({
      type: 'some-other-event',
      state: { showCompletedTaskStrikethrough: false },
    })

    // Assert
    expect(windowB.getState().settings).toEqual(before)
  })

  test('does not re-broadcast an applied snapshot (hydrateUserSettings is the loop guard)', () => {
    // Arrange
    const windowA = makeWindowStore()
    const windowB = makeWindowStore()

    // Act — hydrateUserSettings is the APPLY action, not a user toggle, so it must
    // never trigger an outgoing broadcast (otherwise windows would echo forever).
    windowA.dispatch(
      hydrateUserSettings({
        ...initialState,
        showCompletedTaskStrikethrough: false,
      }),
    )

    // Assert — window B never received it; it keeps its own decoration preference.
    expect(windowB.getState().settings.showCompletedTaskStrikethrough).toBe(
      true,
    )
  })
})
