import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { installHomeFixture } from '../../scripts/qa-web/homeFixture'

// The fixture's Vite aliases are mirrored with vi.mock so the page renders exactly as `pnpm qa:web` does.
vi.mock('@clerk/nextjs', async () => import('../../scripts/qa-web/clerk'))
vi.mock(
  'next/navigation',
  async () => import('../../scripts/qa-web/navigation'),
)
vi.mock('next/link', async () => import('../../scripts/qa-web/link'))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('the Home view still renders its sidebar and Completed card against the in-page fake router', async () => {
  // Arrange
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  // Act
  render(
    <QueryClientProvider client={query}>
      {installHomeFixture(new URLSearchParams('view=home'))}
    </QueryClientProvider>,
  )

  // Assert
  expect(await screen.findByText('Reading')).toBeVisible()
})
