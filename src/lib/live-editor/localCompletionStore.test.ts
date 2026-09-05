/**
 * @fileoverview Signed-out keep store — the device-local record behind `/write`.
 * If these fail, a stranger's Cmd+Enter either loses the keep, double-counts it,
 * crashes on a corrupt key, or a second tab stops hearing the write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_COMPLETIONS_STORAGE_KEY } from './constants'
import type * as LocalCompletionStoreNamespace from './localCompletionStore'
import type * as LocalStorageSlotNamespace from './localStorageSlot'

type LocalCompletionStoreModule = typeof LocalCompletionStoreNamespace
type LocalStorageSlotModule = typeof LocalStorageSlotNamespace

/**
 * Loads a fresh store so the once-per-session storage probe runs again for this spec.
 * @returns The store module plus the slot module (for the availability probe result).
 * @example
 * const { store } = await loadFreshStore()
 */
async function loadFreshStore(): Promise<{
  store: LocalCompletionStoreModule
  slot: LocalStorageSlotModule
}> {
  vi.resetModules()
  return {
    store: await import('./localCompletionStore'),
    slot: await import('./localStorageSlot'),
  }
}

/**
 * Reads the raw stored file back as JSON.
 * @returns The parsed value, or null when the key is empty.
 * @example
 * readStoredFile() // => { version: 1, items: [...] }
 */
function readStoredFile(): unknown {
  const raw = localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw)
}

const originalLocalStorage = window.localStorage

/**
 * Swaps `window.localStorage` for a stub whose writes throw, the shape of private
 * mode / a full quota. Reads answer with `storedRaw`.
 * @param storedRaw - What `getItem` should return for any key.
 * @returns Nothing; call {@link restoreLocalStorage} afterwards.
 * @example
 * installThrowingLocalStorage(null)
 */
function installThrowingLocalStorage(storedRaw: string | null): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => storedRaw,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    },
  })
}

/**
 * Puts the real happy-dom storage back.
 * @returns Nothing.
 * @example
 * restoreLocalStorage()
 */
function restoreLocalStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
  })
}

beforeEach(() => {
  restoreLocalStorage()
  localStorage.clear()
})

describe('local completion store — a signed-out keep stays on this device', () => {
  it('keeps a line and hands back the id Undo will need', async () => {
    // Arrange
    const { store } = await loadFreshStore()

    // Act
    const item = store.addLocalCompletion(
      'buy milk',
      new Date('2026-09-04T09:00:00.000Z'),
    )

    // Assert
    expect(item.id).not.toBe('')
    expect(readStoredFile()).toEqual({
      version: 1,
      items: [
        {
          id: item.id,
          title: 'buy milk',
          completedAt: '2026-09-04T09:00:00.000Z',
        },
      ],
    })
  })

  it('keeps a repeated title twice — repetition is XP, never deduplicated', async () => {
    // Arrange
    const { store } = await loadFreshStore()

    // Act
    store.addLocalCompletion('stretch')
    store.addLocalCompletion('stretch')

    // Assert
    const items = store.parseLocalCompletions(
      store.getLocalCompletionsSnapshot(),
    )
    expect(items.map((item) => item.title)).toEqual(['stretch', 'stretch'])
    expect(items[0]?.id).not.toBe(items[1]?.id)
  })

  it('removes exactly the undone keep and leaves its siblings', async () => {
    // Arrange
    const { store } = await loadFreshStore()
    const first = store.addLocalCompletion('first')
    const second = store.addLocalCompletion('second')

    // Act
    store.removeLocalCompletion(first.id)

    // Assert
    expect(
      store
        .parseLocalCompletions(store.getLocalCompletionsSnapshot())
        .map((item) => item.id),
    ).toEqual([second.id])
  })

  it('reads corrupt or foreign storage as empty instead of throwing', async () => {
    // Arrange
    const { store } = await loadFreshStore()

    // Act / Assert
    expect(store.parseLocalCompletions('not json')).toEqual([])
    expect(
      store.parseLocalCompletions(JSON.stringify({ version: 2, items: [] })),
    ).toEqual([])
    expect(store.parseLocalCompletions(JSON.stringify(['x']))).toEqual([])
    expect(store.parseLocalCompletions(null)).toEqual([])
  })

  it('overwrites a corrupt key on the next keep', async () => {
    // Arrange
    const { store } = await loadFreshStore()
    localStorage.setItem(LOCAL_COMPLETIONS_STORAGE_KEY, '{broken')

    // Act
    const item = store.addLocalCompletion('fresh start')

    // Assert
    expect(readStoredFile()).toEqual({
      version: 1,
      items: [expect.objectContaining({ id: item.id, title: 'fresh start' })],
    })
  })

  it('notifies same-tab subscribers on every keep and undo', async () => {
    // Arrange
    const { store } = await loadFreshStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribeToLocalCompletions(listener)

    // Act
    const item = store.addLocalCompletion('one')
    store.removeLocalCompletion(item.id)
    unsubscribe()
    store.addLocalCompletion('after unsubscribe')

    // Assert
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('hears another tab write the key (storage event) so both tabs agree', async () => {
    // Arrange
    const { store } = await loadFreshStore()
    const listener = vi.fn()
    store.subscribeToLocalCompletions(listener)

    // Act
    window.dispatchEvent(
      new StorageEvent('storage', { key: LOCAL_COMPLETIONS_STORAGE_KEY }),
    )
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))

    // Assert
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('falls back to memory for the session when storage refuses the probe (private mode)', async () => {
    // Arrange
    installThrowingLocalStorage(null)
    const { store, slot } = await loadFreshStore()

    // Act
    const item = store.addLocalCompletion('still counts')

    // Assert: the keep is readable for this session and the footer can say why.
    expect(slot.getLocalStorageAvailability()).toBe('unavailable')
    expect(
      store
        .parseLocalCompletions(store.getLocalCompletionsSnapshot())
        .map((entry) => entry.id),
    ).toEqual([item.id])
  })

  it('degrades to memory without losing earlier keeps when the quota runs out mid-session', async () => {
    // Arrange: the probe passed and one keep landed on disk.
    const { store, slot } = await loadFreshStore()
    const first = store.addLocalCompletion('on disk')
    installThrowingLocalStorage(
      originalLocalStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY),
    )

    // Act
    const second = store.addLocalCompletion('in memory')

    // Assert
    expect(slot.getLocalStorageAvailability()).toBe('unavailable')
    expect(
      store
        .parseLocalCompletions(store.getLocalCompletionsSnapshot())
        .map((entry) => entry.id),
    ).toEqual([first.id, second.id])
  })
})
