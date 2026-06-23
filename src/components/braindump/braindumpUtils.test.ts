/**
 * @fileoverview Unit tests for the BrainDump checkbox grammar helpers.
 *
 * These tests pin the parser/serializer behavior the editor relies on for the
 * "tap a `- [ ]` line to mark a Completed" flow. Locking it down here means
 * future refactors of `BrainDumpEditor.tsx` can't silently change the grammar.
 *
 * @module components/braindump/braindumpUtils.test
 */

import { describe, expect, it } from 'vitest'

import {
  COMPLETED_TITLE_MAX_LENGTH,
  insertLineAtIndex,
  lineStartOffset,
  markPlainLineCompleted,
  normalizeCompletedTitle,
  parseAllCheckboxes,
  parseCheckboxLine,
  removeLineAtIndex,
  replaceLineAtIndex,
  setCheckboxStateAtLine,
} from './braindumpUtils'

describe('parseCheckboxLine', () => {
  it('parses an unchecked checkbox line', () => {
    expect(parseCheckboxLine('- [ ] write tests', 3)).toEqual({
      lineIndex: 3,
      checked: false,
      title: 'write tests',
    })
  })

  it('parses a checked checkbox line', () => {
    expect(parseCheckboxLine('- [x] ship it', 0)).toEqual({
      lineIndex: 0,
      checked: true,
      title: 'ship it',
    })
  })

  it('returns null for non-checkbox lines', () => {
    expect(parseCheckboxLine('plain text', 0)).toBeNull()
    expect(parseCheckboxLine('* [ ] wrong bullet', 0)).toBeNull()
    expect(parseCheckboxLine('- [X] uppercase X is not allowed', 0)).toBeNull()
  })

  it('returns null for empty-titled checkbox lines', () => {
    // The regex requires `(.+)` after the marker, so an empty title fails to
    // match outright; the `title.length === 0` guard is defense in depth.
    expect(parseCheckboxLine('- [ ] ', 0)).toBeNull()
  })

  it('trims whitespace from the title', () => {
    expect(parseCheckboxLine('- [ ]   spaced out   ', 0)).toEqual({
      lineIndex: 0,
      checked: false,
      title: 'spaced out',
    })
  })
})

describe('parseAllCheckboxes', () => {
  it('collects checkboxes in document order with correct indices', () => {
    const text = ['plain', '- [ ] todo a', 'mid line', '- [x] done b', ''].join(
      '\n',
    )
    expect(parseAllCheckboxes(text)).toEqual([
      { lineIndex: 1, checked: false, title: 'todo a' },
      { lineIndex: 3, checked: true, title: 'done b' },
    ])
  })

  it('returns an empty array when there are no checkbox lines', () => {
    expect(parseAllCheckboxes('hello\nworld')).toEqual([])
  })
})

describe('setCheckboxStateAtLine', () => {
  it('flips a single line from unchecked to checked', () => {
    const before = '- [ ] todo\nfoo'
    expect(setCheckboxStateAtLine(before, 0, true)).toBe('- [x] todo\nfoo')
  })

  it('flips a single line from checked to unchecked', () => {
    const before = 'foo\n- [x] done'
    expect(setCheckboxStateAtLine(before, 1, false)).toBe('foo\n- [ ] done')
  })

  it('preserves the rest of the document verbatim', () => {
    const before = ['line 0', '- [ ] a', 'line 2', '- [x] b'].join('\n')
    const after = setCheckboxStateAtLine(before, 1, true)
    expect(after).toBe(['line 0', '- [x] a', 'line 2', '- [x] b'].join('\n'))
  })

  it('returns the original text for non-checkbox lines', () => {
    const before = 'plain text\n- [ ] a'
    expect(setCheckboxStateAtLine(before, 0, true)).toBe(before)
  })

  it('returns the original text for out-of-range indices', () => {
    const before = '- [ ] a'
    expect(setCheckboxStateAtLine(before, 5, true)).toBe(before)
    expect(setCheckboxStateAtLine(before, -1, true)).toBe(before)
  })
})

