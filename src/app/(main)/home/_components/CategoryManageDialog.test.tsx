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
