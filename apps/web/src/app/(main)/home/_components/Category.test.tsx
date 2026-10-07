import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import type { CategoryWithCount } from '@/server/schemas/category'

import { Category } from './Category'

const { select, create } = vi.hoisted(() => ({
  select: vi.fn(),
  create: vi.fn(),
}))
const CATEGORIES: CategoryWithCount[] = [
  {
    id: 1,
    name: 'Work',
    color: 'blue',
    parentId: null,
    userId: 1,
    isDefault: false,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    recordCount: 1,
    _count: { todos: 0 },
  },
  {
    id: 2,
    name: 'CoreLive',
    color: 'blue',
    parentId: 1,
    userId: 1,
    isDefault: false,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    recordCount: 3,
    _count: { todos: 0 },
  },
]
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { categories: CATEGORIES } }),
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
  useSelectedCategory: () => [1, select],
  useAutoSelectDefaultCategory: () => {},
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('sidebar keeps children visible inside their parent and selects their actual writing category', () => {
  // Arrange
  render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  const subcategories = screen.getByRole('list', { name: 'Work subcategories' })
  const child = within(subcategories).getByRole('button', {
    name: 'Work / CoreLive',
  })
  // Act
  fireEvent.click(child)
  // Assert
  expect(child).toBeVisible()
  expect(select).toHaveBeenCalledExactlyOnceWith(2)
  expect(screen.getByRole('button', { name: 'Work' })).toBeVisible()
})

test('sidebar category creation does not submit Japanese input while composition is active', async () => {
  // Arrange
  const user = userEvent.setup()
  render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add category' }))
  const name = screen.getByRole('textbox', { name: 'Category name' })
  fireEvent.change(name, { target: { value: 'Design' } })
  // Act
  fireEvent.keyDown(name, { key: 'Enter', keyCode: 229, isComposing: true })
  // Assert
  expect(create).not.toHaveBeenCalled()
  fireEvent.keyDown(name, { key: 'Enter', keyCode: 13, isComposing: false })
  expect(create).toHaveBeenCalledWith(
    { name: 'Design', color: 'blue', parentId: null },
    expect.anything(),
  )
})
