import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { AppSidebar } from './AppSidebar'

// The sidebar's siblings each pull in Clerk, oRPC or Electron bridges. This
// spec is only about the nav links, so they are stubbed to nothing.
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn() }),
}))
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
  test('keeps Home and Skill Tree reachable and offers no LiveEditor entry', () => {
    // Arrange
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    )

    // Act
    const home = screen.getByRole('link', { name: /Home/i })
    const skillTree = screen.getByRole('link', { name: /Skill Tree/i })

    // Assert
    expect(home).toHaveAttribute('href', '/home')
    expect(skillTree).toHaveAttribute('href', '/skill-tree')
    expect(screen.queryByRole('link', { name: /LiveEditor/i })).toBeNull()
  })
})
