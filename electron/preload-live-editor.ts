/**
 * @fileoverview Preload script for LiveEditor Note window.
 *
 * The LiveEditor window loads `https://corelive.app/live-editor` and uses oRPC
 * (via the web app) for promoting the note to a `Completed` row. This preload
 * exposes only:
 * - Window controls (close/minimize/opacity/bounds) for the frameless panel
 * - Per-category note text persistence (`live-editor-note-*`)
 * - Local config (sync mode, shortcut, last-category) used by Settings UI
 * - Shared Spaces tracking for LiveEditor + Floating Navigator utility panels
 * - One inbound event (`live-editor-category-changed`) to mirror FloatingNav
 *
 * Why a separate preload:
 *   - The window is frameless + transparent + always-on-top; it ships its own
 *     minimal API surface so the main `preload.ts` (~50 channels) does not
 *     leak into a high-trust panel.
 *   - Channel whitelist is intentionally narrow (defense-in-depth alongside
 *     `IPC_ARG_SCHEMAS` validation in the main process).
 *
 * @module electron/preload-live-editor
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import { typedInvoke } from './ipc/typedInvoke'
import { log } from './logger'
import type { WindowBounds as IPCWindowBounds } from './types/ipc'

// ============================================================================
// Type Definitions
// ============================================================================

/** Allowed channels map */
type AllowedChannelsMap = Record<string, boolean>

/** Sanitized data type */
type SanitizedValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SanitizedValue[]
  | { [key: string]: SanitizedValue }

// ============================================================================
// Allowed Channels (inbound events only — invokes are gated by `typedInvoke`)
// ============================================================================

/**
 * Inbound event whitelist for the LiveEditor window.
 *
 * Why narrow: the only push the renderer needs is the FloatingNav category
 * change broadcast — everything else is pull-based via `typedInvoke`.
 */
const ALLOWED_CHANNELS: AllowedChannelsMap = {
  'live-editor-category-changed': true,
  'braindump-category-changed': true,
}

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Validate channel name against the whitelist before subscribing.
 *
 * @param channel - Channel name to validate
 * @returns True if the channel is in the whitelist
 */
function validateChannel(channel: string): boolean {
  return ALLOWED_CHANNELS[channel] === true
}

/**
 * Sanitize event payloads to strip potential prototype-pollution shapes and
 * trim incoming strings.
 *
 * @param data - Data to sanitize
 * @returns Sanitized data (same shape)
 */
function sanitizeData<T>(data: T): T {
  if (typeof data === 'string') {
    return data.trim() as T
  }
  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      return data.map((item) => sanitizeData(item)) as T
    }
    const sanitized: Record<string, SanitizedValue> = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        sanitized[key] = value.trim()
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value
      } else if (value === null || value === undefined) {
        sanitized[key] = value
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) => sanitizeData(item))
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeData(value)
      }
    }
    return sanitized as T
  }
  return data
}

// ============================================================================
// Exposed API
// ============================================================================

/**
 * LiveEditor-only API surface, exposed at `window.liveEditorAPI`.
 *
 * Renderer usage:
 * @example
 * await window.liveEditorAPI.window.setOpacity(0.85)
 * const followsSpaces = await window.liveEditorAPI.spaces.getVisibleOnAllWorkspaces()
 * const text = await window.liveEditorAPI.note.get(42)
 * const cleanup = window.liveEditorAPI.on('live-editor-category-changed', handler)
 */
