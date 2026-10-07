import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

test('sidebar creation offers only confirmed main categories as parents', async () => {
  // Arrange
  const user = userEvent.setup()
  render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add category' }))
  // Act
  await user.click(screen.getByRole('combobox', { name: 'Parent category' }))
  // Assert
  expect(screen.getByRole('option', { name: 'Work' })).toBeVisible()
  expect(screen.getByRole('option', { name: 'Learning' })).toBeVisible()
  expect(screen.queryByRole('option', { name: 'Creating parent' })).toBeNull()
  expect(screen.queryByRole('option', { name: 'CoreLive' })).toBeNull()
})

test('a parent removed during creation cannot be submitted by button or Enter', async () => {
  // Arrange
  const user = userEvent.setup()
  const view = render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add category' }))
  const name = screen.getByRole('textbox', { name: 'Category name' })
  await user.type(name, 'Design')
  await user.click(screen.getByRole('combobox', { name: 'Parent category' }))
  await user.click(screen.getByRole('option', { name: 'Work' }))
  // Act
  currentCategories.rows = CATEGORIES.filter((category) => category.id !== 1)
  view.rerender(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  fireEvent.keyDown(name, { key: 'Enter', keyCode: 13 })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))
  // Assert
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Choose an available main category.',
  )
  expect(create).not.toHaveBeenCalled()
})

test('a parent moved underneath another category cannot receive a third-level child', async () => {
  // Arrange
  const user = userEvent.setup()
  const view = render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add category' }))
  const name = screen.getByRole('textbox', { name: 'Category name' })
  await user.type(name, 'Design')
  await user.click(screen.getByRole('combobox', { name: 'Parent category' }))
  await user.click(screen.getByRole('option', { name: 'Learning' }))
  // Act
  currentCategories.rows = CATEGORIES.map((category) =>
    category.id === 3 ? { ...category, parentId: 1 } : category,
  )
  view.rerender(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  fireEvent.keyDown(name, { key: 'Enter', keyCode: 13 })
  // Assert
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  expect(create).not.toHaveBeenCalled()
})
