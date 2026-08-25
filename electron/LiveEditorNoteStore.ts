import type { ConfigManager } from './ConfigManager'

const LIVE_EDITOR_NOTES_CONFIG_PATH = 'liveEditor.notes'

type LiveEditorNoteReader = Pick<ConfigManager, 'get'>
type LiveEditorNoteWriter = Pick<ConfigManager, 'get' | 'set'>

/**
 * Converts the category id into the persisted note-map key used by Electron IPC callers.
 * @param categoryId - The positive category id from the typed IPC contract.
 * @returns The string key used in `liveEditor.notes`.
 * @example
 * toLiveEditorNoteKey(42) // => '42'
 */
const toLiveEditorNoteKey = (categoryId: number): string => String(categoryId)

/**
 * Reads one persisted LiveEditor note for IPC without exposing the whole notes map.
 * @param configManager - The Electron config manager that owns `config.json`.
 * @param categoryId - The category whose note text should be read.
 * @returns The stored note text, or an empty string when no note exists.
 * @example
 * getLiveEditorNote(configManager, 42) // => 'today I shipped'
 */
export const getLiveEditorNote = (
  configManager: LiveEditorNoteReader,
  categoryId: number,
): string => {
  const notes = configManager.get<Record<string, string>>(
    LIVE_EDITOR_NOTES_CONFIG_PATH,
    {},
  )

  return notes?.[toLiveEditorNoteKey(categoryId)] ?? ''
}

/**
 * Writes one LiveEditor note while preserving every other category note in config.
 * @param configManager - The Electron config manager that owns `config.json`.
 * @param categoryId - The category whose note text should be updated.
 * @param text - The note text to persist for the category.
 * @returns Nothing; the config manager performs the disk write.
 * @example
 * setLiveEditorNote(configManager, 42, 'today I shipped')
 */
export const setLiveEditorNote = (
  configManager: LiveEditorNoteWriter,
  categoryId: number,
  text: string,
): void => {
  const notes = configManager.get<Record<string, string>>(
    LIVE_EDITOR_NOTES_CONFIG_PATH,
    {},
  )

  configManager.set(LIVE_EDITOR_NOTES_CONFIG_PATH, {
    ...(notes ?? {}),
    [toLiveEditorNoteKey(categoryId)]: text,
  })
}
