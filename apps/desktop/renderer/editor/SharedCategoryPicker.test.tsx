// @vitest-environment happy-dom
/**
 * @fileoverview SharedCategoryPicker pins ported from the deleted web
 * LiveEditorCategoryPicker suite (#215). If these fail, the desktop panel's
 * category search misses parent/child paths, closes on an IME confirmation, or offers account actions while signed out.
 */
import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import {
  SharedCategoryPicker,
  type PickerCategory,
} from './SharedCategoryPicker'

const categories: PickerCategory[] = [
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    name: 'General',
    parentId: null,
  },
  { id: '00000000-0000-4000-8000-0000000000a2', name: 'Work', parentId: null },
  {
    id: '00000000-0000-4000-8000-0000000000a3',
    name: 'CoreLive',
    parentId: '00000000-0000-4000-8000-0000000000a2',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a4',
    name: 'Client work',
    parentId: '00000000-0000-4000-8000-0000000000a2',
  },
]

const ACTIVE_TRIGGER_NAME = 'Writing category: Work / CoreLive'

beforeAll(() => {
  // cmdk measures and scrolls its list; happy-dom implements neither.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(cleanup)

/**
 * Mounts the shared picker the way the desktop panel does, with spies for every callback.
 * @param rows - Category rows to offer.
 * @returns The selection and category command spies.
 * @example
 * const { select } = renderPicker()
 */
function renderPicker(rows: PickerCategory[] = categories) {
  const select = vi.fn()
  const command = vi.fn(async () => ({ ok: true as const }))
  render(
    <SharedCategoryPicker
      categories={rows}
      activeCategoryId="00000000-0000-4000-8000-0000000000a3"
      onCategoryValueChange={select}
      onCategoryCommand={command}
    />,
  )
  return { select, command }
}

/**
 * Opens the popover from the trigger button.
 * @param name - Accessible name of the trigger.
 * @returns The trigger element.
 * @example
 * openPicker(ACTIVE_TRIGGER_NAME)
 */
function openPicker(name: string): HTMLElement {
  const trigger = screen.getByRole('combobox', { name })
  fireEvent.click(trigger)
  return trigger
}

describe('SharedCategoryPicker', () => {
  test('finds a child category by normalized parent and child terms and selects it', async () => {
    // Arrange
    const { select } = renderPicker()
    const trigger = openPicker(ACTIVE_TRIGGER_NAME)

    // Act: full-width "ＷＯＲＫ" must match the parent "Work".
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Search categories' }),
      {
        target: { value: 'ＷＯＲＫ client' },
      },
    )

    // Assert
    expect(
      await screen.findByRole('option', { name: 'Work / Client work' }),
    ).toBeVisible()
    expect(screen.queryByRole('option', { name: /CoreLive/ })).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: 'Work / Client work' }))
    expect(select).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000a4')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  test('keeps the Create action reachable when search has no results and opens its form with the typed name', async () => {
    // Arrange
    const { select } = renderPicker()
    openPicker(ACTIVE_TRIGGER_NAME)

    // Act: no search result leaves the Create action as the first item.
    const input = screen.getByRole('combobox', { name: 'Search categories' })
    fireEvent.change(input, { target: { value: 'unmatched' } })
    expect(await screen.findByText('No matching categories.')).toBeVisible()
    fireEvent.keyDown(input, { key: 'Home' })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Assert
    expect(
      await screen.findByRole('form', { name: 'Create category' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Name')).toHaveValue('unmatched')
    expect(select).not.toHaveBeenCalled()
  })

  test('shows the duplicate-name refusal inline and keeps the form open with the typed value', async () => {
    // Arrange
    const command = vi.fn(async () => ({
      ok: false as const,
      reason: 'name-taken-local',
    }))
    render(
      <SharedCategoryPicker
        categories={categories}
        activeCategoryId="00000000-0000-4000-8000-0000000000a1"
        onCategoryValueChange={vi.fn()}
        onCategoryCommand={command}
      />,
    )
    openPicker('Writing category: General')
    fireEvent.click(await screen.findByText('Create category…'))
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Work' },
    })

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There\'s already a category called "Work" here.',
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Work')
    expect(screen.getByRole('form', { name: 'Create category' })).toBeVisible()
  })

  test('hides rename, move and delete for the default category and explains why', async () => {
    // Arrange
    render(
      <SharedCategoryPicker
        categories={[
          { ...categories[0]!, isDefault: true },
          ...categories.slice(1),
        ]}
        activeCategoryId="00000000-0000-4000-8000-0000000000a1"
        onCategoryValueChange={vi.fn()}
        onCategoryCommand={vi.fn(async () => ({ ok: true as const }))}
      />,
    )
    openPicker('Writing category: General')

    // Act
    fireEvent.click(await screen.findByText('Manage categories…'))
    fireEvent.click(await screen.findByRole('button', { name: 'General' }))

    // Assert
    expect(
      await screen.findByText(
        'General is your default category. You can change its color.',
      ),
    ).toBeVisible()
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete category' })).toBeNull()
  })

  test('IME composition Enter and Escape keep the picker open without selecting', () => {
    // Arrange
    const { select } = renderPicker()
    openPicker(ACTIVE_TRIGGER_NAME)
    const input = screen.getByRole('combobox', { name: 'Search categories' })

    // Act
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true, keyCode: 229 })

    // Assert
    expect(input).toBeVisible()
    expect(select).not.toHaveBeenCalled()
  })
})
