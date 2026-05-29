import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CategoryWithCount } from '@/server/schemas/category'

import {
  PasteImportDialog,
  type PasteImportDialogProps,
} from './PasteImportDialog'

const CATEGORIES: CategoryWithCount[] = [
  {
    id: 1,
    name: 'General',
    color: 'blue',
    isDefault: true,
    userId: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    _count: { todos: 0 },
  },
]

/**
 * Renders the dialog open with sane defaults; per-test overrides via `props`.
 */
function renderDialog(props: Partial<PasteImportDialogProps> = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <PasteImportDialog
      zone="completed"
      categories={CATEGORIES}
      defaultCategoryId={1}
      open={true}
      onOpenChange={onOpenChange}
      isSubmitting={false}
      error={null}
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { onConfirm, onOpenChange }
}

describe('PasteImportDialog', () => {
  it('shows the warm empty hint and disables confirm when there is nothing to import', () => {
    // Arrange + Act
    renderDialog({ initialText: '' })

    // Assert
    expect(
      screen.getByText('nothing to import yet — paste a few lines above'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add 0 to Completed/ }),
    ).toBeDisabled()
  })

  it('lists parsed rows and labels the confirm with the importable count', () => {
    // Arrange — 2 real lines, 1 blank.
    renderDialog({ initialText: 'shipped release\n\nreviewed PRs' })

    // Act + Assert
    expect(screen.getByText('shipped release')).toBeInTheDocument()
    expect(screen.getByText('reviewed PRs')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add 2 to Completed' }),
    ).toBeEnabled()
  })

  it('shows the over-cap line and caps the confirm label at 1,000', () => {
    // Arrange — 1,200 non-blank lines.
    const text = Array.from({ length: 1200 }, (_, i) => `task ${i}`).join('\n')
    renderDialog({ initialText: text })

    // Assert — exact copy from the spec, with locale commas.
    expect(
      screen.getByText('1,200 lines · importing the first 1,000'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add 1,000 to Completed' }),
    ).toBeInTheDocument()
  })

  it('shows the Todo expectation note in the Todo zone', () => {
    // Arrange + Act
    renderDialog({ zone: 'todo', initialText: 'draft plan\nbook venue' })

    // Assert
    expect(
      screen.getByText(
        "these stay open — they'll light the heatmap as you complete them",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add 2 to your list' }),
    ).toBeInTheDocument()
  })

  it('sends only the parsed titles with the inherited category on confirm', async () => {
    // Arrange
    const { onConfirm } = renderDialog({
      initialText: '- gym\n\n- [x] read',
    })

    // Act — click the amber confirm.
    const confirm = screen.getByRole('button', { name: 'Add 2 to Completed' })
    confirm.click()

    // Assert — blank line dropped; both rows carry the shared category id (1).
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith([
      { title: 'gym', categoryId: 1 },
      { title: 'read', categoryId: 1 },
    ])
  })

  it('locks the confirm and shows the adding state while submitting', () => {
    // Arrange + Act
    renderDialog({ initialText: 'shipped release', isSubmitting: true })

    // Assert
    const confirm = screen.getByRole('button', { name: /Adding/ })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps the dialog open with a Try again action and an alert on error', () => {
    // Arrange + Act
    renderDialog({
      initialText: 'shipped release',
      error: "Couldn't reach the server — your paste is safe",
    })

    // Assert — the paste is preserved in the textarea, the error is announced,
    // and a retry control is offered (the dialog stays open).
    expect(screen.getByRole('textbox')).toHaveValue('shipped release')
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't reach the server — your paste is safe",
    )
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  })
})
