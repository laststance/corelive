/**
 * @fileoverview The dialog runs on the real {@link useCategoryMutations}, the
 * real TanStack cache and the real oRPC client; MSW answers `/api/orpc/*`.
 * Assertions read the server's table and the device's localStorage, not a spy —
 * a stubbed mutation would report the call and prove nothing landed.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

import { getLocalNote, setLocalNote } from '@/lib/live-editor/localNoteStore'
import type { CategoryWithCount } from '@/server/schemas/category'
import {
  armNetworkFailure,
  holdRequests,
  orpcServer,
  readCategories,
  resetOrpcServer,
} from '@/test/orpcServer'

import { CategoryManageDialog } from './CategoryManageDialog'

// Clerk is the auth boundary, not the API: without this the dialog's query
// never enables and MSW is never reached.
vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))

vi.mock('@/lib/category-sync-channel', () => ({
  broadcastCategorySync: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

/**
 * Builds a category list row with the fields the dialog actually reads.
 * @param overrides - Fields to change on top of a plain non-default category.
 * @returns One `CategoryWithCount`.
 * @example
 * buildCategory({ id: 1, name: 'General', isDefault: true })
 */
function buildCategory(
  overrides: Partial<CategoryWithCount> = {},
): CategoryWithCount {
  return {
    id: 12,
    name: 'Work',
    color: 'blue',
    isDefault: false,
    userId: 1,
    _count: { todos: 0 },
    createdAt: new Date('2026-09-07T00:00:00.000Z'),
    updatedAt: new Date('2026-09-07T00:00:00.000Z'),
    ...overrides,
  }
}

const defaultCategory = buildCategory({
  id: 1,
  name: 'General',
  isDefault: true,
})

/**
 * Installs an Electron bridge whose note store fails the way a bad disk read or
 * write does. `preload-live-editor.ts` re-throws both by design, and the web
 * host cannot reject at all (localStorage degrades to memory), so this is the
 * only shape that reaches the rescue's failure path.
 * @param failingCall - `'read'` fails every read; `'clear'` fails only the final
 *   wipe of the doomed key, after the default category already holds the text.
 * @returns The bridge's note table, to assert what survived on the device.
 * @example
 * const notes = installFailingLiveEditorBridge('read')
 */
function installFailingLiveEditorBridge(
  failingCall: 'read' | 'clear',
): Map<number, string> {
  const notes = new Map<number, string>([[12, 'half a thought']])
  window.liveEditorAPI = {
    window: {
      close: async () => {},
      toggle: async () => {},
      setOpacity: async () => {},
      getOpacity: async () => 1,
      getBounds: async () => null,
      setBounds: async () => {},
    },
    note: {
      get: async (categoryId) => {
        if (failingCall === 'read') throw new Error('Failed to read note')
        return notes.get(categoryId) ?? ''
      },
      set: async (categoryId, text) => {
        if (failingCall === 'clear' && text === '') {
          throw new Error('Failed to write note')
        }
        notes.set(categoryId, text)
      },
    },
    spaces: {
      getVisibleOnAllWorkspaces: async () => false,
      setVisibleOnAllWorkspaces: async (enabled) => enabled,
    },
  }
  return notes
}

/**
 * Opens the dialog over a server holding the given rows and waits for the list
 * to arrive, so no spec asserts against an empty first render.
 * @param categories - Rows the fake `category.list` should return.
 * @returns Nothing; resolves once the last row is on screen.
 * @example
 * await renderDialog([defaultCategory, buildCategory()])
 */
async function renderDialog(
  categories: CategoryWithCount[] = [defaultCategory],
) {
  resetOrpcServer(categories)
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  render(<CategoryManageDialog open onOpenChange={vi.fn()} />, { wrapper })
  const lastRowName = categories.at(-1)?.name
  if (lastRowName) await screen.findByText(lastRowName)
}

