/**
 * @fileoverview The dialog runs on the real {@link useCategoryMutations}, the
 * real TanStack cache and the real oRPC client; MSW answers `/api/orpc/*`.
 * Assertions read the server's table and the device's localStorage, not a spy —
 * a stubbed mutation would report the call and prove nothing landed.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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

import * as CategorySyncModule from '@/lib/category-sync-channel'
import {
  getCategoryDraftRescueReceipt,
  prepareCategoryDraftRescueReceipt,
} from '@/lib/live-editor/categoryDraftRescueReceipts'
import { CATEGORY_DRAFT_RESCUE_STORAGE_KEY } from '@/lib/live-editor/constants'
import { getLocalNote, setLocalNote } from '@/lib/live-editor/localNoteStore'
import { orpc } from '@/lib/orpc/client-query'
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

vi.mock('@/lib/category-sync-channel', async (importOriginal) => ({
  ...(await importOriginal<typeof CategorySyncModule>()),
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
    parentId: null,
    recordCount: 0,
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
 * @param failingCall - `'read'` fails every read; `'write'` fails every write,
 *   so the text never reaches the default category.
 * @returns The bridge's note table, to assert what survived on the device.
 * @example
 * const notes = installFailingLiveEditorBridge('read')
 */
function installFailingLiveEditorBridge(
  failingCall: 'read' | 'write',
): Map<number, string> {
  const notes = new Map<number, string>([[12, 'half a thought']])
  window.liveEditorAPI = {
    window: {
      close: async () => {},
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
        if (failingCall === 'write') throw new Error('Failed to write note')
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
 * Installs a bridge that never resolves the doomed category's read until the
 * spec releases it, making the window between confirming a delete and the
 * rescue finishing real enough to click into.
 * @returns The bridge's note table, plus one resolver per read it was asked
 *   for — the count is how many rescues actually started.
 * @example
 * const { notes, heldReads } = installHeldReadLiveEditorBridge()
 */
function installHeldReadLiveEditorBridge(): {
  notes: Map<number, string>
  heldReads: Array<(text: string) => void>
} {
  const notes = new Map<number, string>([
    [1, 'already here'],
    [12, 'half a thought'],
  ])
  const heldReads: Array<(text: string) => void> = []
  window.liveEditorAPI = {
    window: {
      close: async () => {},
      setOpacity: async () => {},
      getOpacity: async () => 1,
      getBounds: async () => null,
      setBounds: async () => {},
    },
    note: {
      // Only the doomed category hangs; the default still reads normally, so
      // the append itself is never what this spec is waiting on.
      get: async (categoryId) =>
        categoryId === 12
          ? new Promise<string>((resolve) => {
              heldReads.push(resolve)
            })
          : Promise.resolve(notes.get(categoryId) ?? ''),
      set: async (categoryId, text) => {
        notes.set(categoryId, text)
      },
    },
    spaces: {
      getVisibleOnAllWorkspaces: async () => false,
      setVisibleOnAllWorkspaces: async (enabled) => enabled,
    },
  }
  return { notes, heldReads }
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

  const onOpenChange = vi.fn()
  render(<CategoryManageDialog open onOpenChange={onOpenChange} />, { wrapper })
  const lastCategory = categories.at(-1)
  const parent = categories.find(
    (category) => category.id === lastCategory?.parentId,
  )
  const lastRowName =
    lastCategory && parent
      ? `${parent.name} / ${lastCategory.name}`
      : lastCategory?.name
  if (lastRowName)
    await screen.findByRole('button', {
      name: `${categories.at(-1)?.isDefault ? 'Recolor' : 'Rename'} ${lastRowName}`,
    })
  return { queryClient, onOpenChange }
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

  test('retains the name until creation is confirmed', async () => {
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
    expect(field.value).toBe('Reading')
    expect(field).toBeDisabled()

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
    expect(
      await screen.findByText(
        (_content, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent === 'Reading — Creating…',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Rename Reading' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete Reading' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Recolor General' }),
    ).toBeVisible()

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

  test('lets the default category be recolored but never renamed', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Recolor General' }))
    const renameBox = screen.queryByRole('textbox', { name: 'Rename category' })
    const editor = screen.getByRole('button', { name: 'Save changes' })
      .parentElement?.parentElement
    if (!editor) throw new Error('Inline editor missing')
    await user.click(
      within(editor).getByRole('combobox', { name: 'Category color' }),
    )
    await user.click(screen.getByRole('option', { name: 'violet' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    // Assert — edit mode offered no rename box, and only the color changed.
    expect(renameBox).not.toBeInTheDocument()
    await waitFor(() => {
      expect(readCategories()[0]).toMatchObject({
        name: 'General',
        color: 'violet',
      })
    })
  })

  test('renames a category through to the server', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Rename Work' }))
    await user.clear(screen.getByDisplayValue('Work'))
    await user.type(
      screen.getByRole('textbox', { name: 'Rename category' }),
      'Reading{Enter}',
    )

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
    expect(
      within(confirmation).getByText(/direct records will move to Today/),
    ).toBeVisible()
    expect(
      within(confirmation).getByRole('combobox', { name: 'Move entries to' }),
    ).toHaveTextContent('Today')
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
    // The doomed copy is left behind on purpose. Wiping it is the one move here
    // that can destroy text: a rejected delete restores the category with its
    // draft, and the retry skips the re-append, so the wipe would take away the
    // last reachable copy. The orphan is unreachable and ids never repeat.
    expect(getLocalNote(12)).toBe('half a thought')
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
      ])
    })
  })

  test('rescues a draft that is only a fragment of a line the default already holds', async () => {
    // Arrange — the guard against re-appending compares the doomed draft with
    // the default's text. Compare it loosely and notes disappear: "milk" reads
    // as already rescued because "buy milk today" contains those letters, and
    // the delete then orphans the only copy of it.
    const user = userEvent.setup()
    setLocalNote(1, 'buy milk today')
    setLocalNote(12, 'milk')
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert — it arrives as its own line, because it is its own note. Both
    // reads are polled: `readCategories` hits the MSW table, and the server
    // delete lands after the append, so asserting it outside the wait races.
    await waitFor(() => {
      expect(getLocalNote(1)).toBe('buy milk today\nmilk')
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
      ])
    })
  })

  test('appends the rescued draft once when the delete is confirmed twice', async () => {
    // Arrange — the doomed read is held open on purpose. A bridge that resolves
    // normally finishes the whole rescue between the two clicks, and this spec
    // would then pass against code with no guard at all.
    const user = userEvent.setup()
    const { notes, heldReads } = installHeldReadLiveEditorBridge()
    await renderDialog([defaultCategory, buildCategory()])

    // Act — confirm, then confirm again while the first rescue is still
    // reading. The action button is a Close, so the confirmation is already
    // gone, the row is still listed, and `isPending` is still false.
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(
      screen.getByRole('button', { name: 'Moving writing…' }),
    ).toBeDisabled()

    // Assert — the second confirmation started no second rescue. Counting reads
    // rather than diffing the merged text keeps this independent of how two
    // concurrent appends would happen to interleave.
    expect(heldReads).toHaveLength(1)

    // And the one rescue that did run lands the draft exactly once.
    heldReads.forEach((releaseRead) => releaseRead('half a thought'))
    await waitFor(() => {
      expect(notes.get(1)).toBe('already here\nhalf a thought')
    })
    // The ignored confirmation is silent: nothing failed, so nothing is said.
    expect(toast.error).not.toHaveBeenCalled()
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
    expect(screen.getByRole('alertdialog')).toBeVisible()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your original draft is retained',
    )
    expect(readCategories().map((category) => category.name)).toEqual([
      'General',
      'Work',
    ])
  })

  test('keeps the category when the rescued draft cannot be written to the default', async () => {
    // Arrange — the read works but the write into the default rejects, so the
    // text reached nowhere. Deleting on a half-finished rescue would strand it
    // under an id nothing can reach, same as a failed read.
    const user = userEvent.setup()
    const notes = installFailingLiveEditorBridge('write')
    await renderDialog([defaultCategory, buildCategory()])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert — Work survives, still holding the only copy of its draft.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your original draft is retained',
    )
    expect(readCategories().map((category) => category.name)).toEqual([
      'General',
      'Work',
    ])
    expect(notes.get(12)).toBe('half a thought')
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your original draft is retained',
    )

    // Act — retry the retained confirmation against a server that answers.
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert — one copy of the draft in the default, not two.
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
      ])
    })
    expect(getLocalNote(1)).toBe('already here\nhalf a thought')
    // Never wiped, on either attempt — the copy the retry relies on.
    expect(getLocalNote(12)).toBe('half a thought')
  })

  test('appends the rescued draft once when the manager is reopened between two delete attempts', async () => {
    // Arrange — the first attempt fails, so the doomed copy is deliberately
    // left where it is. Closing the manager empties the in-memory "already
    // rescued" set, and that lost state is the whole point of this spec.
    const user = userEvent.setup()
    setLocalNote(1, 'already here')
    setLocalNote(12, 'half a thought')
    await renderDialog([defaultCategory, buildCategory()])
    armNetworkFailure()
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    // Waits on the append itself, not on the row returning: the retry must not
    // repeat work that has already landed.
    await waitFor(() => {
      expect(getLocalNote(1)).toBe('already here\nhalf a thought')
    })

    // Act — unmount the manager, mount a fresh one, retry against a server
    // that answers. Nothing in React remembers the first attempt.
    cleanup()
    await renderDialog([defaultCategory, buildCategory()])
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert — the draft the first attempt already moved is not moved twice.
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
      ])
    })
    expect(getLocalNote(1)).toBe('already here\nhalf a thought')
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

