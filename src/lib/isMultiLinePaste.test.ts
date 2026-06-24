// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isMultiLinePaste } from './isMultiLinePaste'

// Each test is named for the paste gesture's observable outcome: `true` routes
// the paste to the bulk import confirm dialog, `false` lets it fall through as a
// normal single-task add (Issue #110 AC#3). A regression here means a list paste
// silently lands as one mangled task, or a normal paste is hijacked by a dialog.
describe('isMultiLinePaste', () => {
  it('lets a single typed-style line paste through as a normal add (no dialog)', () => {
    // Arrange
    const pastedText = 'buy milk'

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(false)
  })

  it('lets a single line with a lone trailing newline paste through as a normal add', () => {
    // Arrange — copying one row often carries a trailing \n; it must stay a single add
    const pastedText = 'buy milk\n'

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(false)
  })

  it('opens the bulk dialog when two plain lines are pasted', () => {
    // Arrange
    const pastedText = 'buy milk\nwalk the dog'

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(true)
  })

  it('opens the bulk dialog for a real bullet list of several items', () => {
    // Arrange
    const pastedText = '- buy milk\n- walk the dog\n- call mom'

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(true)
  })

  it('opens the bulk dialog when two lines are separated by CRLF (Windows clipboard)', () => {
    // Arrange
    const pastedText = 'first task\r\nsecond task'

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(true)
  })

  it('treats one real line padded with blank lines as a single add, matching the dialog preview', () => {
    // Arrange — only ONE line parses, so the dialog would show 1 row; stay a single add
    const pastedText = 'buy milk\n\n   \n\t'

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(false)
  })

  it('does not open a dead-end dialog when the paste is only list prefixes with no content', () => {
    // Arrange — `parsePasteToTasks` drops prefix-only lines, so this yields 0 rows
    const pastedText = '- \n- '

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(false)
  })

  it('does not open a dialog for whitespace-only paste content', () => {
    // Arrange
    const pastedText = '   \n\t\n  '

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(false)
  })

  it('does not open a dialog for an empty paste', () => {
    // Arrange
    const pastedText = ''

    // Act
    const opensBulkDialog = isMultiLinePaste(pastedText)

    // Assert
    expect(opensBulkDialog).toBe(false)
  })
})
