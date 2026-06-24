// @vitest-environment node
import type { ClipboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { interceptBulkPaste } from './interceptBulkPaste'

/**
 * Builds the minimal paste event `interceptBulkPaste` reads — the clipboard
 * payload plus the input's current value and selection range — with a spied
 * `preventDefault` so a test can assert whether the native paste was suppressed.
 *
 * @param options - The pasted `text`, and the input's `value` / `selectionStart` / `selectionEnd` (defaults model an empty, fully-selected field).
 * @returns `{ event, preventDefault }` — the event to pass in, and the spy to assert the native-paste suppression against.
 */
function makePasteEvent({
  text,
  value = '',
  selectionStart = 0,
  selectionEnd = value.length,
}: {
  text: string
  value?: string
  selectionStart?: number
  selectionEnd?: number
}): { event: ClipboardEvent<HTMLInputElement>; preventDefault: () => void } {
  const preventDefault = vi.fn()
  const event = {
    clipboardData: { getData: () => text },
    currentTarget: { value, selectionStart, selectionEnd },
    preventDefault,
  } as unknown as ClipboardEvent<HTMLInputElement>
  return { event, preventDefault }
}

// Each test is named for the paste gesture's observable outcome on a todo/task
// input: an intercepted paste opens the bulk import dialog (and the native paste
// is suppressed); a fall-through paste lands as ordinary text. A regression here
// hits BOTH the home AddTodoForm and the Floating Navigator input at once, since
// they now share this single handler (Issue #110 AC#1/#2/#3).
describe('interceptBulkPaste', () => {
  it('opens the bulk import dialog and suppresses native paste when a multi-line list is pasted into the empty input', () => {
    // Arrange: empty input (so it is fully selected), a wired bulk handler.
    const onBulkPaste = vi.fn()
    const { event, preventDefault } = makePasteEvent({
      text: 'buy milk\nwalk the dog\ncall mom',
    })

    // Act
    interceptBulkPaste(event, onBulkPaste)

    // Assert: the whole list is routed to the dialog verbatim, native paste blocked.
    expect(onBulkPaste).toHaveBeenCalledTimes(1)
    expect(onBulkPaste).toHaveBeenCalledWith('buy milk\nwalk the dog\ncall mom')
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('lets a single-line paste fall through as an ordinary add (no dialog, native paste preserved)', () => {
    // Arrange
    const onBulkPaste = vi.fn()
    const { event, preventDefault } = makePasteEvent({ text: 'just one task' })

    // Act
    interceptBulkPaste(event, onBulkPaste)

    // Assert: bulk path untouched and the browser's own paste proceeds.
    expect(onBulkPaste).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('does not hijack a multi-line paste made mid-edit (caret not over a full selection)', () => {
    // Arrange: the field already holds a draft and the caret sits at its end with
    // nothing selected — intercepting here would destroy what the user is writing.
    const onBulkPaste = vi.fn()
    const { event, preventDefault } = makePasteEvent({
      text: 'first\nsecond',
      value: 'draft note',
      selectionStart: 10,
      selectionEnd: 10,
    })

    // Act
    interceptBulkPaste(event, onBulkPaste)

    // Assert: native paste wins so the in-progress draft is preserved.
    expect(onBulkPaste).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('intercepts a multi-line paste over a fully selected non-empty field (select-all then paste)', () => {
    // Arrange: the user selected all existing text, so the paste replaces the
    // whole value — that is the bulk-replace gesture, not a mid-edit insert.
    const onBulkPaste = vi.fn()
    const { event, preventDefault } = makePasteEvent({
      text: 'first\nsecond',
      value: 'old draft',
      selectionStart: 0,
      selectionEnd: 'old draft'.length,
    })

    // Act
    interceptBulkPaste(event, onBulkPaste)

    // Assert
    expect(onBulkPaste).toHaveBeenCalledWith('first\nsecond')
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('never intercepts when no bulk handler is wired (paste stays fully native)', () => {
    // Arrange: a surface that opted out of bulk import passes no callback.
    const { event, preventDefault } = makePasteEvent({
      text: 'buy milk\nwalk the dog',
    })

    // Act
    interceptBulkPaste(event, undefined)

    // Assert: even a multi-line paste falls through untouched.
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
