import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  LOCAL_COMPLETIONS_STORAGE_KEY,
  LOCAL_STORAGE_PROBE_KEY,
} from './constants'

/** Replays a sibling tab's write after this tab has read its old snapshot.
 * The first real persistence write runs the sibling operation before committing.
 * @example interleaveStorageWrite(() => store.addLocalCompletion('another win'))
 */
function interleaveStorageWrite(siblingWrite: () => void) {
  const originalSetItem = Storage.prototype.setItem
  const siblingMutation = vi.fn(siblingWrite)
  let hasInterleaved = false
  // Happy DOM binds prototype methods onto each instance; replace that cached binding first.
  Object.defineProperty(window.localStorage, 'setItem', {
    configurable: true,
    writable: true,
    value: originalSetItem,
  })
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    // Probe writes establish availability and are outside the record mutation.
    if (key !== LOCAL_STORAGE_PROBE_KEY && !hasInterleaved) {
      hasInterleaved = true
      siblingMutation()
    }
    originalSetItem.call(this, key, value)
  })
  return siblingMutation
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(window.localStorage, 'setItem', {
    configurable: true,
    writable: true,
    value: Storage.prototype.setItem,
  })
})

test('two tabs keeping independent lines retain both wins', async () => {
  // Arrange
  const store = await import('./localCompletionStore')
  const siblingWrite = interleaveStorageWrite(() =>
    store.addLocalCompletion(
      'second tab win',
      new Date('2026-10-05T09:00:00.000Z'),
    ),
  )

  // Act
  store.addLocalCompletion(
    'first tab win',
    new Date('2026-10-05T09:00:00.000Z'),
  )

  // Assert
  expect(siblingWrite).toHaveBeenCalledOnce()
  expect(
    store
      .parseLocalCompletions(store.getLocalCompletionsSnapshot())
      .map((item) => item.title)
      .sort(),
  ).toEqual(['first tab win', 'second tab win'])
})

test('Undo removes its V1 keep without erasing a win kept by another tab', async () => {
  // Arrange
  localStorage.setItem(
    LOCAL_COMPLETIONS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      items: [
        {
          id: 'legacy-undo',
          title: 'undo this win',
          completedAt: '2026-10-04T09:00:00.000Z',
        },
        {
          id: 'legacy-retained',
          title: 'legacy retained win',
          completedAt: '2026-10-04T10:00:00.000Z',
        },
      ],
    }),
  )
  const store = await import('./localCompletionStore')
  const siblingWrite = interleaveStorageWrite(() =>
    store.addLocalCompletion(
      'new sibling win',
      new Date('2026-10-05T09:00:00.000Z'),
    ),
  )

  // Act
  store.removeLocalCompletion('legacy-undo')

  // Assert
  expect(siblingWrite).toHaveBeenCalledOnce()
  expect(
    store
      .parseLocalCompletions(store.getLocalCompletionsSnapshot())
      .map((item) => item.title)
      .sort(),
  ).toEqual(['legacy retained win', 'new sibling win'])
})

test('merging a V1 keep preserves its history and another tab’s newly kept line', async () => {
  // Arrange
  localStorage.setItem(
    LOCAL_COMPLETIONS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      items: [
        {
          id: 'legacy-awaiting-merge',
          title: 'legacy awaiting merge',
          completedAt: '2026-10-04T09:00:00.000Z',
        },
        {
          id: 'legacy-previous-merge',
          title: 'legacy previous merge',
          completedAt: '2026-10-03T09:00:00.000Z',
          mergedBatchId: 'previous-batch',
        },
      ],
    }),
  )
  const store = await import('./localCompletionStore')
  const siblingWrite = interleaveStorageWrite(() =>
    store.addLocalCompletion(
      'new sibling win',
      new Date('2026-10-05T09:00:00.000Z'),
    ),
  )

  // Act
  store.tagLocalCompletionsMerged(['legacy-awaiting-merge'], 'new-batch')

  // Assert
  expect(siblingWrite).toHaveBeenCalledOnce()
  expect(
    store
      .parseLocalCompletions(store.getLocalCompletionsSnapshot())
      .map(({ title, completedAt, mergedBatchId }) => ({
        title,
        completedAt,
        mergedBatchId: mergedBatchId ?? null,
      }))
      .sort((left, right) => left.title.localeCompare(right.title)),
  ).toEqual([
    {
      title: 'legacy awaiting merge',
      completedAt: '2026-10-04T09:00:00.000Z',
      mergedBatchId: 'new-batch',
    },
    {
      title: 'legacy previous merge',
      completedAt: '2026-10-03T09:00:00.000Z',
      mergedBatchId: 'previous-batch',
    },
    {
      title: 'new sibling win',
      completedAt: '2026-10-05T09:00:00.000Z',
      mergedBatchId: null,
    },
  ])
})
