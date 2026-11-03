// @vitest-environment happy-dom
// Regression: ISSUE-001 — first-open and revealed editor must accept keyboard writing.
// Found by /qa on 2026-10-22
// Report: .gstack/qa-reports/run-20261021T164545Z-offline-editor/scope.md
import '@testing-library/jest-dom/vitest'
import type { LiveEditorAPI } from '@corelive/desktop-contract/electron-api'
import type { OfflineEditorAPI } from '@corelive/desktop-contract/offline-editor-api'
import type {
  OfflineEditorSnapshot,
  OfflineSyncStatus,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'

import { DurableEditorStore } from './editor/DurableEditorStore'
import { SharedEditorSurface } from './editor/SharedEditorSurface'
import { NativeEditor } from './NativeEditor'

const stores: DurableEditorStore[] = []
const LOCAL_ONLY_SYNC: OfflineSyncStatus = {
  state: 'local-only',
  waitingCount: 0,
  lastSyncedAt: null,
  boundEmail: null,
}
const originalMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = originalMatchMedia
  document.documentElement.removeAttribute('data-theme')
  cleanup()
  for (const store of stores.splice(0)) store.disconnect()
  vi.useRealTimers()
})

/** Supplies only synthetic preload values; this regression tests DOM focus, not IPC or disk persistence.
 * @example const fixture = mountEditor()
 */
function mountEditor(
  phase: 'ready' | 'opening' = 'ready',
  paginated = false,
  removed = false,
  showStatus = true,
  theme = 'light',
  syncStatus: OfflineSyncStatus = LOCAL_ONLY_SYNC,
  placeholderName?: string,
) {
  const shown = new Set<() => void>()
  const snapshot: OfflineEditorSnapshot = {
    phase: 'ready',
    generation: 1,
    sync: syncStatus,
    workspace: {
      ownerId: 'synthetic-focus-account',
      revision: 0,
      selectedCategoryId: '00000000-0000-4000-8000-0000000000a1',
      categories: [
        {
          id: '00000000-0000-4000-8000-0000000000a1',
          name: 'General',
          color: 'blue',
          parentId: null,
          isDefault: true,
          removed,
          historical: false,
          fieldRevisions: { name: 0, color: 0, parentLocalId: 0 },
        },
        // A migration-created placeholder that Settings > Categories also hides.
        ...(placeholderName
          ? [
              {
                id: '00000000-0000-4000-8000-0000000000a2',
                name: placeholderName,
                color: 'blue' as const,
                parentId: null,
                isDefault: false,
                removed: false,
                historical: true,
                fieldRevisions: { name: 0, color: 0, parentLocalId: 0 },
              },
            ]
          : []),
      ],
      preferences: {
        revision: 0,
        theme,
        settings: UserSettingsStateSchema.parse({
          liveEditorShowStatusBar: showStatus,
        }),
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
      categoryMoves: {},
      binding: null,
      recoveryCopyCount: 0,
      needsALookCount: 0,
    },
  }
  const host: OfflineEditorAPI = {
    version: 1,
    snapshot: async () =>
      phase === 'opening' ? { phase, generation: 1 } : snapshot,
    draft: async () => ({
      categoryId: '00000000-0000-4000-8000-0000000000a1',
      draft: snapshot.workspace.draft,
    }),
    command: async () => ({ ok: false, reason: 'unused-in-focus-test' }),
    retry: async () => undefined,
    details: async () => ({ total: paginated ? 21 : 0, records: [] }),
    undoHistory: async () => ({ total: 0, completions: [] }),
    recoveryCopies: async () => ({ total: 0, copies: [] }),
    signIn: async () => undefined,
    syncDetails: async () => ({
      rows: [],
      history: [],
      migrationSummary: null,
      preservedBackups: [],
      dashboardOnlyCount: 0,
    }),
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

test('a definite save rejection shows Retry and Copy writing instead of an endless saving state', async () => {
  // Arrange
  const { host, store } = mountEditor()
  host.command = async () => ({ ok: false, reason: 'invalid-row' })
  const field = await screen.findByRole('textbox', { name: 'Write one thing' })

  // Act
  fireEvent.change(field, { target: { value: 'Rejected writing' } })
  await act(async () => {
    await store.flush()
  })

  // Assert
  expect(screen.getByText('Not saved on this Mac')).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: /Not saved on this Mac. Open details/ }),
  )
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Copy writing' })).toBeVisible()
  expect(field).toHaveValue('Rejected writing')
})

