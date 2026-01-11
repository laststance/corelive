/**
 * @fileoverview Type-safe IPC utilities for Electron main process.
 *
 * Provides helper functions for creating type-safe IPC handlers and
 * sending events to renderer processes.
 *
 * @module electron/utils/typedIPC
 * @example
 * ```typescript
 * import { handleIPC, sendToRenderer } from './utils/typedIPC'
 *
 * // Register a type-safe handler
 * handleIPC('auth-get-user', async () => {
 *   return authManager.getCurrentUser()
 * })
 *
 * // Send event to renderer
 * sendToRenderer(mainWindow, 'oauth-success', { success: true, provider: 'google' })
 * ```
 */

import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import type {
  IPCChannel,
  IPCRequest,
  IPCResponse,
  IPCEventChannel,
  IPCEventData,
} from '../types/ipc'

/**
 * Register a type-safe IPC handler.
 *
 * @param channel - IPC channel name
 * @param handler - Handler function with typed request/response
 * @example
 * ```typescript
 * handleIPC('auth-get-user', async () => {
 *   return authManager.getCurrentUser() // Must return ElectronUser | null
 * })
 *
 * handleIPC('auth-set-user', async (event, user) => {
 *   return authManager.setUser(user) // user is typed as ElectronUser
 * })
 * ```
 */
export function handleIPC<C extends IPCChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IPCRequest<C> extends void
      ? []
      : IPCRequest<C> extends unknown[]
        ? IPCRequest<C>
        : [IPCRequest<C>]
  ) => Promise<IPCResponse<C>> | IPCResponse<C>,
): void {
  ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1])
}

/**
 * Remove an IPC handler.
 *
 * @param channel - IPC channel name to remove handler for
 * @example
 * ```typescript
 * removeIPCHandler('auth-get-user')
 * ```
 */
export function removeIPCHandler<C extends IPCChannel>(channel: C): void {
  ipcMain.removeHandler(channel)
}

/**
 * Send an event to a specific renderer window.
 *
 * @param window - Target BrowserWindow
 * @param channel - Event channel name
 * @param data - Event data (type-checked)
 * @example
 * ```typescript
 * sendToRenderer(mainWindow, 'oauth-success', {
 *   success: true,
 *   provider: 'google',
 *   token: 'abc123'
 * })
 * ```
 */
export function sendToRenderer<C extends IPCEventChannel>(
  window: BrowserWindow,
  channel: C,
  data: IPCEventData<C>,
): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data)
  }
}

/**
 * Send an event to all open windows.
 *
 * @param windows - Array of BrowserWindows
 * @param channel - Event channel name
 * @param data - Event data (type-checked)
 * @example
 * ```typescript
 * broadcastToRenderers([mainWindow, floatingWindow], 'auth-state-changed', {
 *   isAuthenticated: true,
 *   user: currentUser
 * })
 * ```
 */
export function broadcastToRenderers<C extends IPCEventChannel>(
  windows: BrowserWindow[],
  channel: C,
  data: IPCEventData<C>,
): void {
  for (const window of windows) {
    sendToRenderer(window, channel, data)
  }
}

/**
 * Create a wrapped IPC handler with error handling.
 *
 * @param channel - IPC channel name
 * @param handler - Handler function
 * @param options - Error handling options
 * @returns Wrapped handler function
 * @example
 * ```typescript
 * const handler = createSafeHandler('auth-get-user', async () => {
 *   return authManager.getCurrentUser()
 * }, { fallback: null })
 *
 * ipcMain.handle('auth-get-user', handler)
 * ```
 */
export function createSafeHandler<C extends IPCChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IPCRequest<C> extends void
      ? []
      : IPCRequest<C> extends unknown[]
        ? IPCRequest<C>
        : [IPCRequest<C>]
  ) => Promise<IPCResponse<C>> | IPCResponse<C>,
  options: {
    /** Fallback value to return on error */
    fallback?: IPCResponse<C>
    /** Log errors (default: true) */
    logErrors?: boolean
    /** Re-throw errors after logging (default: false) */
    rethrow?: boolean
  } = {},
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<IPCResponse<C>> {
  const { fallback, logErrors = true, rethrow = false } = options

  return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      return await (
        handler as (
          event: IpcMainInvokeEvent,
          ...args: unknown[]
        ) => Promise<IPCResponse<C>>
      )(event, ...args)
    } catch (error) {
      if (logErrors) {
        console.error(`[IPC] Error in handler for '${channel}':`, error)
      }
      if (rethrow) {
        throw error
      }
      return fallback as IPCResponse<C>
    }
  }
}
