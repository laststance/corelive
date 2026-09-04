/**
 * @fileoverview `/write` page pin. If these fail, a stranger sees a spinner (or
 * nothing) before Clerk resolves, or a signed-out visitor triggers a server read.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WritePage from './page'

const { clerkUserRef, useQueryMock } = vi.hoisted(() => ({
  clerkUserRef: {
    current: { isLoaded: false, isSignedIn: undefined } as {
      isLoaded: boolean
      isSignedIn: boolean | undefined
    },
  },
  useQueryMock: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserRef.current,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
}))

vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    category: {
      list: { queryOptions: () => ({ queryKey: ['category', 'list'] }) },
    },
  },
}))

// The editor has its own suite; here it only reports what the page handed it.
vi.mock('@/components/live-editor/LiveEditor', () => ({
  LiveEditor: ({
    categories,
    isCategoryListPending,
  }: {
    categories: { name: string }[]
    isCategoryListPending?: boolean
  }) => (
    <div data-testid="live-editor" data-pending={String(isCategoryListPending)}>
      {categories.map((category) => category.name).join(',')}
    </div>
  ),
}))

beforeEach(() => {
  clerkUserRef.current = { isLoaded: false, isSignedIn: undefined }
  useQueryMock.mockReset()
  useQueryMock.mockReturnValue({ data: undefined, isPending: false })
})

describe('/write page', () => {
  it('paints the editor at first paint, before Clerk resolves — no spinner', () => {
    // Arrange: Clerk has not loaded yet.

    // Act
    render(<WritePage />)

    // Assert
    expect(screen.getByTestId('live-editor')).toBeInTheDocument()
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('never reads categories from the server while signed out', () => {
    // Arrange
    clerkUserRef.current = { isLoaded: true, isSignedIn: false }

    // Act
    render(<WritePage />)

    // Assert
    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
    expect(screen.getByTestId('live-editor')).toHaveTextContent('')
  })

  it('tells the editor the category list is still in flight, so it stops inviting a keep', () => {
    // Arrange — signed in, `category.list` round trip not back yet.
    clerkUserRef.current = { isLoaded: true, isSignedIn: true }
    useQueryMock.mockReturnValue({ data: undefined, isPending: true })

    // Act
    render(<WritePage />)

    // Assert
    expect(screen.getByTestId('live-editor')).toHaveAttribute(
      'data-pending',
      'true',
    )
  })

  it('never reports pending while signed out, where a disabled query is pending forever', () => {
    // Arrange — TanStack keeps a disabled query in `pending` with no fetch in
    // flight, so the signed-in check is the whole difference.
    clerkUserRef.current = { isLoaded: true, isSignedIn: false }
    useQueryMock.mockReturnValue({ data: undefined, isPending: true })

    // Act
    render(<WritePage />)

    // Assert
    expect(screen.getByTestId('live-editor')).toHaveAttribute(
      'data-pending',
      'false',
    )
  })

  it("hands a signed-in visitor their account's categories", () => {
    // Arrange
    clerkUserRef.current = { isLoaded: true, isSignedIn: true }
    useQueryMock.mockReturnValue({
      data: { categories: [{ name: 'Today' }, { name: 'Work' }] },
      isPending: false,
    })

    // Act
    render(<WritePage />)

    // Assert
    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
    expect(screen.getByTestId('live-editor')).toHaveTextContent('Today,Work')
  })
})