beforeAll(() => orpcServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => orpcServer.resetHandlers())
afterAll(() => orpcServer.close())

beforeEach(() => {
  vi.clearAllMocks()
  resetOrpcServer()
  // The draft store is real localStorage, and happy-dom keeps one per file.
  localStorage.clear()
  // Back to the web host; a spec that installed a failing bridge keeps it
  // otherwise, and happy-dom's window outlives the test.
  delete window.liveEditorAPI
})

describe('CategoryManageDialog create row', () => {
  test('adds the typed category when Add is clicked', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog()

    // Act
    await user.type(
      screen.getByRole('textbox', { name: 'New category name' }),
      'Reading',
    )
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // Assert — stored server-side, and blue because the dialog omits colour and
    // CreateCategorySchema defaults it.
    await waitFor(() => {
      expect(
        readCategories().find((category) => category.name === 'Reading'),
      ).toMatchObject({ color: 'blue', isDefault: false })
    })
  })

  test('adds the typed category when Enter is pressed', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog()

    // Act
    await user.type(
      screen.getByRole('textbox', { name: 'New category name' }),
      'Reading{Enter}',
    )

    // Assert
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toContain(
        'Reading',
      )
    })
  })

  test('empties the field without waiting for the server', async () => {
    // Arrange — the add is optimistic, so a round trip must not gate the clear.
    const user = userEvent.setup()
    await renderDialog()
    const release = holdRequests()
    const field = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'New category name',
    })

    // Act
    await user.type(field, 'Reading{Enter}')

    // Assert — still empty while the create is in flight.
    expect(field.value).toBe('')

    // Drain the held write inside its own test, or it lands in the next one's table.
    release()
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toContain(
        'Reading',
      )
    })
  })

  test('refuses a name that is only whitespace', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog()

    // Act
    await user.type(
      screen.getByRole('textbox', { name: 'New category name' }),
      '   {Enter}',
    )

    // Assert
    expect(readCategories()).toHaveLength(1)
  })
})

describe('CategoryManageDialog row actions', () => {
  test('leaves a category still being created uneditable until it has a real id', async () => {
    // Arrange — a create that never settles, so the optimistic row minted with
    // `id: -Date.now()` stays on screen. The server answers NOT_FOUND to those,
    // which change 1 would surface as "Category not found" on a fresh row.
    const user = userEvent.setup()
    await renderDialog([defaultCategory])
    const release = holdRequests()

    // Act
    await user.type(
      screen.getByRole('textbox', { name: 'New category name' }),
      'Reading{Enter}',
    )

    // Assert — the row is visible but inert; a settled row keeps both controls.
    expect(await screen.findByText('Reading')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Rename Reading' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete Reading' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename General' })).toBeVisible()

    // …and the same row becomes editable the moment the server assigns its id.
    release()
    expect(
      await screen.findByRole('button', { name: 'Rename Reading' }),
    ).toBeVisible()
  })

  test('keeps the default category undeletable', async () => {
    // Arrange / Act
    await renderDialog([defaultCategory, buildCategory()])

    // Assert
    expect(
      screen.queryByRole('button', { name: 'Delete General' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Work' })).toBeVisible()
  })

  test('renames a category through to the server', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Rename Work' }))
    await user.clear(screen.getByDisplayValue('Work'))
    await user.type(screen.getByRole('textbox', { name: '' }), 'Reading{Enter}')

    // Assert
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
        'Reading',
      ])
    })
  })

  test('names the real default category in the delete confirmation', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog([
      buildCategory({ id: 1, name: 'Today', isDefault: true }),
      buildCategory(),
    ])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))

    // Assert — the real default's name, not "the default category". Scoped to
    // the confirmation: "Today" is also a row in the list behind it.
    const confirmation = await screen.findByRole('alertdialog')
    expect(within(confirmation).getByText(/its tasks move to/)).toBeVisible()
    expect(within(confirmation).getByText('Today')).toBeVisible()
  })
})

