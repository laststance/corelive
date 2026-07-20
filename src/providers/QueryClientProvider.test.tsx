import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const capturedPersistOptions = vi.hoisted(
  (): { maxAge: number | undefined } => ({ maxAge: undefined }),
)

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

vi.mock('@tanstack/query-sync-storage-persister', () => ({
  createSyncStoragePersister: () => ({
    persistClient: vi.fn(),
    removeClient: vi.fn(),
    restoreClient: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-query-persist-client', () => ({
  // Explicit ReactNode return type: React 19's ReactNode union includes
  // promises, which otherwise trips promise-function-async on this sync mock.
  PersistQueryClientProvider: ({
    children,
    persistOptions,
  }: {
    children: ReactNode
    persistOptions: { maxAge?: number }
  }): ReactNode => {
    capturedPersistOptions.maxAge = persistOptions.maxAge
    return children
  },
}))

import { QueryClientProvider } from './QueryClientProvider'

describe('QueryClientProvider persistence', () => {
  it('keeps persisted Home data reusable for seven days before expiring it', () => {
    // Arrange and Act
    render(
      <QueryClientProvider>
        <span>Home content</span>
      </QueryClientProvider>,
    )

    // Assert
    expect(screen.getByText('Home content')).toBeInTheDocument()
    expect(capturedPersistOptions.maxAge).toBe(604_800_000)
  })
})
