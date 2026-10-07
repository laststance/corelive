import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { LOCAL_NOTE_STORAGE_KEY, LOCAL_STORAGE_PROBE_KEY } from './constants'

/** Replays a sibling tab saving after this tab has already read the old note map.
 * The first non-probe write commits the sibling save before its own stale write.
 * @example interleaveStorageWrite(() => store.setLocalNote(9, 'another draft'))
 */
function interleaveStorageWrite(siblingWrite: () => void) {
  const originalSetItem = Storage.prototype.setItem
  const siblingMutation = vi.fn(siblingWrite)
  let hasInterleaved = false
  // Happy DOM caches bound prototype methods on the instance, including restored spies.
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
    // Availability probing does not represent a draft save.
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

test('two tabs saving different categories retain both drafts', async () => {
  // Arrange
  const store = await import('./localNoteStore')
  const siblingWrite = interleaveStorageWrite(() =>
    store.setLocalNote(9, 'second category draft'),
  )

  // Act
  store.setLocalNote(7, 'first category draft')

  // Assert
  expect(siblingWrite).toHaveBeenCalledOnce()
  expect(store.getLocalNote(7)).toBe('first category draft')
  expect(store.getLocalNote(9)).toBe('second category draft')
})

test('V1 drafts remain readable while two tabs independently edit their categories', async () => {
  // Arrange
  localStorage.setItem(
    LOCAL_NOTE_STORAGE_KEY,
    JSON.stringify({
      '7': 'legacy first draft',
      '9': 'legacy second draft',
      '12': 'untouched legacy draft',
    }),
  )
  const store = await import('./localNoteStore')
  expect(store.getLocalNote(7)).toBe('legacy first draft')
  expect(store.getLocalNote(9)).toBe('legacy second draft')
  const siblingWrite = interleaveStorageWrite(() =>
    store.setLocalNote(9, 'second draft edited'),
  )

  // Act
  store.setLocalNote(7, 'first draft edited')

  // Assert
  expect(siblingWrite).toHaveBeenCalledOnce()
  expect(store.getLocalNote(7)).toBe('first draft edited')
  expect(store.getLocalNote(9)).toBe('second draft edited')
  expect(store.getLocalNote(12)).toBe('untouched legacy draft')
})
