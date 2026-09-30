// @vitest-environment node
import { expect, test } from 'vitest'

import {
  compareCompletedEntries,
  type CompletedEntry,
} from './completedAggregation'

const GENERAL = { id: 1, name: 'General', color: 'blue' }

/**
 * Builds one completion entry for the ordering tests.
 * @param source - Which table the entry came from.
 * @param id - Row id within that table.
 * @param completedAt - ISO instant the entry was completed.
 * @returns The entry, filed under the General category.
 * @example
 * entry('todo', 5, '2026-05-04T10:00:00.000Z')
 */
function entry(
  source: CompletedEntry['source'],
  id: number,
  completedAt: string,
): CompletedEntry {
  return {
    source,
    id,
    title: `${source} ${id}`,
    completedAt: new Date(completedAt),
    category: GENERAL,
  }
}

test('lists entries that share an instant with todo rows first and each source by ascending id, however they arrive', () => {
  // Arrange — same instant, ids deliberately arrive high-to-low and completed-before-todo.
  const arrivalOrder = [
    entry('completed', 9, '2026-05-04T10:00:00.000Z'),
    entry('todo', 5, '2026-05-04T10:00:00.000Z'),
    entry('todo', 2, '2026-05-04T10:00:00.000Z'),
    entry('completed', 3, '2026-05-04T10:00:00.000Z'),
  ]

  // Act
  const sorted = [...arrivalOrder].sort(compareCompletedEntries)

  // Assert
  expect(sorted.map(({ source, id }) => `${source}:${id}`)).toEqual([
    'todo:2',
    'todo:5',
    'completed:3',
    'completed:9',
  ])
})

test('lists an earlier completion before a later one whatever their ids and sources', () => {
  // Arrange
  const later = entry('todo', 1, '2026-05-04T11:00:00.000Z')
  const earlier = entry('completed', 99, '2026-05-04T09:00:00.000Z')

  // Act
  const sorted = [later, earlier].sort(compareCompletedEntries)

  // Assert
  expect(sorted.map(({ source, id }) => `${source}:${id}`)).toEqual([
    'completed:99',
    'todo:1',
  ])
})
