import type { WebContents } from 'electron'

import type { IPCEventChannel, IPCEventChannels } from '../types/ipc'

/**
 * Type-safe replacement for `webContents.send(channel, payload)` when broadcasting
 * one-way events from main process → renderer.
 *
 * Enforces that `channel` is a registered `IPCEventChannel` and `payload` matches
 * `IPCEventChannels[C]`. Events with `void` payload require no argument.
 *
 * Triggered when: the main process needs to notify the renderer of an async event.
 * Called by: {@link OAuthManager}, the only remaining event emitter.
 *
 * Why this exists:
 *   Raw `sender.send(channel, payload)` accepts any string + any payload. This wrapper
 *   makes event names compile-time checked and payload types mandatory.
 *
 *   Also: `sender.isDestroyed()` guard — calling `send` on a destroyed window throws.
 *   We silently no-op instead, since events to a closed window are inherently lost.
 *
 * @example
 *   typedSend(initiator, 'oauth-error', { error: 'access_denied' })
 */
export function typedSend<C extends IPCEventChannel>(
  sender: WebContents,
  channel: C,
  ...payload: IPCEventChannels[C] extends void ? [] : [IPCEventChannels[C]]
): void {
  if (sender.isDestroyed()) return
  sender.send(channel, ...payload)
}