describe('two-level category organization', () => {
  test('creates a subcategory beneath the chosen parent with its inherited color', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog([defaultCategory, buildCategory({ color: 'amber' })])
    // Act
    await user.click(
      screen.getByRole('button', { name: 'Add subcategory to Work' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'New category name' }),
      'CoreLive',
    )
    await user.click(screen.getByRole('button', { name: 'Add' }))
    // Assert
    await waitFor(() =>
      expect(
        readCategories().find((category) => category.name === 'CoreLive'),
      ).toMatchObject({ parentId: 12, color: 'amber' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Rename Work / CoreLive' }),
    ).toBeVisible()
  })

  test('retains failed creation input for an explicit retry', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog([defaultCategory, buildCategory()])
    await user.type(
      screen.getByRole('textbox', { name: 'New category name' }),
      'Reading',
    )
    armNetworkFailure()
    // Act
    await user.click(screen.getByRole('button', { name: 'Add' }))
    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not confirm',
    )
    expect(
      screen.getByRole('textbox', { name: 'New category name' }),
    ).toHaveValue('Reading')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(
        readCategories().find((category) => category.name === 'Reading'),
      ).toMatchObject({ parentId: null }),
    )
  })

  test('previews and promotes children while rescuing only the deleted parent draft', async () => {
    // Arrange
    const user = userEvent.setup()
    setLocalNote(1, 'existing')
    setLocalNote(12, 'parent writing')
    setLocalNote(13, 'child writing')
    await renderDialog([
      defaultCategory,
      buildCategory({ recordCount: 1 }),
      buildCategory({ id: 13, name: 'CoreLive', parentId: 12, recordCount: 3 }),
    ])
    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    // Assert
    const confirmation = screen.getByRole('alertdialog')
    expect(
      within(confirmation).getByText(/1 direct records will move to General/),
    ).toBeVisible()
    expect(
      within(confirmation).getByText(/CoreLive will become main categories/),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(
        readCategories().map((category) => [category.id, category.parentId]),
      ).toEqual([
        [1, null],
        [13, null],
      ]),
    )
    expect(getLocalNote(1)).toBe('existing\nparent writing')
    expect(getLocalNote(13)).toBe('child writing')
  })

  test('deleting a child defaults its entries and writing to the parent', async () => {
    // Arrange
    const user = userEvent.setup()
    setLocalNote(12, 'work writing')
    setLocalNote(13, 'child writing')
    await renderDialog([
      defaultCategory,
      buildCategory(),
      buildCategory({ id: 13, name: 'CoreLive', parentId: 12 }),
    ])
    // Act
    await user.click(
      screen.getByRole('button', { name: 'Delete Work / CoreLive' }),
    )
    // Assert
    expect(
      screen.getByRole('combobox', { name: 'Move entries to' }),
    ).toHaveTextContent('Work')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(readCategories().map((category) => category.id)).toEqual([1, 12]),
    )
    expect(getLocalNote(12)).toBe('work writing\nchild writing')
    expect(getLocalNote(1)).toBe('')
  })

  test('blocks parent deletion when promotion would create a duplicate main category', async () => {
    // Arrange
    const user = userEvent.setup()
    await renderDialog([
      defaultCategory,
      buildCategory(),
      buildCategory({ id: 13, name: 'CoreLive', parentId: 12 }),
      buildCategory({ id: 14, name: 'CoreLive' }),
    ])
    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Rename these subcategories before deleting: CoreLive',
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(readCategories()).toHaveLength(4)
  })

  test('moves a child to a main category without changing its draft ID', async () => {
    // Arrange
    const user = userEvent.setup()
    setLocalNote(13, 'child writing')
    await renderDialog([
      defaultCategory,
      buildCategory(),
      buildCategory({ id: 13, name: 'CoreLive', parentId: 12 }),
    ])
    // Act
    await user.click(
      screen.getByRole('button', { name: 'Rename Work / CoreLive' }),
    )
    const editor = screen.getByRole('button', { name: 'Save changes' })
      .parentElement?.parentElement
    if (!editor) throw new Error('Missing inline editor')
    await user.click(
      within(editor).getByRole('combobox', { name: 'Parent category' }),
    )
    await user.click(
      screen.getByRole('option', { name: 'None — main category' }),
    )
    // Assert
    expect(
      screen.getByText('Past entries will be grouped under the new parent.'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(
        readCategories().find((category) => category.id === 13),
      ).toMatchObject({ parentId: null, name: 'CoreLive' }),
    )
    expect(getLocalNote(13)).toBe('child writing')
  })
})

