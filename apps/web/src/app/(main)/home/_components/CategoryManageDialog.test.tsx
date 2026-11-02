/**
 * @fileoverview The dialog runs on the real {@link useCategoryMutations}, the
 * real TanStack cache and the real oRPC client; MSW answers `/api/orpc/*`.
 * Assertions read the server's table, not a spy —
 * a stubbed mutation would report the call and prove nothing landed.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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

import type * as CategorySyncModule from '@/lib/category-sync-channel'
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

beforeAll(() => orpcServer.listen({ onUnhandledFrame: 'error' }))
afterEach(() => orpcServer.resetHandlers())
afterAll(() => orpcServer.close())

beforeEach(() => {
  vi.clearAllMocks()
  resetOrpcServer()
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
      within(confirmation).getByText(/direct entries will move to Today/),
    ).toBeVisible()
    expect(
      within(confirmation).getByRole('combobox', { name: 'Move entries to' }),
    ).toHaveTextContent('Today')
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

  test('previews and promotes children when the parent is deleted', async () => {
    // Arrange
    const user = userEvent.setup()
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
      within(confirmation).getByText(/1 direct entry will move to General/),
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
  })

  test('deleting a child defaults its entries to the parent', async () => {
    // Arrange
    const user = userEvent.setup()
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

  test('moves a child to a main category', async () => {
    // Arrange
    const user = userEvent.setup()
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
  })
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

describe('CategoryManageDialog deletion', () => {
  /**
   * Opens the delete confirmation for Work over a table that also holds Reading.
   * @returns The user-event driver.
   * @example
   * const user = await openDeleteConfirmationForWork()
   */
  async function openDeleteConfirmationForWork() {
    const user = userEvent.setup()
    await renderDialog([
      defaultCategory,
      buildCategory({ recordCount: 2 }),
      buildCategory({ id: 13, name: 'Reading' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    return user
  }

  test('tells the visitor that desktop writing stays on each Mac and they choose where to keep it after sync', async () => {
    // Arrange
    await openDeleteConfirmationForWork()

    // Act
    const confirmation = screen.getByRole('alertdialog')

    // Assert
    expect(
      within(confirmation).getByText(
        /2 direct entries will move to General\. Your entries will be kept\. Writing in the desktop app stays on each Mac\. After it syncs, you choose where to keep it\./,
      ),
    ).toBeVisible()
  })

  test('deletes through category.delete exactly once without touching browser storage', async () => {
    // Arrange
    const user = await openDeleteConfirmationForWork()
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
        'Reading',
      ])
    })
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    getItem.mockRestore()
    setItem.mockRestore()
  })

  test('shows Deleting and disables the button while the delete is pending', async () => {
    // Arrange
    const user = await openDeleteConfirmationForWork()
    const release = holdRequests()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert
    const pending = await screen.findByRole('button', { name: 'Deleting…' })
    expect(pending).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  test('keeps the chosen destination and lets the visitor retry after a failed delete', async () => {
    // Arrange
    const user = await openDeleteConfirmationForWork()
    await user.click(screen.getByRole('combobox', { name: 'Move entries to' }))
    await user.click(screen.getByRole('option', { name: 'Reading' }))
    armNetworkFailure()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not confirm the change',
    )
    expect(
      screen.getByRole('combobox', { name: 'Move entries to' }),
    ).toHaveTextContent('Reading')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
        'Reading',
      ])
    })
  })

  test('closes quietly when a retried delete finds the category already gone', async () => {
    // Arrange: the first attempt succeeded but its response was lost, so the
    // dialog still lists Work while the server no longer does.
    const user = await openDeleteConfirmationForWork()
    resetOrpcServer([
      defaultCategory,
      buildCategory({ id: 13, name: 'Reading' }),
    ])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(toast.error).not.toHaveBeenCalled()
  })

  test('stays open with an inline error and falls back to the default destination when the chosen destination vanished', async () => {
    // Arrange
    const user = await openDeleteConfirmationForWork()
    await user.click(screen.getByRole('combobox', { name: 'Move entries to' }))
    await user.click(screen.getByRole('option', { name: 'Reading' }))
    resetOrpcServer([defaultCategory, buildCategory({ recordCount: 2 })])

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Category not found',
    )
    expect(toast.error).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: 'Move entries to' }),
      ).toHaveTextContent('General')
    })
    expect(screen.getByRole('alertdialog')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })
})
