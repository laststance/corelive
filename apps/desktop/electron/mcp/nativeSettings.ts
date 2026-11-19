import type { IPCChannels } from '@corelive/desktop-contract/ipc'

import { typedHandle } from '../ipc/typedHandle'
import type { ArgsOf } from '../ipc/types'

type Setting =
  | 'live-editor-config-set-shortcut'
  | 'live-editor-config-set-shortcut-secondary'
  | 'settings:setHideAppIcon'
  | 'settings:setShowInMenuBar'
  | 'settings:setStartAtLogin'
  | 'config-open'
type Handler<C extends Setting> = (
  ...args: ArgsOf<C>
) => IPCChannels[C]['response'] | Promise<IPCChannels[C]['response']>
const settings: Partial<{ [C in Setting]: Handler<C> }> = {}

/** Registers a sender-independent Mac setting once for both its existing Settings IPC and the local app owner.
 * @example registerNativeSetting('settings:setStartAtLogin', enabled => updateLoginItem(enabled))
 */
export function registerNativeSetting<C extends Setting>(
  channel: C,
  handler: Handler<C>,
): void {
  Object.assign(settings, { [channel]: handler })
  typedHandle(channel, async (_event, ...args) => handler(...args))
}

/** Invokes an explicitly supported Mac setting using its ordinary UI implementation.
 * @example await applyNativeSetting('settings:setStartAtLogin',true)
 */
export async function applyNativeSetting<C extends Setting>(
  channel: C,
  ...args: ArgsOf<C>
): Promise<IPCChannels[C]['response']> {
  const handler = settings[channel]
  if (!handler) throw new Error('settings-unavailable')
  return handler(...args)
}