test('preserves independently written identical drafts instead of mistaking the first rescue for a retry', async () => {
  // Arrange
  const user = userEvent.setup()
  setLocalNote(1, 'same thought')
  setLocalNote(12, 'same thought')
  await renderDialog([defaultCategory, buildCategory()])
  // Act
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  await waitFor(() => expect(readCategories()).toHaveLength(1))
  expect(getLocalNote(1)).toBe('same thought\nsame thought')
})

test('keyboard Enter chooses an edit color without submitting the category prematurely', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderDialog([defaultCategory, buildCategory()])
  await user.click(screen.getByRole('button', { name: 'Rename Work' }))
  const editor = screen.getByRole('button', { name: 'Save changes' })
    .parentElement?.parentElement
  if (!editor) throw new Error('Missing inline editor')
  const color = within(editor).getByRole('combobox', { name: 'Category color' })
  color.focus()
  // Act
  await user.keyboard('{Enter}{ArrowDown}{Enter}')
  // Assert
  expect(screen.getByRole('textbox', { name: 'Rename category' })).toBeVisible()
  expect(readCategories().find((category) => category.id === 12)?.color).toBe(
    'blue',
  )
  expect(color).toHaveTextContent('green')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(readCategories().find((category) => category.id === 12)?.color).toBe(
      'green',
    ),
  )
})