describe('replaceLineAtIndex', () => {
  it('restores a promoted checkbox line back to its original plain prose', () => {
    // Arrange — the optimistic complete command turned 'buy milk' into a checkbox.
    const promoted = '- [x] buy milk\ndishes'

    // Act — roll the first line back to plain prose after a failed create.
    const result = replaceLineAtIndex(promoted, 0, 'buy milk')

    // Assert
    expect(result).toBe('buy milk\ndishes')
  })

  it('replaces only the target line and leaves the rest verbatim', () => {
    // Arrange
    const before = ['line 0', '- [x] line 1', 'line 2'].join('\n')

    // Act
    const after = replaceLineAtIndex(before, 1, 'line 1')

    // Assert
    expect(after).toBe(['line 0', 'line 1', 'line 2'].join('\n'))
  })

  it('returns the original text for out-of-range indices', () => {
    // Arrange
    const before = '- [x] a'

    // Act + Assert
    expect(replaceLineAtIndex(before, 5, 'a')).toBe(before)
    expect(replaceLineAtIndex(before, -1, 'a')).toBe(before)
  })
})

describe('removeLineAtIndex', () => {
  it('drops a finished checkbox line so clear-on-complete leaves the rest verbatim', () => {
    // Arrange — clear-on-complete fires once the undo window closes on a finished line.
    const before = '- [x] buy milk\ndishes'

    // Act — drop the completed first line.
    const result = removeLineAtIndex(before, 0)

    // Assert
    expect(result).toBe('dishes')
  })

  it('removes only the target line and joins the surrounding lines', () => {
    // Arrange
    const before = ['line 0', 'line 1', 'line 2'].join('\n')

    // Act
    const after = removeLineAtIndex(before, 1)

    // Assert
    expect(after).toBe(['line 0', 'line 2'].join('\n'))
  })

  it('returns the original text for out-of-range indices', () => {
    // Arrange
    const before = '- [x] a'

    // Act + Assert
    expect(removeLineAtIndex(before, 5)).toBe(before)
    expect(removeLineAtIndex(before, -1)).toBe(before)
  })
})

describe('insertLineAtIndex', () => {
  it('re-inserts an undone line back at its original middle position', () => {
    // Arrange — the line '- [ ] b' was optimistically cleared from between a and c.
    const cleared = 'a\nc'

    // Act — Undo puts it back at index 1.
    const restored = insertLineAtIndex(cleared, 1, '- [ ] b')

    // Assert
    expect(restored).toBe('a\n- [ ] b\nc')
  })

  it('restores the only line without leaving a trailing blank line', () => {
    // Arrange — clearing the single line emptied the note.
    const cleared = ''

    // Act — Undo restores the original sole line.
    const restored = insertLineAtIndex(cleared, 0, '- [ ] buy milk')

    // Assert — exactly the line, no '- [ ] buy milk\n' tail.
    expect(restored).toBe('- [ ] buy milk')
  })

  it('round-trips a remove then insert back to the original text', () => {
    // Arrange
    const original = '- [ ] one\n- [ ] two\n- [ ] three'

    // Act — clear the middle line, then undo by re-inserting it.
    const cleared = removeLineAtIndex(original, 1)
    const restored = insertLineAtIndex(cleared, 1, '- [ ] two')

    // Assert
    expect(restored).toBe(original)
  })

  it('drops the trailing blank line when the sole content line is cleared then restored (known asymmetry)', () => {
    // Arrange — one line PLUS a trailing newline (the user typed a line then hit
    // Enter). `removeLineAtIndex` already collapses BOTH 'buy milk' and
    // 'buy milk\n' to '', so the trailing blank can never be recovered — this
    // pins that as intentional, not a latent bug. We keep the single-line
    // empty-document round-trip lossless (the `text === ''` early return) at the
    // cost of this trailing newline; restoring content beats a spurious blank.
    const original = 'buy milk\n'

    // Act — clear line 0, then restore it.
    const cleared = removeLineAtIndex(original, 0)
    const restored = insertLineAtIndex(cleared, 0, 'buy milk')

    // Assert — the line content returns; the trailing blank line is dropped.
    expect(cleared).toBe('')
    expect(restored).toBe('buy milk')
  })

  it('clamps an out-of-range index to the document end', () => {
    // Arrange
    const cleared = 'a'

    // Act — a drifted index past the end still lands in-document.
    const restored = insertLineAtIndex(cleared, 9, 'b')

    // Assert
    expect(restored).toBe('a\nb')
  })

  it('inserts at the document head for a negative index', () => {
    // Arrange
    const cleared = 'b\nc'

    // Act
    const restored = insertLineAtIndex(cleared, -3, 'a')

    // Assert
    expect(restored).toBe('a\nb\nc')
  })
})

