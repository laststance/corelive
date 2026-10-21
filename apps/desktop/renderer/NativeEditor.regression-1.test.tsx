// @vitest-environment happy-dom
// Regression: ISSUE-001 — first-open and revealed editor must accept keyboard writing.
// Found by /qa on 2026-10-22
// Report: .gstack/qa-reports/run-20261021T164545Z-offline-editor/scope.md
import '@testing-library/jest-dom/vitest'
import type { LiveEditorAPI } from '@corelive/desktop-contract/electron-api'
import type { OfflineEditorAPI } from '@corelive/desktop-contract/offline-editor-api'
import type { OfflineEditorSnapshot } from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { DurableEditorStore } from '@corelive/live-editor/store'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { NativeEditor } from './NativeEditor'

const stores: DurableEditorStore[] = []
afterEach(() => {
  cleanup()
  for (const store of stores.splice(0)) store.disconnect()
})

/** Supplies only synthetic preload values; this regression tests DOM focus, not IPC or disk persistence.
 * @example const fixture = mountEditor()
 */
function mountEditor(phase: 'ready' | 'preparing' = 'ready') {
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
        settings: UserSettingsStateSchema.parse({}),
      },
      draft: {
        revision: 0,
        rows: [
          { id: '00000000-0000-4000-8000-000000000001', text: 'Saved writing' },
        ],
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
    snapshot: async () =>
      phase === 'preparing' ? { phase, generation: 1 } : snapshot,
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
    note: { get: async () => '', set: async () => undefined },
  }
  const store = new DurableEditorStore(host)
  stores.push(store)
  render(<NativeEditor api={api} store={store} />)
  return {
    show: (): void => {
      for (const listener of shown) listener()
    },
  }
}

test('opening a prepared offline editor focuses the preserved writing without a click', async () => {
  // Arrange / Act
  mountEditor()
  const field = await screen.findByRole('textbox', { name: 'Write one thing' })

  // Assert
  expect(field).toBeVisible()
  expect(field).toHaveValue('Saved writing')
  await waitFor(() => expect(field).toHaveFocus())
})

test('revealing the native editor returns focus to its writing while keeping the live caret', async () => {
  // Arrange
  const fixture = mountEditor()
  const field = await screen.findByRole<HTMLTextAreaElement>('textbox', {
    name: 'Write one thing',
  })
  field.setSelectionRange(3, 3)
  fireEvent.select(field)
  screen.getByRole('button', { name: 'Details' }).focus()

  // Act
  await act(async () => fixture.show())

  // Assert
  await waitFor(() => expect(field).toHaveFocus())
  expect(field.selectionStart).toBe(3)
})

test('revealing an open Details panel keeps its focus instead of moving to the hidden writing field', async () => {
  // Arrange
  const fixture = mountEditor()
  await screen.findByRole('textbox', { name: 'Write one thing' })
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))
  const heading = await screen.findByRole('heading', {
    name: 'Completion details',
  })
  await waitFor(() => expect(heading).toHaveFocus())

  // Act
  await act(async () => fixture.show())

  // Assert
  expect(heading).toHaveFocus()
})

// Regression: ISSUE-002 — preparation must remain discoverable through heading navigation.
// Found by /qa on 2026-10-22; previous scene probe lost its heading because role=status replaced it.
test('preparation progress remains a level-one heading with a polite announcement', async () => {
  // Arrange / Act
  mountEditor('preparing')
  const heading = await screen.findByRole('heading', {
    name: 'Preparing offline access…',
    level: 1,
  })

  // Assert
  expect(heading).toBeVisible()
  expect(heading).toHaveAttribute('aria-live', 'polite')
})
