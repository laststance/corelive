/**
 * @fileoverview Cross-window "open the Completed paste-import dialog" intent
 * channel (Issue #53, PR2 · D7). The Floating Navigator lives in a separate
 * Electron BrowserWindow, so its Import button cannot directly toggle the main
 * window's dialog state. It calls the preload `focusMainWindow()` IPC to surface
 * the main window AND broadcasts this intent; the main-window Completed entry
 * subscribes and opens the dialog. Mirrors `todo-sync-channel` (BroadcastChannel
 * crosses Electron windows in this app) — no new Electron IPC plumbing.
 *
 * @module lib/paste-import-channel
 */

const PASTE_IMPORT_CHANNEL_NAME = 'corelive-paste-import-intent'
const OPEN_COMPLETED_IMPORT_EVENT = 'open-completed-import'

type PasteImportIntentMessage = Readonly<{
  type: typeof OPEN_COMPLETED_IMPORT_EVENT
}>

/**
 * Whether BroadcastChannel-based cross-window intents are supported here.
 * @returns
 * - `true` in a browser/Electron-renderer context with BroadcastChannel
 * - `false` during SSR or in an unsupported runtime
 * @example
 * isPasteImportChannelSupported() // => true
 */
const isPasteImportChannelSupported = (): boolean => {
  return (
    typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  )
}

/**
 * Creates the intent channel, or null when unsupported.
 * @returns A BroadcastChannel, or `null`.
 */
const createPasteImportChannel = (): BroadcastChannel | null => {
  if (!isPasteImportChannelSupported()) return null
  return new BroadcastChannel(PASTE_IMPORT_CHANNEL_NAME)
}

/**
 * Narrows an unknown payload to the open-Completed-import intent.
 * @param data - Payload received on the channel.
 * @returns `true` when it is the open-import intent.
 */
const isPasteImportIntentMessage = (
  data: unknown,
): data is PasteImportIntentMessage => {
  if (typeof data !== 'object' || data === null) return false
  return (data as PasteImportIntentMessage).type === OPEN_COMPLETED_IMPORT_EVENT
}

/**
 * Broadcasts the intent to open the Completed paste-import dialog in the main
 * window. Called by the Floating Navigator's Import button (alongside
 * `focusMainWindow()`).
 * @returns
 * - `true` when the intent was broadcast
 * - `false` when BroadcastChannel is unavailable
 * @example
 * requestOpenCompletedImport() // => true
 */
export const requestOpenCompletedImport = (): boolean => {
  const channel = createPasteImportChannel()
  if (!channel) return false
  channel.postMessage({
    type: OPEN_COMPLETED_IMPORT_EVENT,
  } satisfies PasteImportIntentMessage)
  channel.close()
  return true
}

/**
 * Subscribes to open-Completed-import intents (only the main-window Completed
 * entry should call this).
 * @param onOpenIntent - Invoked when an open-import intent arrives.
 * @returns Cleanup that removes the listener and closes the channel.
 * @example
 * const cleanup = subscribeToOpenCompletedImport(() => setOpen(true))
 * cleanup()
 */
export const subscribeToOpenCompletedImport = (
  onOpenIntent: () => void,
): (() => void) => {
  const channel = createPasteImportChannel()
  if (!channel) return () => {}

  const handleMessage = (event: MessageEvent) => {
    if (isPasteImportIntentMessage(event.data)) onOpenIntent()
  }

  channel.addEventListener('message', handleMessage)
  return () => {
    channel.removeEventListener('message', handleMessage)
    channel.close()
  }
}