test('opening a prepared offline editor focuses the preserved writing without a click', async () => {
  // Arrange / Act
  mountEditor()
  const field = await screen.findByRole('textbox', { name: 'Write one thing' })

  // Assert
  expect(field).toBeVisible()
  expect(field).toHaveValue('Saved writing')
  await waitFor(() => expect(field).toHaveFocus())
})

test('Copy writing acknowledges the exact live text only after copying and clears Copied after two seconds', async () => {
  // Arrange
  const fixture = mountEditor()
  fixture.host.command = async () => ({ ok: false, reason: 'storage-failed' })
  const field = await screen.findByRole('textbox', { name: 'Write one thing' })
  fireEvent.change(field, {
    target: { value: 'Unsaved line\nMore live writing' },
  })
  fireEvent.click(
    await screen.findByRole('button', {
      name: /Not saved on this Mac. Open details/,
    }),
  )
  const button = await screen.findByRole('button', { name: 'Copy writing' })
  let finishCopy: (copied: boolean) => void = () => undefined
  fixture.host.copyWriting = vi.fn(
    async () =>
      new Promise<boolean>((resolve) => {
        finishCopy = resolve
      }),
  )
  vi.useFakeTimers()

  // Act
  fireEvent.click(button)
  await act(async () => undefined)

  // Assert
  expect(fixture.host.copyWriting).toHaveBeenCalledWith(
    1,
    'Unsaved line\nMore live writing',
  )
  expect(screen.queryByText('Copied')).not.toBeInTheDocument()
  await act(async () => finishCopy(true))
  expect(screen.getByText('Copied')).toBeVisible()
  await act(async () => vi.advanceTimersByTimeAsync(1999))
  expect(screen.getByText('Copied')).toBeVisible()
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(screen.queryByText('Copied')).not.toBeInTheDocument()
  expect(field).toHaveValue('Unsaved line\nMore live writing')
})

test.each(['false', 'rejected'])(
  'Copy writing gives manual-copy guidance when the clipboard result is %s',
  async (result) => {
    // Arrange
    const fixture = mountEditor()
    fixture.host.command = async () => ({ ok: false, reason: 'storage-failed' })
    const field = await screen.findByRole('textbox', {
      name: 'Write one thing',
    })
    fireEvent.change(field, { target: { value: 'Writing still at risk' } })
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Not saved on this Mac. Open details/,
      }),
    )
    const button = await screen.findByRole('button', { name: 'Copy writing' })
    fixture.host.copyWriting = async () => {
      if (result === 'rejected')
        throw new Error('Synthetic clipboard unavailable')
      return false
    }

    // Act
    fireEvent.click(button)

    // Assert
    expect(
      await screen.findByText(
        'Could not copy. Close Details, then select your writing and copy it.',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
    expect(field).toHaveValue('Writing still at risk')
  },
)

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

// Regression: ISSUE-004 — disabling a pagination button must not strand focus outside Details.
// Found by /qa on 2026-10-22; Escape failed after returning to the first page.
test('changing a Details page keeps keyboard focus in the panel so Escape returns to writing', async () => {
  // Arrange
  mountEditor('ready', true)
  await screen.findByRole('textbox', { name: 'Write one thing' })
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))
  const next = await screen.findByRole('button', { name: 'Next' })
  next.focus()

  // Act
  fireEvent.click(next)

  // Assert
  const heading = screen.getByRole('heading', { name: 'Completion details' })
  await waitFor(() => expect(heading).toHaveFocus())
  fireEvent.keyDown(heading, { key: 'Escape' })
  const field = await screen.findByRole('textbox', { name: 'Write one thing' })
  expect(field).toBeVisible()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Details' })).toHaveFocus(),
  )
})

// Regression: ISSUE-004 — cancelling a programmatic repair must restore its opener.
test('cancelling a repair returns keyboard focus to the action that opened it', async () => {
  // Arrange
  mountEditor('ready', false, true)
  const details = await screen.findByRole('button', { name: 'Details' })
  fireEvent.click(details)
  const opener = await screen.findByRole('button', { name: 'Move writing' })
  opener.focus()
  fireEvent.click(opener)

  // Act
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

  // Assert
  await waitFor(() => expect(opener).toHaveFocus())
})

