import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
  it('offers a way into LiveEditor, the only surface that creates tasks', () => {
    // Arrange
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    )

    // Act
    const liveEditorLink = screen.getByRole('link', { name: /LiveEditor/i })

    // Assert: without this entry a browser user has no route to LiveEditor at
    // all — Home is a read-only dashboard since the Todo write paths were
    // retired, so the sidebar is the only inbound link.
    expect(liveEditorLink).toHaveAttribute('href', '/live-editor')
  })

  it('keeps Home and Skill Tree reachable alongside LiveEditor', () => {
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
  })
})
