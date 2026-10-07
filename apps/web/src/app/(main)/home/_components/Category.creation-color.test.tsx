import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import type { CategoryWithCount } from '@/server/schemas/category'

import { Category } from './Category'

const { create, currentCategories } = vi.hoisted(() => ({
  create: vi.fn(),
  currentCategories: { rows: [] as CategoryWithCount[] },
}))

const CATEGORIES: CategoryWithCount[] = [
  {
    id: 1,
    name: 'Work',
    color: 'rose',
    parentId: null,
    userId: 1,
    isDefault: false,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    recordCount: 0,
    _count: { todos: 0 },
  },
  {
    id: 2,
    name: 'CoreLive',
    color: 'rose',
    parentId: 1,
    userId: 1,
    isDefault: false,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    recordCount: 0,
    _count: { todos: 0 },
  },
  {
    id: 3,
    name: 'Learning',
    color: 'violet',
    parentId: null,
    userId: 1,
    isDefault: false,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    recordCount: 0,
    _count: { todos: 0 },
  },
  {
    id: -123,
    name: 'Creating parent',
    color: 'blue',
    parentId: null,
    userId: 0,
    isDefault: false,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    recordCount: 0,
    _count: { todos: 0 },
  },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { categories: currentCategories.rows } }),
}))
vi.mock('@/lib/orpc/client-query', () => ({
  orpc: { category: { list: { queryOptions: () => ({}) } } },
}))
vi.mock('@/hooks/useCategoryMutations', () => ({
  useCategoryMutations: () => ({
    createMutation: { mutate: create, isPending: false },
  }),
}))
vi.mock('@/hooks/useCategorySync', () => ({ useCategorySync: () => {} }))
vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))
vi.mock('@/hooks/useSelectedCategory', () => ({
  useSelectedCategory: () => [1, vi.fn()],
  useAutoSelectDefaultCategory: () => {},
}))

beforeEach(() => {
  currentCategories.rows = [...CATEGORIES]
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  create.mockReset()
})

test('an explicit category color survives choosing and changing its parent', async () => {
  // Arrange
  const user = userEvent.setup()
  render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add category' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Category name' }),
    'Design',
  )
  await user.click(screen.getByRole('button', { name: 'Select green color' }))
  // Act
  await user.click(screen.getByRole('combobox', { name: 'Parent category' }))
  await user.click(screen.getByRole('option', { name: 'Work' }))
  await user.click(screen.getByRole('combobox', { name: 'Parent category' }))
  await user.click(screen.getByRole('option', { name: 'Learning' }))
  await user.click(screen.getByRole('button', { name: 'Create' }))
  // Assert
  expect(
    screen.getByRole('button', { name: 'Select green color' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(create).toHaveBeenCalledWith(
    { name: 'Design', color: 'green', parentId: 3 },
    expect.anything(),
  )
})

test('an untouched color follows the selected parent and returns to blue for a main category', async () => {
  // Arrange
  const user = userEvent.setup()
  render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add category' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Category name' }),
    'Design',
  )
  // Act
  await user.click(screen.getByRole('combobox', { name: 'Parent category' }))
  await user.click(screen.getByRole('option', { name: 'Work' }))
  expect(
    screen.getByRole('button', { name: 'Select rose color' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Create' }))
  await user.click(screen.getByRole('combobox', { name: 'Parent category' }))
  await user.click(screen.getByRole('option', { name: 'None — main category' }))
  await user.click(screen.getByRole('button', { name: 'Create' }))
  // Assert
  expect(create).toHaveBeenNthCalledWith(
    1,
    { name: 'Design', color: 'rose', parentId: 1 },
    expect.anything(),
  )
  expect(create).toHaveBeenNthCalledWith(
    2,
    { name: 'Design', color: 'blue', parentId: null },
    expect.anything(),
  )
})

test('successful creation resets the explicit color so the next child inherits its parent', async () => {
  // Arrange
  const user = userEvent.setup()
  create.mockImplementation(
    (_input: unknown, callbacks: { onSuccess: () => void }) =>
      callbacks.onSuccess(),
  )
  render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add category' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Category name' }),
    'First',
  )
  await user.click(screen.getByRole('button', { name: 'Select green color' }))
  await user.click(screen.getByRole('button', { name: 'Create' }))
  // Act
  await user.click(screen.getByRole('button', { name: 'Add category' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Category name' }),
    'Second',
  )
  await user.click(screen.getByRole('combobox', { name: 'Parent category' }))
  await user.click(screen.getByRole('option', { name: 'Work' }))
  await user.click(screen.getByRole('button', { name: 'Create' }))
  // Assert
  expect(create).toHaveBeenNthCalledWith(
    2,
    { name: 'Second', color: 'rose', parentId: 1 },
    expect.anything(),
  )
})