test('hidden routine status retains writing, recovery access and the caret across Details', async () => {
  // Arrange
  const { host, store } = mountEditor('ready', false, false, false)
  host.command = async () => ({ ok: false, reason: 'storage-failed' })
  const field = await screen.findByRole<HTMLTextAreaElement>('textbox', {
    name: 'Write one thing',
  })
  field.setSelectionRange(3, 3)
  fireEvent.select(field)

  // Act
  fireEvent.change(field, { target: { value: 'Unsaved writing' } })
  await act(async () => {
    await store.flush()
  })
  const details = screen.getByRole('button', {
    name: /Not saved on this Mac. Open details/,
  })
  fireEvent.click(details)

  // Assert
  expect(
    screen.queryByRole('contentinfo', { name: 'Writing status' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copy writing' })).toBeVisible()
  expect(field).not.toBeVisible()
  expect(field).toHaveValue('Unsaved writing')
  fireEvent.keyDown(
    screen.getByRole('heading', { name: 'Completion details' }),
    { key: 'Escape' },
  )
  expect(screen.getByRole('textbox', { name: 'Write one thing' })).toBe(field)
  expect(field).toBeVisible()
  await waitFor(() => expect(details).toHaveFocus())
})

test('the LiveEditor header leaves its empty control-row space available for window dragging', () => {
  // Arrange
  const markup = renderToStaticMarkup(
    <SharedEditorSurface
      windowSettings={{
        opacity: 1,
        spacesTrackingEnabled: false,
        isUpdatingSpacesTracking: false,
        handleSpacesTrackingChange: vi.fn(),
        handleOpacityValueChange: vi.fn(),
      }}
      textareaProps={{ value: '', onChange: vi.fn() }}
      categoryCount={1}
      categoryPicker={null}
      settings={UserSettingsStateSchema.parse({})}
      nativeHeader={<button type="button">Details</button>}
      isCategoryListPending={false}
      isCategoryListError={false}
      isMounted
      isLiveEditorConfigReady
      activeCategoryId="00000000-0000-4000-8000-0000000000a1"
      isNoteFieldDisabled={false}
      handleKeepLineClick={vi.fn()}
      closeWindow={vi.fn()}
    />,
  )

  // Act: inert server markup retains Electron CSS that Happy DOM drops during client style assignment.
  const container = new DOMParser().parseFromString(markup, 'text/html')
  const header = container.querySelector('header')
  const spaces = header?.querySelector('[role="switch"]')

  // Assert: Electron excludes every pixel of a no-drag ancestor, including empty space.
  expect(header?.getAttribute('style')).toBe('-webkit-app-region:drag')
  expect(spaces?.parentElement?.getAttribute('style')).toBe(
    '-webkit-app-region:drag',
  )
  expect(spaces?.getAttribute('style')).toContain('-webkit-app-region:no-drag')
  expect(header?.querySelector('label')?.getAttribute('style')).toBe(
    '-webkit-app-region:no-drag',
  )
  // A growing label would turn the blank drag area back into an interactive rectangle.
  expect(header?.querySelector('label')).not.toHaveClass('flex-1')
  expect(header?.querySelector('label')).not.toHaveClass('grow')
  expect(
    header
      ?.querySelector('[aria-label="Close LiveEditor"]')
      ?.getAttribute('style'),
  ).toBe('-webkit-app-region:no-drag')
  expect(header?.firstElementChild?.getAttribute('style')).toBe(
    '-webkit-app-region:no-drag',
  )
})

/** Makes `prefers-color-scheme: dark` report the given OS appearance. */
function stubOsAppearance(isDark: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('dark') ? isDark : !isDark,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
}

test('before the workspace is ready the editor follows a dark OS instead of painting light', async () => {
  // Arrange — a workspace that never becomes ready keeps the pre-ready state
  stubOsAppearance(true)

  // Act
  mountEditor('opening')

  // Assert
  expect(document.documentElement.dataset.theme).toBe('dark')
})

test('before the workspace is ready the editor follows a light OS', () => {
  // Arrange
  stubOsAppearance(false)

  // Act
  mountEditor('opening')

  // Assert
  expect(document.documentElement.dataset.theme).toBe('light')
})

test.each([
  { stored: 'system', isDark: true, expected: 'dark' },
  { stored: 'system', isDark: false, expected: 'light' },
  { stored: 'default-dark', isDark: false, expected: 'dark' },
  { stored: 'default-light', isDark: true, expected: 'light' },
  { stored: 'dark', isDark: false, expected: 'dark' },
  { stored: 'cathedral-light', isDark: true, expected: 'cathedral-light' },
  { stored: 'harbor-dark', isDark: false, expected: 'harbor-dark' },
  { stored: 'cathedral-lite', isDark: true, expected: 'dark' },
])(
  'applies stored theme $stored on an OS with dark=$isDark as $expected',
  async ({ stored, isDark, expected }) => {
    // Arrange
    stubOsAppearance(isDark)

    // Act
    mountEditor('ready', false, false, true, stored)
    await screen.findByRole('textbox', { name: 'Write one thing' })

    // Assert
    expect(document.documentElement.dataset.theme).toBe(expected)
  },
)

test('a local-only Mac shows only the save line and no sync line', async () => {
  // Arrange / Act
  mountEditor()
  await screen.findByRole('textbox', { name: 'Write one thing' })

  // Assert
  const status = screen.getByLabelText('Writing status')
  expect(screen.getAllByText('Saved on this Mac')[0]).toBeVisible()
  expect(status.querySelectorAll('p')).toHaveLength(1)
  expect(screen.queryByText(/Sign in to sync completions/)).toBeNull()
  expect(screen.queryByText(/completion update/)).toBeNull()
})

test('Sign in to sync completions appears only for the sign-in-to-sync state', async () => {
  // Arrange / Act
  mountEditor('ready', false, false, true, 'light', {
    state: 'sign-in-to-sync',
    waitingCount: 0,
    lastSyncedAt: null,
    boundEmail: 'owner@example.com',
  })
  await screen.findByRole('textbox', { name: 'Write one thing' })

  // Assert
  expect(screen.getByLabelText('Writing status')).toHaveTextContent(
    'Sign in to sync completions',
  )
})

test('the footer status line is a polite status live region', async () => {
  // Arrange / Act
  mountEditor()
  await screen.findByRole('textbox', { name: 'Write one thing' })

  // Assert
  const status = screen.getByLabelText('Writing status')
  expect(status).toHaveAttribute('role', 'status')
  expect(status).toHaveAttribute('aria-live', 'polite')
})

test('an attached Mac that is waiting reports its pending completion updates', async () => {
  // Arrange / Act
  mountEditor('ready', false, false, true, 'light', {
    state: 'waiting',
    waitingCount: 2,
    lastSyncedAt: null,
    boundEmail: 'owner@example.com',
  })
  await screen.findByRole('textbox', { name: 'Write one thing' })

  // Assert
  expect(screen.getByLabelText('Writing status')).toHaveTextContent(
    'Offline · 2 completion updates pending',
  )
})

// Regression: /ship CodeRabbit review on PR #222 2026-11-03 — migration "historical" placeholder categories were selectable and editable in the editor picker
test('the category picker and Manage categories leave out migration placeholder categories', async () => {
  // Arrange
  mountEditor(
    'ready',
    false,
    false,
    true,
    'light',
    LOCAL_ONLY_SYNC,
    'Old import',
  )
  fireEvent.click(
    await screen.findByRole('combobox', { name: 'Writing category: General' }),
  )

  // Assert (selectable list)
  expect(await screen.findByText('Manage categories…')).toBeVisible()
  expect(screen.queryByText('Old import')).toBeNull()

  // Act
  fireEvent.click(screen.getByText('Manage categories…'))

  // Assert (manage list)
  expect(await screen.findByRole('button', { name: 'General' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Old import' })).toBeNull()
})

// Regression: /ship CodeRabbit review on PR #222 2026-11-03 — Details told an offline Mac to "Connect to manage categories" although categories work offline
test('Details for a waiting Mac points to offline category management instead of asking to connect', async () => {
  // Arrange
  mountEditor('ready', false, false, true, 'light', {
    state: 'waiting',
    waitingCount: 2,
    lastSyncedAt: null,
    boundEmail: 'owner@example.com',
  })
  await screen.findByRole('textbox', { name: 'Write one thing' })

  // Act
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))

  // Assert
  expect(await screen.findByText(/Categories work offline\./)).toBeVisible()
  expect(screen.queryByText(/Connect to manage categories/)).toBeNull()
})
