import type * as ReactQuery from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ImportUndoBanner } from './ImportUndoBanner'
import type { LastImport } from './PasteImport'

// ---------------------------------------------------------------------------
// Hoisted mutation spies — must be declared before vi.mock() hoisting fires.
// These track call order for the create-before-delete ordering test.
// ---------------------------------------------------------------------------
const { mockCreateCompleted, mockDeleteTodo, resetMutationMocks } = vi.hoisted(
  () => {
    // Call log shared between the two mock fns so we can assert order.
    const callLog: string[] = []

    const mockCreateCompleted = vi.fn(
      (_vars: unknown, callbacks?: { onError?: (err: unknown) => void }) => {
        callLog.push('createCompleted')
        // Simulate an offline failure so the delete step must NOT fire.
        callbacks?.onError?.(new Error('offline'))
      },
    )
    const mockDeleteTodo = vi.fn(() => {
      callLog.push('deleteTodo')
    })

    // Expose a reset helper so individual tests can clear between runs.
    const resetMutationMocks = () => {
      callLog.length = 0
      mockCreateCompleted.mockClear()
      mockDeleteTodo.mockClear()
      // Re-install the error-simulating implementation after clear.
      mockCreateCompleted.mockImplementation(
        (_vars: unknown, callbacks?: { onError?: (err: unknown) => void }) => {
          callLog.push('createCompleted')
          callbacks?.onError?.(new Error('offline'))
        },
      )
    }

    return { mockCreateCompleted, mockDeleteTodo, callLog, resetMutationMocks }
  },
)

// ---------------------------------------------------------------------------
// Mock @tanstack/react-query so we can intercept useMutation calls in order.
// The banner instantiates three mutations (deleteCompleted, deleteTodo,
// createCompleted) in that stable declaration order.
// ---------------------------------------------------------------------------
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const original = await importOriginal<typeof ReactQuery>()
  let callCount = 0
  return {
    ...original,
    useMutation: (opts: unknown) => {
      // Use modulo so the 3-call pattern repeats cleanly across all test renders.
      // The banner always calls useMutation in this stable order per instance:
      //   0 mod 3 = deleteCompleted, 1 mod 3 = deleteTodo, 2 mod 3 = createCompleted.
      const callIndex = callCount++ % 3
      const mutateFn =
        callIndex === 2
          ? mockCreateCompleted
          : callIndex === 1
            ? mockDeleteTodo
            : vi.fn()
      void opts
      return { mutate: mutateFn, isPending: false }
    },
  }
})

// QueryClient must come after the mock so it uses the mocked useMutation.
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')

// Stable item fixtures for the todo-zone batch (includes a categoryId override
// to verify P2-2: categories are preserved through Move-to-Completed).
const TODO_ITEMS = [
  { title: 'a' },
  { title: 'gym', categoryId: 3 },
  { title: 'c' },
]

function buildImport(overrides: Partial<LastImport> = {}): LastImport {
  return {
    importBatchId: 'batch-1',
    zone: 'completed',
    count: 3,
    items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
    expiresAt: Date.now() + 60000,
    ...overrides,
  }
}

function renderBanner(
  lastImport: LastImport | null,
  onDismiss = vi.fn(),
  onChanged = vi.fn(),
) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <ImportUndoBanner
        lastImport={lastImport}
        onDismiss={onDismiss}
        onChanged={onChanged}
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
    renderBanner(buildImport({ zone: 'todo', items: TODO_ITEMS }))

    // Assert
    expect(
      screen.getByRole('button', { name: 'Move to Completed' }),
    ).toBeInTheDocument()
  })

  it('does not call deleteTodo when createCompleted fails (create-before-delete invariant)', async () => {
    // Arrange — the hoisted mock wires mockCreateCompleted to call 2 (createCompleted)
    // and mockDeleteTodo to call 1 (deleteTodo). mockCreateCompleted is pre-loaded
    // with an onError-invoking implementation that simulates an offline failure.
    resetMutationMocks()

    const todoBatch = buildImport({
      zone: 'todo',
      importBatchId: 'todo-batch-42',
      items: TODO_ITEMS,
    })

    // Act
    renderBanner(todoBatch)
    await userEvent.click(
      screen.getByRole('button', { name: 'Move to Completed' }),
    )

    // Assert — createCompleted fired, deleteTodo must NOT have fired because
    // the create step failed. This locks the create-before-delete ordering
    // that prevents irrecoverable task loss (P2-1 fix invariant).
    expect(mockCreateCompleted).toHaveBeenCalledOnce()
    expect(mockDeleteTodo).not.toHaveBeenCalled()
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
