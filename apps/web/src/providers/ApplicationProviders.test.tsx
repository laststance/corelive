import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ApplicationProviders } from './ApplicationProviders'

const state = vi.hoisted(() => ({ path: '/desktop-auth', effects: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path }))
vi.mock('@/components/code-inspector/CodeInspectorClient', () => ({
  CodeInspectorClient: () => null,
}))
vi.mock('@/components/electron/ElectronStartupSync', () => ({
  ElectronStartupSync: () => {
    state.effects('settings')
    return null
  },
}))
vi.mock('@/components/electron/OfflineSettingsSync', () => ({
  OfflineSettingsSync: ({ children }: { children: ReactNode }) => {
    state.effects('offline-settings')
    return <>{children}</>
  },
}))
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }))
vi.mock('@/lib/orpc/electron-auth-provider', () => ({
  ElectronAuthProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/lib/redux/providers', () => ({
  ReduxProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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
  state.effects.mockClear()
})

describe('broker route isolation', () => {
  test('hidden credential refresh never synchronizes application settings', () => {
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
    expect(state.effects).not.toHaveBeenCalled()
  })

  test('ordinary web routes keep their existing synchronization providers', () => {
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
    expect(state.effects.mock.calls).toEqual([
      ['settings'],
      ['offline-settings'],
    ])
  })
})
