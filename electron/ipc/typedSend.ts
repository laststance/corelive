import type { WebContents } from 'electron'

import type { IPCEventChannel, IPCEventChannels } from '../types/ipc'

/**
 * Type-safe replacement for `webContents.send(channel, payload)` when broadcasting
 * one-way events from main process → renderer.
 *
 * Enforces that `channel` is a registered `IPCEventChannel` and `payload` matches
 * `IPCEventChannels[C]`. Events with `void` payload require no argument.
 *
 * Triggered when: main process needs to notify renderer of an async event
 * (e.g., auth state change, update downloaded, OAuth completed).
 * Called by: managers that emit events (AutoUpdater, OAuthManager, AuthManager, ShortcutManager, DeepLinkManager).
 *
 * Why this exists:
 *   Raw `sender.send(channel, payload)` accepts any string + any payload. This wrapper
 *   makes event names compile-time checked and payload types mandatory.
 *
 *   Also: `sender.isDestroyed()` guard — calling `send` on a destroyed window throws.
 *   We silently no-op instead, since events to a closed window are inherently lost.
 *
 * @example
 *   // Event with payload
 *   typedSend(mainWindow.webContents, 'auth-state-changed', {
 *     isAuthenticated: true,
 *     user: electronUser,
 *   })
 *
 *   // Void-payload event
 *   typedSend(mainWindow.webContents, 'window-focus')
 */
export function typedSend<C extends IPCEventChannel>(
  sender: WebContents,
  channel: C,
  ...payload: IPCEventChannels[C] extends void ? [] : [IPCEventChannels[C]]
): void {
  if (sender.isDestroyed()) return
  sender.send(channel, ...payload)
}
