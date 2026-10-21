import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ApplicationProviders } from './ApplicationProviders'

const state = vi.hoisted(() => ({ path: '/desktop-auth', effects: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path }))
vi.mock('@/components/CategoryChangeSync', () => ({
  CategoryChangeSync: () => {
    state.effects('categories')
    return null
  },
}))
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
  OfflineSettingsSync: () => {
    state.effects('offline-settings')
    return null
  },
}))
vi.mock('@/components/live-editor/LocalKeepMergeSync', () => ({
  LocalKeepMergeSync: () => {
    state.effects('guest-import')
    return null
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
  test('hidden credential refresh never imports guest completions or synchronizes application settings', () => {
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
    state.path = '/write'

    // Act
    render(
      <ApplicationProviders>
        <span>Writing page</span>
      </ApplicationProviders>,
    )

    // Assert
    expect(screen.getByText('Writing page')).toBeVisible()
    expect(state.effects.mock.calls).toEqual([
      ['settings'],
      ['offline-settings'],
      ['guest-import'],
      ['categories'],
    ])
  })
})
