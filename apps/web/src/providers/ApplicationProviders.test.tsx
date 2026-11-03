import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ApplicationProviders } from './ApplicationProviders'

const state = vi.hoisted(() => ({ path: '/desktop-auth', mounted: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path }))
vi.mock('@/components/code-inspector/CodeInspectorClient', () => ({
  CodeInspectorClient: () => null,
}))
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }))
vi.mock('@/lib/orpc/electron-auth-provider', () => ({
  ElectronAuthProvider: ({ children }: { children: ReactNode }) => {
    state.mounted('auth')
    return <>{children}</>
  },
}))
vi.mock('@/providers/QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/providers/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

afterEach(() => {
  cleanup()
  state.mounted.mockClear()
})

describe('broker route isolation', () => {
  test('hidden credential refresh mounts no application providers', () => {
    // Arrange
    state.path = '/desktop-auth'

    // Act
    render(
      <ApplicationProviders>
        <span>Credential page</span>
      </ApplicationProviders>,
    )

    // Assert
    expect(screen.getByText('Credential page')).toBeVisible()
    expect(state.mounted).not.toHaveBeenCalled()
  })

  test('ordinary web routes keep the desktop auth provider', () => {
    // Arrange
    state.path = '/home'

    // Act
    render(
      <ApplicationProviders>
        <span>Home page</span>
      </ApplicationProviders>,
    )

    // Assert
    expect(screen.getByText('Home page')).toBeVisible()
    expect(state.mounted.mock.calls).toEqual([['auth']])
  })
})