describe('lineStartOffset', () => {
  it('returns the caret offset at the start of a middle line', () => {
    // Arrange — 'a' (len 1) + '\n' (1) puts line 1 at offset 2.
    const text = 'a\nbb\nccc'

    // Act
    const offset = lineStartOffset(text, 1)

    // Assert
    expect(offset).toBe(2)
  })

  it('returns the caret offset at the start of the third line', () => {
    // Arrange — 'a\n'(2) + 'bb\n'(3) puts line 2 at offset 5.
    const text = 'a\nbb\nccc'

    // Act
    const offset = lineStartOffset(text, 2)

    // Assert
    expect(offset).toBe(5)
  })

  it('drops the caret at the document end when the index is past the last line', () => {
    // Arrange — completing the final line leaves nothing to shift up into its slot.
    const text = 'a\nbb\nccc'

    // Act — index 3 is past the 3 lines (0..2).
    const offset = lineStartOffset(text, 3)

    // Assert — clamp to the document length.
    expect(offset).toBe(8)
  })

  it('returns 0 for the first line', () => {
    // Arrange
    const text = 'first\nsecond'

    // Act + Assert
    expect(lineStartOffset(text, 0)).toBe(0)
  })
})

describe('markPlainLineCompleted', () => {
  it('wraps a plain prose line as a checked checkbox so it can be completed', () => {
    // Arrange
    const text = 'buy milk'

    // Act
    const result = markPlainLineCompleted(text, 0)

    // Assert
    expect(result).toEqual({ text: '- [x] buy milk', title: 'buy milk' })
  })

  it('wraps only the caret line and leaves the rest of the document verbatim', () => {
    // Arrange
    const text = ['line 0', 'second thing', 'line 2'].join('\n')

    // Act
    const result = markPlainLineCompleted(text, 1)

    // Assert
    expect(result).toEqual({
      text: ['line 0', '- [x] second thing', 'line 2'].join('\n'),
      title: 'second thing',
    })
  })

  it('trims surrounding whitespace into the title and the rewritten line', () => {
    // Arrange
    const text = '   spaced out   '

    // Act
    const result = markPlainLineCompleted(text, 0)

    // Assert
    expect(result).toEqual({ text: '- [x] spaced out', title: 'spaced out' })
  })

  it('returns null for an already well-formed checkbox line (toggle path owns it)', () => {
    // Arrange + Act + Assert
    expect(markPlainLineCompleted('- [ ] todo', 0)).toBeNull()
    expect(markPlainLineCompleted('- [x] done', 0)).toBeNull()
  })

  it('returns null for an empty checkbox skeleton so no junk title is logged', () => {
    // Arrange + Act + Assert
    expect(markPlainLineCompleted('- [ ]', 0)).toBeNull()
    expect(markPlainLineCompleted('- [ ] ', 0)).toBeNull()
    expect(markPlainLineCompleted('- [x]', 0)).toBeNull()
    expect(markPlainLineCompleted('- []', 0)).toBeNull()
  })

  it('returns null for a blank line', () => {
    // Arrange + Act + Assert
    expect(markPlainLineCompleted('a\n   \nb', 1)).toBeNull()
  })

  it('returns null for an out-of-range line index', () => {
    // Arrange + Act + Assert
    expect(markPlainLineCompleted('only line', 5)).toBeNull()
    expect(markPlainLineCompleted('only line', -1)).toBeNull()
  })
})

describe('normalizeCompletedTitle', () => {
  it('trims whitespace', () => {
    expect(normalizeCompletedTitle('  hello world  ')).toBe('hello world')
  })

  it('returns the trimmed value when within the schema limit', () => {
    const safe = 'a'.repeat(COMPLETED_TITLE_MAX_LENGTH)
    expect(normalizeCompletedTitle(safe).length).toBe(
      COMPLETED_TITLE_MAX_LENGTH,
    )
  })

  it('caps the title at COMPLETED_TITLE_MAX_LENGTH', () => {
    const tooLong = 'a'.repeat(COMPLETED_TITLE_MAX_LENGTH + 50)
    const result = normalizeCompletedTitle(tooLong)
    expect(result.length).toBe(COMPLETED_TITLE_MAX_LENGTH)
    expect(result).toBe('a'.repeat(COMPLETED_TITLE_MAX_LENGTH))
  })
})
