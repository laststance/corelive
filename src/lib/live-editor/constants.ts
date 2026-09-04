/**
 * @fileoverview Constants for the web LiveEditor host (`/write`): the signed-out
 * category sentinel and the device-local storage keys. Renderer-only — the
 * Electron main process never reads these (its notes live in `config.json`).
 *
 * @module lib/live-editor/constants
 */

/**
 * Category id for every signed-out keep and note. `useSelectedCategory` rejects
 * `0` on purpose (server ids are positive), so `LiveEditor` sets this sentinel
 * directly instead of routing it through the shared selection store.
 */
export const LOCAL_CATEGORY_ID = 0

/** localStorage key for signed-out keeps: `{ version: 1, items: [...] }`. */
export const LOCAL_COMPLETIONS_STORAGE_KEY = 'corelive.local-completions.v1'

/** Schema version stamped on the completions file so a later shape change can migrate it. */
export const LOCAL_COMPLETIONS_SCHEMA_VERSION = 1

/**
 * localStorage key for the device-local note map, `Record<categoryId, text>` —
 * the same shape as `electron/LiveEditorNoteStore.ts`, keyed `"0"` while signed out.
 */
export const LOCAL_NOTE_STORAGE_KEY = 'corelive.local-note.v1'

/** Probe key written and removed once per session to learn whether localStorage accepts writes. */
export const LOCAL_STORAGE_PROBE_KEY = 'corelive.local-storage-probe'

/**
 * localStorage key holding the merge attempt currently in flight,
 * `{ version: 1, batchId, ids }`. Written before the request so a retry reuses
 * the same idempotency key and re-sends the same items.
 */
export const LOCAL_PENDING_MERGE_STORAGE_KEY = 'corelive.local-merge-pending.v1'

/** Schema version stamped on the pending-merge record. */
export const LOCAL_PENDING_MERGE_SCHEMA_VERSION = 1
