/**
 * @fileoverview Preload script for LiveEditor Note window.
 *
 * The LiveEditor window loads `https://corelive.app/live-editor` and uses oRPC
 * (via the web app) for promoting the note to a `Completed` row. This preload
 * exposes only:
 * - Window controls (close/minimize/opacity/bounds) for the frameless panel
 * - Per-category note text persistence (`live-editor-note-*`)
 * - Spaces tracking for the panel
 *
 * Why a separate preload:
 *   - The window is frameless + transparent + always-on-top; it ships its own
 *     minimal API surface so the main `preload.ts` (~50 channels) does not
 *     leak into a high-trust panel.
 *   - Every call goes through `typedInvoke`, whose channels are validated by
 *     `IPC_ARG_SCHEMAS` in the main process.
 *
 * @module electron/preload-live-editor
 */

import { contextBridge } from 'electron'

import { typedInvoke } from './ipc/typedInvoke'
import { log } from './logger'
import type { WindowBounds as IPCWindowBounds } from './types/ipc'

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
     * @param categoryId - Numeric category id (the shared category selection).
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

  spaces: {
    /**
     * Read whether LiveEditor stays visible while switching macOS Spaces.
     *
     * @returns True when LiveEditor follows all Spaces.
     * @example
     * const enabled = await window.liveEditorAPI.spaces.getVisibleOnAllWorkspaces()
     */
    getVisibleOnAllWorkspaces: async (): Promise<boolean> => {
      try {
        return await typedInvoke('live-editor-get-visible-on-all-workspaces')
      } catch (error) {
        log.error('LiveEditor: Failed to get Spaces tracking:', error)
        return false
      }
    },

    /**
     * Persist and apply whether LiveEditor follows macOS Spaces.
     *
     * @param enabled - true keeps LiveEditor visible across Spaces.
     * @returns The value confirmed by the main process.
     * @example
     * await window.liveEditorAPI.spaces.setVisibleOnAllWorkspaces(true)
     */
    setVisibleOnAllWorkspaces: async (enabled: boolean): Promise<boolean> => {
      try {
        return await typedInvoke(
          'live-editor-set-visible-on-all-workspaces',
          enabled,
        )
      } catch (error) {
        log.error('LiveEditor: Failed to set Spaces tracking:', error)
        throw error
      }
    },
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
