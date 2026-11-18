import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
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
vi.mock('next/link', () => ({
  default: ({ onClick, ...props }: ComponentProps<'a'>) => (
    <a
      {...props}
      onClick={(event) => {
        onClick?.(event)
        event.preventDefault()
      }}
    />
  ),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
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
vi.mock('@/hooks/useCategorySync', () => ({ useCategorySync: (): void => {} }))
vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))
vi.mock('@/hooks/useSelectedCategory', () => ({
  useSelectedCategory: () => [1, select],
  useAutoSelectDefaultCategory: (): void => {},
}))

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.clearAllMocks()
})

test('sidebar links from Skill Tree open the child journal and preserve its search', () => {
  // Arrange
  window.history.replaceState(
    null,
    '',
    '/skill-tree?date=2026-10-01&filter=pending&search=Release',
  )
  render(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )
  const subcategories = screen.getByRole('list', { name: 'Work subcategories' })
  const child = within(subcategories).getByRole('link', {
    name: 'Work / CoreLive',
  })
  // Act
  fireEvent.click(child)
  // Assert
  expect(child).toBeVisible()
  expect(select).toHaveBeenCalledExactlyOnceWith(2)
  expect(child).toHaveAttribute(
    'href',
    '/home?search=Release&category=2#journal',
  )
  expect(screen.getByRole('link', { name: 'Work' })).toBeVisible()
})

test('sidebar highlights the category from the current journal URL and clears the highlight when it is removed', () => {
  // Arrange
  window.history.replaceState(null, '', '/home?category=2#journal')
  const sidebar = (
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>
  )
  const { rerender } = render(sidebar)
  const child = screen.getByRole('link', { name: 'Work / CoreLive' })
  expect(child).toHaveAttribute('aria-current', 'location')
  expect(screen.getByRole('link', { name: 'Work' })).not.toHaveAttribute(
    'aria-current',
  )

  // Act
  window.history.replaceState(null, '', '/home#journal')
  rerender(
    <SidebarProvider>
      <Category onOpenManageAction={vi.fn()} />
    </SidebarProvider>,
  )

  // Assert
  expect(child).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('link', { name: 'Work' })).not.toHaveAttribute(
    'aria-current',
  )
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
