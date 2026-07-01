import type { ConfigManager } from './ConfigManager'

const BRAINDUMP_NOTES_CONFIG_PATH = 'braindump.notes'

type BrainDumpNoteReader = Pick<ConfigManager, 'get'>
type BrainDumpNoteWriter = Pick<ConfigManager, 'get' | 'set'>

/**
 * Converts the category id into the persisted note-map key used by Electron IPC callers.
 * @param categoryId - The positive category id from the typed IPC contract.
 * @returns The string key used in `braindump.notes`.
 * @example
 * toBrainDumpNoteKey(42) // => '42'
 */
const toBrainDumpNoteKey = (categoryId: number): string => String(categoryId)

/**
 * Reads one persisted BrainDump note for IPC without exposing the whole notes map.
 * @param configManager - The Electron config manager that owns `config.json`.
 * @param categoryId - The category whose note text should be read.
 * @returns The stored note text, or an empty string when no note exists.
 * @example
 * getBrainDumpNote(configManager, 42) // => 'today I shipped'
 */
export const getBrainDumpNote = (
  configManager: BrainDumpNoteReader,
  categoryId: number,
): string => {
  const notes = configManager.get<Record<string, string>>(
    BRAINDUMP_NOTES_CONFIG_PATH,
    {},
  )

  return notes?.[toBrainDumpNoteKey(categoryId)] ?? ''
}

/**
 * Writes one BrainDump note while preserving every other category note in config.
 * @param configManager - The Electron config manager that owns `config.json`.
 * @param categoryId - The category whose note text should be updated.
 * @param text - The note text to persist for the category.
 * @returns Nothing; the config manager performs the disk write.
 * @example
 * setBrainDumpNote(configManager, 42, 'today I shipped')
 */
export const setBrainDumpNote = (
  configManager: BrainDumpNoteWriter,
  categoryId: number,
  text: string,
): void => {
  const notes = configManager.get<Record<string, string>>(
    BRAINDUMP_NOTES_CONFIG_PATH,
    {},
  )

  configManager.set(BRAINDUMP_NOTES_CONFIG_PATH, {
    ...(notes ?? {}),
    [toBrainDumpNoteKey(categoryId)]: text,
  })
}
