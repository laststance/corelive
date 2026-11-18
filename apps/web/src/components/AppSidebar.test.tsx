import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { AppSidebar } from './AppSidebar'

// The sidebar's siblings each pull in Clerk, oRPC or Electron bridges. This
// spec is only about the nav links, so they are stubbed to nothing.
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}))
const navigation = vi.hoisted(() => ({
  usePathname: vi.fn(() => '/home'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))
vi.mock('next/navigation', () => navigation)
vi.mock('@/app/(main)/home/_components/Category', () => ({
  Category: () => null,
}))
vi.mock('@/app/(main)/home/_components/CategoryManageDialog', () => ({
  CategoryManageDialog: () => null,
}))
vi.mock('@/app/(main)/home/_components/LogoutButton', () => ({
  LogoutButton: () => null,
}))
vi.mock('@/components/ThemeSelectorMenuItem', () => ({
  ThemeSelectorMenuItem: () => null,
}))
vi.mock('@/components/auth/ElectronLoginForm', () => ({
  useIsElectron: () => false,
}))

describe('AppSidebar', () => {
  beforeEach(() => {
    navigation.usePathname.mockReset()
    navigation.useSearchParams.mockReset()
  })

  test('links to Dashboard, Journal, Skill Tree and Settings', () => {
    // Arrange
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    )

    // Act
    const dashboard = screen.getByRole('link', { name: 'Dashboard' })
    const journal = screen.getByRole('link', { name: 'Journal' })
    const skillTree = screen.getByRole('link', { name: 'Skill Tree' })
    const settings = screen.getByRole('link', { name: 'Settings' })

    // Assert
    expect(dashboard).toHaveAttribute('href', '/home')
    expect(dashboard).toHaveAttribute('aria-current', 'page')
    expect(dashboard).toBeVisible()
    expect(journal).toHaveAttribute('href', '/home#journal')
    expect(skillTree).toHaveAttribute('href', '/skill-tree')
    expect(settings).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('link', { name: /LiveEditor/i })).toBeNull()
  })
  test.each([
    [
      '/home',
      'date=2026-11-18&search=reading&category=2',
      '/home?search=reading&category=2#journal',
    ],
    ['/home', 'search=reading&filter=', '/home?search=reading&filter=#journal'],
    ['/skill-tree', 'search=reading&category=2', '/home#journal'],
  ])('links from %s?%s to %s', (pathname, query, expectedHref) => {
    // Arrange
    navigation.usePathname.mockReturnValue(pathname)
    navigation.useSearchParams.mockReturnValue(new URLSearchParams(query))

    // Act
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    )

    // Assert
    expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute(
      'href',
      expectedHref,
    )
    expect(screen.getByRole('button', { name: 'Account' })).toBeVisible()
  })
})
