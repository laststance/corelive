import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { installHomeFixture } from '../../scripts/qa-dashboard/homeFixture'

// The fixture's Vite aliases are mirrored with vi.mock so the page renders exactly as `pnpm qa:dashboard` does.
vi.mock('@clerk/nextjs', async () => import('../../scripts/qa-dashboard/clerk'))
vi.mock(
  'next/navigation',
  async () => import('../../scripts/qa-dashboard/navigation'),
)
vi.mock('next/link', async () => import('../../scripts/qa-dashboard/link'))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('the Dashboard shows the same synthetic completions in recent activity and the searchable journal', async () => {
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
  expect(
    await screen.findByRole('heading', { name: 'Recent activity' }),
  ).toBeVisible()
  expect(await screen.findByText('Sketch the first spread')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute(
    'href',
    '/home#journal',
  )
})
