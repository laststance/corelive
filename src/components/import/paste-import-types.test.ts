import { describe, expect, it } from 'vitest'

import { MAX_IMPORT_LINES_PER_BATCH } from '@/lib/constants/import'

import { computePasteImportPreview } from './paste-import-types'

describe('computePasteImportPreview', () => {
  it('reports zero tasks and zero skipped for empty text', () => {
    // Arrange
    const text = ''

    // Act
    const preview = computePasteImportPreview(text)

    // Assert
    expect(preview.total).toBe(0)
    expect(preview.skipped).toBe(0)
    expect(preview.isOverCap).toBe(false)
  })

  it('counts each non-blank line as one task and drops blank lines as skipped', () => {
    // Arrange — 3 real tasks, 1 blank line in the middle.
    const text = '- shipped release\n\n- reviewed PRs\nwrote digest'

    // Act
    const preview = computePasteImportPreview(text)

    // Assert
    expect(preview.total).toBe(3)
    expect(preview.skipped).toBe(1)
    expect(preview.rows.map((row) => row.title)).toEqual([
      'shipped release',
      'reviewed PRs',
      'wrote digest',
    ])
  })

  it('does not count a single trailing newline as a skipped line', () => {
    // Arrange — two tasks plus the editor's final Enter keystroke.
    const text = 'task one\ntask two\n'

    // Act
    const preview = computePasteImportPreview(text)

    // Assert
    expect(preview.total).toBe(2)
    expect(preview.skipped).toBe(0)
  })

  it('caps the preview at the batch limit and flags over-cap', () => {
    // Arrange — 1,200 non-blank lines (over the 1,000 cap).
    const text = Array.from({ length: 1200 }, (_, i) => `task ${i}`).join('\n')

    // Act
    const preview = computePasteImportPreview(text)

    // Assert
    expect(preview.isOverCap).toBe(true)
    expect(preview.total).toBe(MAX_IMPORT_LINES_PER_BATCH)
    expect(preview.rows).toHaveLength(MAX_IMPORT_LINES_PER_BATCH)
    expect(preview.rawLineCount).toBe(1200)
  })

  it('keeps the visible task count equal to the rows that will be sent', () => {
    // Arrange — mix of bullets, a checkbox, a URL, and droppable lines.
    const text = '- a\n* b\n1. c\n- [x] d\nhttps://x.test\n\n- '

    // Act
    const preview = computePasteImportPreview(text)

    // Assert — invariant: total === rows.length (preview == what we insert).
    expect(preview.total).toBe(preview.rows.length)
    expect(preview.rows.map((row) => row.title)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'https://x.test',
    ])
  })
})
