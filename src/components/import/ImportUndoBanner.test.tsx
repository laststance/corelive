import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImportUndoBanner } from './ImportUndoBanner'
import type { LastImport } from './PasteImport'

function buildImport(overrides: Partial<LastImport> = {}): LastImport {
  return {
    importBatchId: 'batch-1',
    zone: 'completed',
    count: 3,
    titles: ['a', 'b', 'c'],
    expiresAt: Date.now() + 60000,
    ...overrides,
  }
}

function renderBanner(lastImport: LastImport | null) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <ImportUndoBanner
        lastImport={lastImport}
        onDismiss={vi.fn()}
        onChanged={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('ImportUndoBanner', () => {
  it('renders the just-imported count without a render loop', () => {
    // Arrange + Act — a fresh batch within the undo window.
    renderBanner(buildImport())

    // Assert — mounts cleanly (a getSnapshot loop would throw max-depth here).
    expect(screen.getByText('Imported 3 just now')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Undo import' }),
    ).toBeInTheDocument()
  })

  it('offers Move to Completed only for a Todo-zone batch', () => {
    // Arrange + Act
    renderBanner(buildImport({ zone: 'todo' }))

    // Assert
    expect(
      screen.getByRole('button', { name: 'Move to Completed' }),
    ).toBeInTheDocument()
  })

  it('renders nothing when there is no recent import', () => {
    // Arrange + Act
    const { container } = renderBanner(null)

    // Assert
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the undo window has already expired', () => {
    // Arrange + Act — expiry in the past.
    const { container } = renderBanner(
      buildImport({ expiresAt: Date.now() - 1000 }),
    )

    // Assert
    expect(container).toBeEmptyDOMElement()
  })
})
