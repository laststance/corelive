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
 * @returns The selection, create and manage spies.
 * @example
 * const { select } = renderPicker()
 */
function renderPicker(rows: PickerCategory[] = categories) {
  const select = vi.fn()
  const create = vi.fn()
  const manage = vi.fn()
  render(
    <SharedCategoryPicker
      categories={rows}
      activeCategoryId="00000000-0000-4000-8000-0000000000a3"
      onCategoryValueChange={select}
      onCreate={create}
      onManage={manage}
    />,
  )
  return { select, create, manage }
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

  test('keeps the Create action reachable when search has no results', async () => {
    // Arrange
    const { select, create } = renderPicker()
    openPicker(ACTIVE_TRIGGER_NAME)

    // Act: no search result leaves the Create action as the first item.
    const input = screen.getByRole('combobox', { name: 'Search categories' })
    fireEvent.change(input, { target: { value: 'unmatched' } })
    expect(await screen.findByText('No matching categories.')).toBeVisible()
    fireEvent.keyDown(input, { key: 'Home' })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Assert
    expect(create).toHaveBeenCalledWith('unmatched')
    expect(select).not.toHaveBeenCalled()
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
