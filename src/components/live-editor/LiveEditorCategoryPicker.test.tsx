import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest'

import type { CategoryWithCount } from '@/server/schemas/category'
import {
  armNetworkFailure,
  orpcServer,
  readCategories,
  resetOrpcServer,
} from '@/test/orpcServer'

import { LiveEditorCategoryPicker } from './LiveEditorCategoryPicker'

vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))

const categories: CategoryWithCount[] = [
  {
    id: 1,
    name: 'General',
    color: 'blue',
    parentId: null,
    isDefault: true,
    userId: 1,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    _count: { todos: 0 },
    recordCount: 0,
  },
  {
    id: 2,
    name: 'Work',
    color: 'amber',
    parentId: null,
    isDefault: false,
    userId: 1,
    createdAt: new Date('2026-09-02'),
    updatedAt: new Date('2026-09-02'),
    _count: { todos: 0 },
    recordCount: 1,
  },
  {
    id: 3,
    name: 'CoreLive',
    color: 'amber',
    parentId: 2,
    isDefault: false,
    userId: 1,
    createdAt: new Date('2026-09-03'),
    updatedAt: new Date('2026-09-03'),
    _count: { todos: 0 },
    recordCount: 3,
  },
  {
    id: 4,
    name: 'Client work',
    color: 'rose',
    parentId: 2,
    isDefault: false,
    userId: 1,
    createdAt: new Date('2026-09-04'),
    updatedAt: new Date('2026-09-04'),
    _count: { todos: 0 },
    recordCount: 2,
  },
]

/**
 * Mounts the actual picker and forms with the category API fixture for observable UI checks.
 * @returns Selection spy, retaining the trigger's controlled active destination.
 * @example
 * const select = renderPicker()
 */
function renderPicker(rows = categories, signedIn = true) {
  const select = vi.fn()
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <LiveEditorCategoryPicker
        categories={rows}
        activeCategoryId={3}
        isSignedIn={signedIn}
        isElectronPanel={false}
        onCategoryValueChange={select}
      />
    </QueryClientProvider>,
  )
  return select
}

beforeAll(() => orpcServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => orpcServer.resetHandlers())
afterAll(() => orpcServer.close())
beforeEach(() => resetOrpcServer(categories))

test('shows the current writing path and finds children by normalized parent and child terms', async () => {
  // Arrange
  const user = userEvent.setup()
  const select = renderPicker()
  const trigger = screen.getByRole('combobox', {
    name: 'Writing category: Work / CoreLive',
  })
  // Act
  await user.click(trigger)
  await user.type(
    screen.getByRole('combobox', { name: 'Search categories' }),
    'ＷＯＲＫ client',
  )
  // Assert
  expect(
    screen.getByRole('option', { name: 'Work / Client work' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('option', { name: /CoreLive/ }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('option', { name: 'Work / Client work' }))
  expect(select).toHaveBeenCalledWith('4')
  await waitFor(() => expect(trigger).toHaveFocus())
})

test('opens management without sending an action identity to the writing selection', async () => {
  // Arrange
  const user = userEvent.setup()
  const select = renderPicker()
  // Act
  await user.click(
    screen.getByRole('combobox', { name: 'Writing category: Work / CoreLive' }),
  )
  await user.click(screen.getByRole('option', { name: 'Manage categories…' }))
  // Assert
  expect(
    await screen.findByRole('dialog', { name: 'Manage Categories' }),
  ).toBeVisible()
  expect(select).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', {
        name: 'Writing category: Work / CoreLive',
      }),
    ).toHaveFocus(),
  )
})

test('creates from search and selects only the confirmed server category', async () => {
  // Arrange
  const user = userEvent.setup()
  const select = renderPicker()
  // Act
  await user.click(
    screen.getByRole('combobox', { name: 'Writing category: Work / CoreLive' }),
  )
  await user.type(
    screen.getByRole('combobox', { name: 'Search categories' }),
    'Reading',
  )
  await user.click(screen.getByRole('option', { name: 'Create category…' }))
  expect(
    screen.getByRole('textbox', { name: 'New category name' }),
  ).toHaveValue('Reading')
  await user.click(screen.getByRole('button', { name: 'Add' }))
  // Assert
  await waitFor(() => expect(select).toHaveBeenCalledWith('5'))
  expect(readCategories().find((category) => category.id === 5)).toMatchObject({
    name: 'Reading',
    parentId: null,
  })
})

test('retains failed creation input and the previous writing destination', async () => {
  // Arrange
  const user = userEvent.setup()
  const select = renderPicker()
  // Act
  await user.click(
    screen.getByRole('combobox', { name: 'Writing category: Work / CoreLive' }),
  )
  await user.click(screen.getByRole('option', { name: 'Create category…' }))
  await user.type(
    screen.getByRole('textbox', { name: 'New category name' }),
    'Reading',
  )
  armNetworkFailure()
  await user.click(screen.getByRole('button', { name: 'Add' }))
  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not confirm',
  )
  expect(
    screen.getByRole('textbox', { name: 'New category name' }),
  ).toHaveValue('Reading')
  expect(select).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(select).not.toHaveBeenCalled()
})

test('does not select pending IDs and keeps actions accessible when there are no search results', async () => {
  // Arrange
  const user = userEvent.setup()
  const original = categories.find((category) => category.id === 3)
  if (!original) throw new Error('Missing CoreLive fixture')
  const select = renderPicker([
    ...categories,
    { ...original, id: -1, name: 'Pending' },
  ])
  // Act
  await user.click(
    screen.getByRole('combobox', { name: 'Writing category: Work / CoreLive' }),
  )
  // Assert
  expect(
    screen.getByRole('option', { name: 'Work / Pending' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await user.type(
    screen.getByRole('combobox', { name: 'Search categories' }),
    'unmatched',
  )
  expect(screen.getByText('No matching categories.')).toBeVisible()
  await user.keyboard('{Home}{Enter}')
  expect(screen.getByRole('dialog', { name: 'New category' })).toBeVisible()
  expect(select).not.toHaveBeenCalled()
})

test('composition Enter and Escape keep the picker open without selecting', async () => {
  // Arrange
  const user = userEvent.setup()
  const select = renderPicker()
  await user.click(
    screen.getByRole('combobox', { name: 'Writing category: Work / CoreLive' }),
  )
  const input = screen.getByRole('combobox', { name: 'Search categories' })
  // Act
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
  fireEvent.keyDown(input, { key: 'Escape', isComposing: true, keyCode: 229 })
  // Assert
  expect(input).toBeVisible()
  expect(select).not.toHaveBeenCalled()
})

test('signed-out writing never offers authenticated create or management actions', async () => {
  // Arrange
  const user = userEvent.setup()
  const original = categories.find((category) => category.id === 1)
  if (!original) throw new Error('Missing General fixture')
  renderPicker([{ ...original, id: 0, name: 'Local' }], false)
  // Act
  await user.click(
    screen.getByRole('combobox', { name: 'Writing category: No categories' }),
  )
  // Assert
  expect(
    screen.queryByRole('option', { name: 'Create category…' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('option', { name: 'Manage categories…' }),
  ).not.toBeInTheDocument()
})