describe('CategoryManageDialog draft rescue', () => {
  test('moves an unsaved draft into the default category before deleting', async () => {
    // Arrange — the doomed category holds text the server never sees. Deleting
    // without moving it strands the text in device storage forever, because the
    // note key is the category id and that id is about to stop existing.
    const user = userEvent.setup()
    setLocalNote(1, 'already here')
    setLocalNote(12, 'half a thought')
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert — read back from the same localStorage the editor reads.
    await waitFor(() => {
      expect(getLocalNote(1)).toBe('already here\nhalf a thought')
    })
    expect(getLocalNote(12)).toBe('')
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
      ])
    })
  })

  test('keeps the category when its draft cannot be moved off the device', async () => {
    // Arrange — the Electron note bridge rejects, so nothing reached safety.
    // Deleting anyway would strand the text under an id nothing can reach,
    // which is the loss the dialog promises does not happen.
    const user = userEvent.setup()
    installFailingLiveEditorBridge('read')
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert — the confirmation is a Radix Close, so it is already gone by the
    // time the rescue rejects; the toast is the only channel left to say the
    // delete was abandoned. Asserted, because the source comment claims it.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't move your note out of that category — nothing was deleted, so your writing is safe.",
      )
    })
    expect(readCategories().map((category) => category.name)).toEqual([
      'General',
      'Work',
    ])
  })

  test('deletes anyway when only the old copy of a rescued draft lingers', async () => {
    // Arrange — the merge into the default landed and only the wipe of the old
    // key failed. Aborting here would be a false alarm, and a retry would read
    // the still-populated doomed key and append the same text a second time.
    const user = userEvent.setup()
    const notes = installFailingLiveEditorBridge('clear')
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
      ])
    })
    expect(notes.get(1)).toBe('half a thought')
    expect(toast.error).not.toHaveBeenCalled()
  })

  test('leaves the draft in its own category when the delete is rejected', async () => {
    // Arrange — the server refuses the delete. Wiping the doomed copy before
    // knowing that would take the draft away from a category that still
    // exists: the same loss the rescue is here to prevent, only quieter.
    const user = userEvent.setup()
    setLocalNote(1, 'already here')
    setLocalNote(12, 'half a thought')
    await renderDialog([defaultCategory, buildCategory()])
    // Armed after renderDialog, never before: it calls resetOrpcServer, which disarms.
    armNetworkFailure()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert — Work is still there, and still holds the text only it can reach.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't save that change — try again.",
      )
    })
    expect(readCategories().map((category) => category.name)).toEqual([
      'General',
      'Work',
    ])
    expect(getLocalNote(12)).toBe('half a thought')
    // The default carries a duplicate until the delete is retried. A copy the
    // user can see and remove beats text nothing can reach again.
    expect(getLocalNote(1)).toBe('already here\nhalf a thought')
  })

  test('carries the rescued draft over once when a rejected delete is retried', async () => {
    // Arrange — the first attempt already appended to the default and left the
    // doomed copy alone, so a second read of that untouched key must not append
    // the same text again.
    const user = userEvent.setup()
    setLocalNote(1, 'already here')
    setLocalNote(12, 'half a thought')
    await renderDialog([defaultCategory, buildCategory()])
    armNetworkFailure()
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Work' })).toBeVisible()
    })

    // Act — retry, this time against a server that answers.
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert — one copy of the draft in the default, not two.
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
      ])
    })
    expect(getLocalNote(1)).toBe('already here\nhalf a thought')
    expect(getLocalNote(12)).toBe('')
  })

  test('deletes an empty category without touching the default draft', async () => {
    // Arrange
    const user = userEvent.setup()
    setLocalNote(1, 'already here')
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert
    await waitFor(() => {
      expect(readCategories()).toHaveLength(1)
    })
    expect(getLocalNote(1)).toBe('already here')
  })
})
