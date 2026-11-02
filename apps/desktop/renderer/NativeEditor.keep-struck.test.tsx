// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import type { LiveEditorAPI } from '@corelive/desktop-contract/electron-api'
import type { OfflineEditorAPI } from '@corelive/desktop-contract/offline-editor-api'
import type { OfflineEditorSnapshot } from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { DurableEditorStore } from '@corelive/live-editor/store'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { NativeEditor } from './NativeEditor'

const stores: DurableEditorStore[] = []
afterEach(() => {
  cleanup()
  for (const store of stores.splice(0)) store.disconnect()
  vi.useRealTimers()
})

/** Supplies only synthetic preload values; these checks cover the keep-mode wiring, not IPC or disk persistence.
 * @example const fixture = mountEditor()
 */
function mountEditor(clearOnComplete: boolean, savedText: string) {
  const shown = new Set<() => void>()
  const snapshot: OfflineEditorSnapshot = {
    phase: 'ready',
    generation: 1,
    sync: 'offline',
    workspace: {
      ownerId: 'synthetic-focus-account',
      revision: 0,
      selectedCategoryId: 1,
      categories: [
        {
          id: 1,
          name: 'General',
          color: 'blue',
          parentId: null,
          isDefault: true,
          removed: false,
        },
      ],
      preferences: {
        revision: 0,
        theme: 'light',
        settings: UserSettingsStateSchema.parse({
          liveEditorShowStatusBar: true,
          liveEditorClearOnComplete: clearOnComplete,
        }),
      },
      draft: {
        revision: 0,
        rows: [{ id: '00000000-0000-4000-8000-000000000001', text: savedText }],
      },
      pendingCount: 0,
      blockedCount: 0,
      recentUndo: [],
      eligibleUndoCount: 0,
      checkpoint: null,
      today: {
        day: '2026-10-22',
        timezone: 'Asia/Tokyo',
        total: 0,
        deviceTotal: 0,
        scope: 'device',
        stale: true,
        confirmedAt: null,
        lastAccountTotal: null,
      },
      nextClearAt: null,
      nextUndoAt: null,
      categoryDeletions: {},
      recoveryCopyCount: 0,
    },
  }
  const host: OfflineEditorAPI = {
    version: 1,
    snapshot: async () => snapshot,
    draft: async () => ({ categoryId: 1, draft: snapshot.workspace.draft }),
    command: async () => ({ ok: false, reason: 'unused-in-focus-test' }),
    retry: async () => undefined,
    details: async () => ({ total: 0, records: [] }),
    undoHistory: async () => ({ total: 0, completions: [] }),
    recoveryCopies: async () => ({ total: 0, copies: [] }),
    signIn: async () => undefined,
    manageCategories: async () => undefined,
    copyWriting: async () => true,
    export: async () => true,
    previewRecovery: async () => ({
      workspace: snapshot.workspace,
      savedAt: 0,
    }),
    recover: async () => false,
    subscribe: () => () => undefined,
    onFlush: () => () => undefined,
    replyFlush: async () => true,
    onShown: (listener) => {
      shown.add(listener)
      return () => shown.delete(listener)
    },
    onCategoryCreated: () => () => undefined,
  }
  const api: LiveEditorAPI = {
    workspace: host,
    window: {
      close: async () => undefined,
      getOpacity: async () => 1,
      setOpacity: async () => undefined,
      getBounds: async () => null,
      setBounds: async () => undefined,
    },
    spaces: {
      getVisibleOnAllWorkspaces: async () => false,
      setVisibleOnAllWorkspaces: async (enabled) => enabled,
    },
  }
  const store = new DurableEditorStore(host)
  stores.push(store)
  render(<NativeEditor api={api} store={store} />)
  return {
    host,
    store,
    show: (): void => {
      for (const listener of shown) listener()
    },
  }
}

test('the desktop editor strikes finished titles when Clear finished lines is off', async () => {
  // Arrange / Act
  mountEditor(false, '- [x] 10月の請求書の提出')

  // Assert
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Write one thing' }),
    ).toHaveValue('- [x] 10月の請求書の提出'),
  )
  const title = document.querySelector('[data-finished-title]')
  expect(title?.textContent).toBe('10月の請求書の提出')
})

test('the desktop editor draws no strikes when Clear finished lines is on', async () => {
  // Arrange / Act
  mountEditor(true, '- [x] 10月の請求書の提出')

  // Assert
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Write one thing' }),
    ).toHaveValue('- [x] 10月の請求書の提出'),
  )
  expect(document.querySelector('[data-finished-line-strikes]')).toBeNull()
})
