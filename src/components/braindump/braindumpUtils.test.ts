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
  normalizeCompletedTitle,
  parseAllCheckboxes,
  parseCheckboxLine,
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
