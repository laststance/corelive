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

/** Registers a sender-independent Mac setting for both Settings IPC and the local app owner.
 * @param ready - The startup phase that must settle before this setting can apply.
 * @example registerNativeSetting('settings:setShowInMenuBar', changeVisibility, trayStartup)
 */
export function registerNativeSetting<C extends Setting>(
  channel: C,
  handler: Handler<C>,
  ready?: Promise<void>,
): void {
  const apply: Handler<C> = ready
    ? async (...args) => {
        await ready
        return handler(...args)
      }
    : handler
  Object.assign(settings, { [channel]: apply })
  typedHandle(channel, async (_event, ...args) => apply(...args))
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