test('returns focus and allows Escape after the category being edited disappears', async () => {
  // Arrange
  const user = userEvent.setup()
  const { queryClient, onOpenChange } = await renderDialog([
    defaultCategory,
    buildCategory(),
  ])
  await user.click(screen.getByRole('button', { name: 'Rename Work' }))
  // Act
  resetOrpcServer([defaultCategory])
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
  })
  // Assert
  expect(await screen.findByRole('status')).toHaveTextContent(
    'This category is no longer available.',
  )
  expect(
    screen.getByRole('textbox', { name: 'New category name' }),
  ).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('restores the source once when a saved rescue copy was removed before retrying a failed delete', async () => {
  // Arrange
  const user = userEvent.setup()
  setLocalNote(1, 'existing')
  setLocalNote(12, 'half a thought')
  await renderDialog([defaultCategory, buildCategory()])
  armNetworkFailure()
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your original draft is retained',
  )
  expect(getLocalNote(1)).toBe('existing\nhalf a thought')
  const firstNotification = vi
    .mocked(CategorySyncModule.broadcastCategorySync)
    .mock.calls.find((call) => call[0] === 1)?.[1]
  // Act — destination writing is edited in another window while the server category remains.
  setLocalNote(1, 'existing')
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  await waitFor(() =>
    expect(readCategories().map((category) => category.id)).toEqual([1]),
  )
  expect(getLocalNote(1)).toBe('existing\nhalf a thought')
  const lastNotification = vi
    .mocked(CategorySyncModule.broadcastCategorySync)
    .mock.calls.filter((call) => call[0] === 1)
    .at(-1)?.[1]
  expect(firstNotification?.receipt).toBeTruthy()
  expect(lastNotification?.receipt).not.toBe(firstNotification?.receipt)
})

