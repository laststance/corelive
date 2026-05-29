// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { parsePasteLine, parsePasteToTasks } from './parsePasteToTasks'

describe('parsePasteToTasks', () => {
  it('keeps each plain text line as its own task title', () => {
    // Arrange
    const pastedText = 'buy milk\nwalk the dog\ncall mom'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([
      { title: 'buy milk', done: false },
      { title: 'walk the dog', done: false },
      { title: 'call mom', done: false },
    ])
  })

  it('marks a checked checkbox line done and strips the [x] prefix from the title', () => {
    // Arrange
    const pastedText = '- [x] shipped the release'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([{ title: 'shipped the release', done: true }])
  })

  it('marks an unchecked checkbox line not-done and strips the [ ] prefix', () => {
    // Arrange
    const pastedText = '- [ ] draft the digest'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([{ title: 'draft the digest', done: false }])
  })

  it('strips dash, asterisk, and plus bullet prefixes to derive the title', () => {
    // Arrange
    const pastedText = '- buy milk\n* walk the dog\n+ call mom'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([
      { title: 'buy milk', done: false },
      { title: 'walk the dog', done: false },
      { title: 'call mom', done: false },
    ])
  })

  it('strips numbered list prefixes using both "1." and "2)" styles', () => {
    // Arrange
    const pastedText = '1. first thing\n2) second thing'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([
      { title: 'first thing', done: false },
      { title: 'second thing', done: false },
    ])
  })

  it('preserves a URL line verbatim as the task title', () => {
    // Arrange
    const pastedText = 'https://example.com/path?query=1'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([
      { title: 'https://example.com/path?query=1', done: false },
    ])
  })

  it('preserves a markdown heading line verbatim as the task title', () => {
    // Arrange
    const pastedText = '# Today'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([{ title: '# Today', done: false }])
  })

  it('skips blank and whitespace-only lines', () => {
    // Arrange
    const pastedText = 'real task\n\n   \n\t\nanother task'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([
      { title: 'real task', done: false },
      { title: 'another task', done: false },
    ])
  })

  it('clamps a title longer than 255 characters to exactly 255 characters', () => {
    // Arrange
    const longTitle = 'a'.repeat(300)
    const pastedText = `- ${longTitle}`

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toHaveLength(255)
    expect(tasks[0]?.title).toBe('a'.repeat(255))
  })

  it('strips only the leading prefix and keeps a mid-line dash intact', () => {
    // Arrange
    const pastedText = '- design - review notes'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([{ title: 'design - review notes', done: false }])
  })

  it('drops a line that is only a list prefix with no content', () => {
    // Arrange
    const pastedText = 'keep me\n-   \nkeep me too'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([
      { title: 'keep me', done: false },
      { title: 'keep me too', done: false },
    ])
  })

  it('normalizes CRLF line endings so no stray carriage return leaks into titles', () => {
    // Arrange
    const pastedText = 'first task\r\nsecond task'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([
      { title: 'first task', done: false },
      { title: 'second task', done: false },
    ])
  })

  it('returns an empty array for text containing only droppable lines', () => {
    // Arrange
    const pastedText = '\n   \n\t\n'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([])
  })

  it('does not treat a dash without a trailing space as a bullet prefix', () => {
    // Arrange
    const pastedText = '-no space after dash'

    // Act
    const tasks = parsePasteToTasks(pastedText)

    // Assert
    expect(tasks).toEqual([{ title: '-no space after dash', done: false }])
  })
})

describe('parsePasteLine', () => {
  it('returns null for a whitespace-only line', () => {
    // Arrange
    const rawLine = '    '

    // Act
    const parsed = parsePasteLine(rawLine)

    // Assert
    expect(parsed).toBeNull()
  })

  it('parses a single checked checkbox line into a done task', () => {
    // Arrange
    const rawLine = '- [x] done already'

    // Act
    const parsed = parsePasteLine(rawLine)

    // Assert
    expect(parsed).toEqual({ title: 'done already', done: true })
  })

  it('matches an indented checkbox instead of leaking the marker into the title', () => {
    // Arrange
    const rawLine = '  - [x] nested done'

    // Act
    const parsed = parsePasteLine(rawLine)

    // Assert
    expect(parsed).toEqual({ title: 'nested done', done: true })
  })
})
