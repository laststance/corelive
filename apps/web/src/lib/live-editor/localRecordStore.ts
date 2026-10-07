import {
  createLocalStorageSlot,
  getLocalStorageAvailability,
} from './localStorageSlot'

/** Gives independent local records separate atomic storage writes while retaining legacy read-through.
 * Completion IDs and category IDs call this instead of rewriting an aggregate array/map.
 * @param legacyKey - Existing aggregate key whose values stay readable during the transition.
 * @returns Per-record reads/writes and collection notifications, including cross-tab storage events.
 * @example const records = createLocalRecordStore('corelive.local-note.v1')
 */
export function createLocalRecordStore(legacyKey: string) {
  const prefix = `${legacyKey}.record.`
  const slots = new Map<string, ReturnType<typeof createLocalStorageSlot>>()
  const listeners = new Set<() => void>()
  const getSlot = (id: string) => {
    let slot = slots.get(id)
    if (!slot) {
      slot = createLocalStorageSlot(prefix + encodeURIComponent(id))
      slots.set(id, slot)
    }
    return slot
  }
  return {
    read: (id: string): string | null => getSlot(id).read(),
    write: (id: string, raw: string): void => {
      getSlot(id).write(raw)
      for (const listener of listeners) listener()
    },
    remove: (id: string): void => {
      try {
        // New records have no legacy copy to mask; Undo can reclaim their key completely.
        if (getLocalStorageAvailability() === 'ok') {
          window.localStorage.removeItem(prefix + encodeURIComponent(id))
          slots.delete(id)
          for (const listener of listeners) listener()
          return
        }
      } catch {
        // Preserve the removal in the session fallback when persistent storage rejects it.
      }
      getSlot(id).write('null')
      for (const listener of listeners) listener()
    },
    entries: (): Array<[string, string]> => {
      const ids = new Set(slots.keys())
      try {
        // Storage enumeration discovers records written by another tab or a previous session.
        for (let index = 0; index < window.localStorage.length; index++) {
          const key = window.localStorage.key(index)
          if (key?.startsWith(prefix)) {
            try {
              ids.add(decodeURIComponent(key.slice(prefix.length)))
            } catch {
              /* Ignore foreign malformed keys. */
            }
          }
        }
      } catch {
        /* Known slots retain their session fallback when storage is unavailable. */
      }
      const entries: Array<[string, string]> = []
      for (const id of ids) {
        const raw = getSlot(id).read()
        if (raw !== null) entries.push([id, raw])
      }
      return entries
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        if (
          event.key === null ||
          event.key === legacyKey ||
          event.key.startsWith(prefix)
        )
          listener()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}
