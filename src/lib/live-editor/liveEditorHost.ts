import type { LiveEditorAPI } from '@/electron/types/electron-api'
import {
  getLiveEditorAPI,
  isLiveEditorEnvironment,
} from '@/electron/utils/electron-client'
import { LIVE_EDITOR_OPACITY_MAX } from '@/lib/constants/live-editor'

import { getLocalNote, setLocalNote } from './localNoteStore'

/**
 * Shared no-op for the window controls the browser cannot honour.
 * @returns An already-resolved promise.
 * @example
 * await resolved()
 */
const resolved = async (): Promise<void> => {}

/**
 * Browser implementation of the preload bridge: notes persist in localStorage
 * and the frameless-window controls are no-ops.
 */
const webLiveEditorHost: LiveEditorAPI = {
  window: {
    close: resolved,
    toggle: resolved,
    setOpacity: resolved,
    getOpacity: async () => LIVE_EDITOR_OPACITY_MAX,
    getBounds: async () => null,
    setBounds: resolved,
  },
  note: {
    get: async (categoryId) => getLocalNote(categoryId),
    set: async (categoryId, text) => {
      setLocalNote(categoryId, text)
    },
  },
  spaces: {
    getVisibleOnAllWorkspaces: async () => false,
    setVisibleOnAllWorkspaces: async (enabled) => enabled,
  },
}

/**
 * Resolves the LiveEditor host: the Electron preload bridge (including the legacy
 * `brainDumpAPI` name) inside the packaged panel, the browser implementation
 * everywhere else. Every `LiveEditor` persistence call goes through this.
 * @returns
 * - The preload object when `preload-live-editor.ts` injected one
 * - The localStorage-backed web host otherwise (a normal tab, `/write`, SSR)
 * @example
 * const note = await getLiveEditorHost().note.get(0)
 */
export const getLiveEditorHost = (): LiveEditorAPI =>
  getLiveEditorAPI() ?? webLiveEditorHost

/**
 * Whether the editor is rendered by the frameless Electron panel — the switch for
 * Electron-only chrome (Follow Spaces, opacity, close) and for skipping the web frame.
 * @returns true inside the packaged LiveEditor window, false in any browser tab.
 * @example
 * isElectronLiveEditorPanel() // => false on corelive.app/write
 */
export const isElectronLiveEditorPanel = (): boolean =>
  isLiveEditorEnvironment()
