import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

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
    ['/home', '/home?search=reading&category=2#journal'],
    ['/skill-tree', '/home#journal'],
  ])(
    'opens the journal from %s with the applicable journal filters',
    (pathname, expectedHref) => {
      // Arrange
      navigation.usePathname.mockReturnValueOnce(pathname)
      navigation.useSearchParams.mockImplementationOnce(
        () => new URLSearchParams('date=2026-11-18&search=reading&category=2'),
      )

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
    },
  )
})