test('retires a confirmed deleted source receipt while preserving another pending source', async () => {
  // Arrange
  const user = userEvent.setup()
  const uuid = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
  setLocalNote(1, 'existing')
  setLocalNote(12, 'half a thought')
  prepareCategoryDraftRescueReceipt(13, 1, 'existing', 'other pending writing')
  await renderDialog([
    defaultCategory,
    buildCategory(),
    buildCategory({ id: 13, name: 'Reading' }),
  ])
  // Act
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  await waitFor(() =>
    expect(readCategories().map((category) => category.id)).toEqual([1, 13]),
  )
  await waitFor(() =>
    expect(
      getCategoryDraftRescueReceipt(12, 1, 'half a thought'),
    ).toBeUndefined(),
  )
  expect(getCategoryDraftRescueReceipt(13, 1, 'other pending writing')).toEqual(
    {
      receipt: '00000000-0000-4000-8000-000000000001',
      identity: '[13,1,"other pending writing"]',
      baseText: 'existing',
      text: 'other pending writing',
      state: 'prepared',
    },
  )
  expect(
    JSON.parse(localStorage.getItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY) ?? '[]'),
  ).toHaveLength(1)
  expect(getLocalNote(12)).toBe('half a thought')
  uuid.mockRestore()
})

test('retains receipt evidence after a failed server delete for a later retry', async () => {
  // Arrange
  const user = userEvent.setup()
  setLocalNote(1, 'existing')
  setLocalNote(12, 'half a thought')
  await renderDialog([defaultCategory, buildCategory()])
  armNetworkFailure()
  // Act
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your original draft is retained',
  )
  expect(readCategories().map((category) => category.id)).toEqual([1, 12])
  expect(getCategoryDraftRescueReceipt(12, 1, 'half a thought')).toMatchObject({
    state: 'saved',
    text: 'half a thought',
  })
})
