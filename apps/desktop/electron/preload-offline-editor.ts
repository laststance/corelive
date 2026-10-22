import type { LiveEditorAPI } from '@corelive/desktop-contract/electron-api'
import { contextBridge } from 'electron'

import { subscribeToMain } from './ipc/subscribeToMain'
import { typedInvoke } from './ipc/typedInvoke'
import { isLocalEditorDocument } from './offline/localEditorOrigin'

// The dedicated sandbox preload exposes no remote networking, tokens, config, or filesystem.
if (process.isMainFrame && isLocalEditorDocument(window.location.href)) {
  const bridge: LiveEditorAPI = {
    workspace: {
      version: 1,
      snapshot: async () => typedInvoke('offline-editor-snapshot'),
      draft: async (generation, categoryId) =>
        typedInvoke('offline-editor-draft', generation, categoryId),
      command: async (generation, command) =>
        typedInvoke('offline-editor-command', generation, command),
      retry: async () => typedInvoke('offline-editor-retry'),
      details: async (generation, offset, limit) =>
        typedInvoke('offline-editor-details', generation, offset, limit),
      undoHistory: async (generation, offset, limit) =>
        typedInvoke('offline-editor-undo-history', generation, offset, limit),
      recoveryCopies: async (generation, offset, limit) =>
        typedInvoke(
          'offline-editor-recovery-copies',
          generation,
          offset,
          limit,
        ),
      signIn: async () => typedInvoke('offline-editor-sign-in'),
      manageCategories: async (request = { action: 'manage' }) =>
        typedInvoke('offline-editor-manage-categories', request),
      copyWriting: async (generation, text) =>
        typedInvoke('offline-editor-copy', generation, text),
      export: async (generation) =>
        typedInvoke('offline-editor-export', generation),
      previewRecovery: async (generation) =>
        typedInvoke('offline-editor-preview-recovery', generation),
      recover: async (generation) =>
        typedInvoke('offline-editor-recover', generation),
      subscribe: (listener) =>
        subscribeToMain('offline-editor-changed', listener),
      onFlush: (listener) => subscribeToMain('offline-editor-flush', listener),
      onShown: (listener) => subscribeToMain('offline-editor-shown', listener),
      onCategoryCreated: (listener) =>
        subscribeToMain('offline-editor-category-created', listener),
      replyFlush: async (request, saved) =>
        typedInvoke('offline-editor-flush-result', request, saved),
    },
    window: {
      close: async () => typedInvoke('live-editor-window-hide'),
      getOpacity: async () => typedInvoke('live-editor-window-get-opacity'),
      setOpacity: async (value) => {
        await typedInvoke('live-editor-window-set-opacity', value)
      },
      getBounds: async () => typedInvoke('live-editor-window-get-bounds'),
      setBounds: async (bounds) => {
        await typedInvoke('live-editor-window-set-bounds', bounds)
      },
    },
    // Keep the shared host shape; new native editing must use the durable account command API.
    note: {
      get: async () => {
        throw new Error('Use the prepared workspace')
      },
      set: async () => {
        throw new Error('Use the prepared workspace')
      },
    },
    spaces: {
      getVisibleOnAllWorkspaces: async () =>
        typedInvoke('live-editor-get-visible-on-all-workspaces'),
      setVisibleOnAllWorkspaces: async (enabled) =>
        typedInvoke('live-editor-set-visible-on-all-workspaces', enabled),
    },
  }
  contextBridge.exposeInMainWorld('liveEditorAPI', bridge)
  contextBridge.exposeInMainWorld('liveEditorEnv', {
    isElectron: true,
    isLiveEditor: true,
    platform: process.platform,
  })
}
