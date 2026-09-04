import { LOCAL_NOTE_STORAGE_KEY } from './constants'
import { createLocalStorageSlot } from './localStorageSlot'
import { type LocalNoteMap, localNoteMapSchema } from './schemas'

const slot = createLocalStorageSlot(LOCAL_NOTE_STORAGE_KEY)

/**
 * Reads the whole device-local note map; corrupt or foreign values read as empty.
 * @returns Note text keyed by category id string (`"0"` while signed out).
 * @example
 * readLocalNoteMap() // => { '0': '- [ ] buy milk' }
 */
function readLocalNoteMap(): LocalNoteMap {
  const raw = slot.read()
  if (raw === null) return {}
  try {
    const parsed = localNoteMapSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

/**
 * Reads one category's device-local note — the web host's `note.get`.
 * @param categoryId - Category id (0 while signed out, the server id when signed in).
 * @returns The stored text, or `''` when none exists.
 * @example
 * getLocalNote(0) // => '- [ ] buy milk'
 */
export function getLocalNote(categoryId: number): string {
  return readLocalNoteMap()[String(categoryId)] ?? ''
}

/**
 * Writes one category's device-local note while preserving every other category —
 * the web host's `note.set`, mirroring `electron/LiveEditorNoteStore.ts`.
 * @param categoryId - Category id whose note changes.
 * @param text - The full note text to persist.
 * @returns Nothing; same-tab subscribers and other tabs are notified by the slot.
 * @example
 * setLocalNote(0, '- [x] buy milk')
 */
export function setLocalNote(categoryId: number, text: string): void {
  slot.write(
    JSON.stringify({ ...readLocalNoteMap(), [String(categoryId)]: text }),
  )
}
