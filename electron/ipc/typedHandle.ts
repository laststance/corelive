import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ZodError } from 'zod'

import type { IPCChannel, IPCChannels } from '../types/ipc'

import { IPC_ARG_SCHEMAS } from './ipc-schemas'
import type { ArgsOf } from './types'

/**
 * Type-safe replacement for `ipcMain.handle(...)`.
 *
 * Enforces the channel contract (`IPCChannels`) at compile-time and applies
 * Zod runtime validation at the main-process boundary (when a schema is registered
 * in `IPC_ARG_SCHEMAS` for the channel).
 *
 * Triggered when: main process receives an `ipcRenderer.invoke(channel, ...args)` call.
 * Called by: each domain's `registerIpcHandlers()` method (e.g. `ConfigManager.registerIpcHandlers`).
 *
 * Why this exists:
 *   Raw `ipcMain.handle` accepts any string channel and returns `unknown`. This wrapper
 *   makes channel names compile-time checked, infers `args` as a typed tuple, and
 *   requires the return type to match `IPCChannels[C]['response']`.
 *
 * @example
 *   // Simple void-arg handler
 *   typedHandle('app-version', () => app.getVersion())
 *
 *   // Single-arg handler
 *   typedHandle('window-state-get', async (_event, target) => {
 *     // target: 'main' | 'floating'
 *     return await windowStateManager.get(target)
 *   })
 *
 *   // Tuple-arg handler (multiple positional args)
 *   typedHandle('window-state-set', async (_event, target, state) => {
 *     // target: 'main' | 'floating'; state: Partial<WindowState>
 *     return await windowStateManager.set(target, state)
 *   })
 */
export function typedHandle<C extends IPCChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: ArgsOf<C>
  ) => Promise<IPCChannels[C]['response']> | IPCChannels[C]['response'],
): void {
  ipcMain.handle(channel, async (event, ...rawArgs) => {
    const schema = IPC_ARG_SCHEMAS[channel]
    let args: unknown[] = rawArgs
    // Only validate when a schema is registered for this channel during migration.
    // Post-migration (Task 16) every channel has a schema and this branch always runs.
    if (schema) {
      try {
        args = schema.parse(rawArgs) as unknown[]
      } catch (e) {
        if (e instanceof ZodError) {
          const detail = e.issues
            .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
            .join(', ')
          throw new Error(`IPC validation failed on '${channel}': ${detail}`)
        }
        throw e
      }
    }
    // Cast is safe: at compile-time the handler signature matches ArgsOf<C>.
    // At runtime Zod has already ensured the shape when a schema is present.
    return (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(
      event,
      ...(args as ArgsOf<C>),
    )
  })
}