const liveEditorAPI = {
  window: {
    /** Hide the LiveEditor window (it stays in memory for fast re-show). */
    close: async (): Promise<void> => {
      try {
        await typedInvoke('live-editor-window-hide')
      } catch (error) {
        log.error('LiveEditor: Failed to close window:', error)
      }
    },

    /** Toggle LiveEditor visibility (mirror of the global accelerator). */
    toggle: async (): Promise<void> => {
      try {
        await typedInvoke('live-editor-window-toggle')
      } catch (error) {
        log.error('LiveEditor: Failed to toggle window:', error)
      }
    },

    /**
     * Set window opacity. Main process clamps to [0.30, 1.00] regardless.
     *
     * @param value - Desired opacity in [0, 1]; out-of-band values are clamped.
     */
    setOpacity: async (value: number): Promise<void> => {
      try {
        await typedInvoke('live-editor-window-set-opacity', value)
      } catch (error) {
        log.error('LiveEditor: Failed to set opacity:', error)
      }
    },

    /** Get current window opacity (already clamped). */
    getOpacity: async (): Promise<number> => {
      try {
        return await typedInvoke('live-editor-window-get-opacity')
      } catch (error) {
        log.error('LiveEditor: Failed to get opacity:', error)
        return 1
      }
    },

    /** Get current window bounds, or null if window is gone. */
    getBounds: async (): Promise<IPCWindowBounds | null> => {
      try {
        return await typedInvoke('live-editor-window-get-bounds')
      } catch (error) {
        log.error('LiveEditor: Failed to get window bounds:', error)
        return null
      }
    },

    /** Set window bounds (also persisted via WindowStateManager). */
    setBounds: async (bounds: IPCWindowBounds): Promise<void> => {
      try {
        await typedInvoke('live-editor-window-set-bounds', bounds)
      } catch (error) {
        log.error('LiveEditor: Failed to set window bounds:', error)
      }
    },
  },

  note: {
    /**
     * Read the persisted note text for a category.
     *
     * @param categoryId - Numeric category id (matches FloatingNav selection).
     * @returns The persisted text, or empty string when no note exists yet.
     */
    get: async (categoryId: number): Promise<string> => {
      try {
        return await typedInvoke('live-editor-note-get', categoryId)
      } catch (error) {
        // Re-throw so the renderer can avoid treating a failed disk read as an
        // intentionally empty note; swallowing this can overwrite real content.
        log.error('LiveEditor: Failed to read note:', error)
        throw error
      }
    },

    /**
     * Persist note text for a category. Writes are debounced in the renderer.
     *
     * @param categoryId - Numeric category id.
     * @param text - Note text to persist (no length cap; per-category storage).
     */
    set: async (categoryId: number, text: string): Promise<void> => {
      try {
        await typedInvoke('live-editor-note-set', categoryId, text)
      } catch (error) {
        // Re-throw so the renderer can detect persistence failure and
        // surface it (toast/retry); silent resolution would mask data loss.
        log.error('LiveEditor: Failed to write note:', error)
        throw error
      }
    },
  },

  sync: {
    /** Read the "follow FloatingNav category" toggle. */
    getEnabled: async (): Promise<boolean> => {
      try {
        return await typedInvoke('live-editor-config-get-sync')
      } catch (error) {
        log.error('LiveEditor: Failed to get sync mode:', error)
        return true
      }
    },

    /** Update the "follow FloatingNav category" toggle. */
    setEnabled: async (enabled: boolean): Promise<void> => {
      try {
        await typedInvoke('live-editor-config-set-sync', enabled)
      } catch (error) {
        log.error('LiveEditor: Failed to set sync mode:', error)
      }
    },
  },

  category: {
    /**
     * Read the last-active category id (used to restore state after re-open).
     *
     * @returns The persisted category id, or null when never set.
     */
    getLast: async (): Promise<number | null> => {
      try {
        return await typedInvoke('live-editor-config-get-last-category')
      } catch (error) {
        log.error('LiveEditor: Failed to get last category:', error)
        return null
      }
    },

    /**
     * Persist the active category id (called when the user picks a category
     * inside LiveEditor or when sync mode mirrors a FloatingNav change).
     */
    setLast: async (categoryId: number): Promise<void> => {
      try {
        await typedInvoke('live-editor-config-set-last-category', categoryId)
      } catch (error) {
        log.error('LiveEditor: Failed to set last category:', error)
      }
    },
  },

  spaces: {
    /**
     * Read whether utility panels stay visible while switching macOS Spaces.
     *
     * @returns True when LiveEditor and Floating Navigator follow all Spaces.
     * @example
     * const enabled = await window.liveEditorAPI.spaces.getVisibleOnAllWorkspaces()
     */
    getVisibleOnAllWorkspaces: async (): Promise<boolean> => {
      try {
        return await typedInvoke(
          'floating-window-get-visible-on-all-workspaces',
        )
      } catch (error) {
        log.error('LiveEditor: Failed to get Spaces tracking:', error)
        return false
      }
    },

    /**
     * Persist and apply whether utility panels follow macOS Spaces.
     *
     * @param enabled - true keeps LiveEditor and Floating Navigator visible across Spaces.
     * @returns The value confirmed by the main process.
     * @example
     * await window.liveEditorAPI.spaces.setVisibleOnAllWorkspaces(true)
     */
    setVisibleOnAllWorkspaces: async (enabled: boolean): Promise<boolean> => {
      try {
        return await typedInvoke(
          'floating-window-set-visible-on-all-workspaces',
          enabled,
        )
      } catch (error) {
        log.error('LiveEditor: Failed to set Spaces tracking:', error)
        throw error
      }
    },
  },

  /**
   * Subscribe to a whitelisted main-process event. Returns a cleanup function
   * that removes the wrapped listener (matching `floatingNavigatorAPI.on`).
   *
   * @param channel - Event channel name (must be in `ALLOWED_CHANNELS`).
   * @param callback - Listener invoked with sanitized args.
   */
  on: (
    channel: string,
    callback: (...args: unknown[]) => void,
  ): (() => void) | undefined => {
    if (!validateChannel(channel)) {
      log.error(
        `LiveEditor: Attempted to listen to unauthorized channel: ${channel}`,
      )
      return
    }

    if (typeof callback !== 'function') {
      log.error('LiveEditor: Callback must be a function')
      return
    }

    // Keep IpcRendererEvent private to preload; renderers receive only
    // sanitized payload args. Forwarding `event` would leak `sender` and
    // other capabilities across the contextBridge boundary.
    const wrappedCallback = (
      _event: IpcRendererEvent,
      ...args: unknown[]
    ): void => {
      try {
        const sanitizedArgs = args.map((arg) => sanitizeData(arg))
        callback(...sanitizedArgs)
      } catch (error) {
        log.error('LiveEditor: Error in event callback:', error)
      }
    }

    // Old renderers ask for the previous event while this updated preload and
    // main process emit the canonical event; route both requests to one source.
    const resolvedChannel =
      channel === 'braindump-category-changed'
        ? 'live-editor-category-changed'
        : channel
    ipcRenderer.on(resolvedChannel, wrappedCallback)

    return () => {
      ipcRenderer.removeListener(resolvedChannel, wrappedCallback)
    }
  },
}

contextBridge.exposeInMainWorld('liveEditorAPI', liveEditorAPI)
// Renderer deploys can lead app updates, so keep the previous global available
// for the old web bundle during the cross-version window.
contextBridge.exposeInMainWorld('brainDumpAPI', liveEditorAPI)

/**
 * Environment hint for the renderer to detect the LiveEditor host context.
 *
 * Why: the same React route is reachable from a browser tab during dev — the
 * renderer reads this flag to avoid calling `liveEditorAPI` when undefined.
 */
const liveEditorEnv = {
  isElectron: true,
  isLiveEditor: true,
  platform: process.platform,
}

contextBridge.exposeInMainWorld('liveEditorEnv', liveEditorEnv)
contextBridge.exposeInMainWorld('brainDumpEnv', {
  isElectron: true,
  isBrainDump: true,
  platform: process.platform,
})
