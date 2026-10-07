import { LOCAL_STORAGE_PROBE_KEY } from './constants'

/** Whether the browser accepts localStorage writes this session. */
export type LocalStorageAvailability = 'ok' | 'unavailable'

/**
 * Session-scoped fallback used when localStorage rejects writes (private mode,
 * quota, disabled storage). Takes precedence over localStorage once a key lands
 * here, so reads stay consistent with the latest write for the session.
 */
const memoryFallback = new Map<string, string>()

/** Probe result, answered once per session (`null` = not probed yet). */
let probedAvailability: LocalStorageAvailability | null = null

/**
 * Probes localStorage once per session so the footer can say the device cannot
 * keep right now instead of failing on every keystroke. Called by every slot
 * write and by the footer copy.
 * @returns
 * - `'ok'` when a probe write + remove succeeded
 * - `'unavailable'` on the server (not cached, re-probed after hydration) or when the probe threw
 * @example
 * getLocalStorageAvailability() // => 'ok'
 */
export function getLocalStorageAvailability(): LocalStorageAvailability {
  if (probedAvailability !== null) return probedAvailability
  // The server has no storage; leave the probe unanswered so the browser probes after hydration.
  if (typeof window === 'undefined') return 'unavailable'
  try {
    window.localStorage.setItem(LOCAL_STORAGE_PROBE_KEY, '1')
    window.localStorage.removeItem(LOCAL_STORAGE_PROBE_KEY)
    probedAvailability = 'ok'
  } catch {
    probedAvailability = 'unavailable'
  }
  return probedAvailability
}

/**
 * Reads one localStorage key without ever throwing (disabled storage throws on access).
 * @param key - localStorage key.
 * @returns The stored string, or null when absent, on the server, or when access throws.
 * @example
 * readLocalStorageKey('corelive.local-note.v1') // => '{"0":"- [ ] milk"}'
 */
function readLocalStorageKey(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** One localStorage key with same-tab listeners and cross-tab `storage` events. */
export type LocalStorageSlot = {
  /** Raw stored string (referentially stable for useSyncExternalStore), or null when nothing was written yet. */
  read: () => string | null
  /** Overwrites the raw string and notifies same-tab subscribers; other tabs hear the `storage` event. */
  write: (raw: string) => void
  /** Subscribes to same-tab writes and to other tabs' `storage` events for this key. */
  subscribe: (listener: () => void) => () => void
}

/**
 * Creates the raw read/write/subscribe seam over one localStorage key, shared by
 * the completion and note stores so probing, memory fallback and cross-tab sync
 * live in exactly one place.
 * @param key - localStorage key owned by the caller.
 * @returns The slot; parsing and read-modify-write belong to the caller.
 * @example
 * const slot = createLocalStorageSlot('corelive.local-note.v1')
 * slot.write('{"0":"hello"}'); slot.read() // => '{"0":"hello"}'
 */
export function createLocalStorageSlot(key: string): LocalStorageSlot {
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  return {
    read: () => memoryFallback.get(key) ?? readLocalStorageKey(key),
    write: (raw) => {
      if (getLocalStorageAvailability() === 'ok') {
        try {
          window.localStorage.setItem(key, raw)
          notify()
          return
        } catch {
          // Quota can run out after a passing probe; degrade to memory for the rest of the session.
          probedAvailability = 'unavailable'
        }
      }
      memoryFallback.set(key, raw)
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      // `key === null` is a `clear()` in another tab, which also emptied this key.
      const handleStorage = (event: StorageEvent): void => {
        if (event.key === key || event.key === null) listener()
      }
      window.addEventListener('storage', handleStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', handleStorage)
      }
    },
  }
}
