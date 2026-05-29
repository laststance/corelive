/**
 * @fileoverview Shared client types + pure preview helpers for the paste-import
 * UI (Issue #53, PR2). Lives beside the dialog so both the presentational
 * `PasteImportDialog`, the oRPC container `PasteImport`, the entry wrappers, and
 * the Storybook stories import one source of truth — and so the count/cap math
 * (load-bearing: preview count must equal the count the server inserts) stays
 * pure and unit-reachable without rendering React.
 *
 * @module components/import/paste-import-types
 */

import { MAX_IMPORT_LINES_PER_BATCH } from '@/lib/constants/import'
import { parsePasteToTasks } from '@/lib/parsePasteToTasks'

/**
 * Which zone a paste-import lands in. Drives copy, the success toast, and which
 * oRPC procedure the container calls. Routing is purely by destination zone
 * (the `[x]` checkbox flag is informational only in Slice 1).
 */
export type PasteImportZone = 'completed' | 'todo'

/**
 * One item sent to the server on confirm. `categoryId` is omitted when the row
 * inherits the shared category (server get-or-creates the default for omitted
 * ids); a per-row override sets it explicitly.
 *
 * @example
 * { title: 'shipped the release' }
 * @example
 * { title: 'gym', categoryId: 3 }
 */
export type PasteImportItem = {
  /** The derived, normalized title (1..255 chars; server re-normalizes). */
  title: string
  /** Per-row category override; omitted = inherit the shared category. */
  categoryId?: number
}

/**
 * The fully-derived preview the dialog renders: the visible rows, the counts,
 * and whether the paste exceeded the cap. Computed in one pass from the raw
 * textarea text so the visible `tasks` count equals the number of items the
 * confirm sends (which equals the number the server inserts).
 *
 * @example
 * { rows: [{ title: 'a', done: false }], total: 1, skipped: 2, isOverCap: false, rawLineCount: 3, cap: 1000 }
 */
export type PasteImportPreview = {
  /** Parsed rows, capped at {@link MAX_IMPORT_LINES_PER_BATCH}. */
  rows: { title: string; done: boolean }[]
  /** Number of importable rows == `rows.length` (after the cap). */
  total: number
  /** Non-blank lines that survived parse but were dropped by the cap, plus blank/prefix-only lines. */
  skipped: number
  /** True when the raw non-blank line count exceeded the cap. */
  isOverCap: boolean
  /** Count of raw lines the user typed (trailing blank line excluded). */
  rawLineCount: number
  /** The cap, surfaced so the dialog's over-cap copy stays single-sourced. */
  cap: number
}

/**
 * Derives the full preview from raw pasted text in a single pure pass. Excludes
 * a single trailing newline so an editor's final `\n` does not inflate
 * `skipped`. Slices the parsed rows to the cap so the preview, the confirm
 * label, and the payload all agree (the server enforces the same `.max()`).
 *
 * @param text - The raw textarea contents.
 * @returns A {@link PasteImportPreview} (rows capped; counts reconciled).
 * @example
 * computePasteImportPreview('- a\n\n- b')
 * // => { rows: [{title:'a',done:false},{title:'b',done:false}], total: 2, skipped: 1, isOverCap: false, rawLineCount: 3, cap: 1000 }
 * @example
 * computePasteImportPreview('') // => { rows: [], total: 0, skipped: 0, isOverCap: false, rawLineCount: 0, cap: 1000 }
 */
export function computePasteImportPreview(text: string): PasteImportPreview {
  // Drop exactly one trailing newline so a final Enter keystroke is not counted
  // as a skipped blank line. Count remaining raw lines for the over-cap copy.
  const trimmedTrailing = text.replace(/\n$/, '')
  const rawLineCount =
    trimmedTrailing.length === 0 ? 0 : trimmedTrailing.split('\n').length

  const parsed = parsePasteToTasks(text)
  const isOverCap = parsed.length > MAX_IMPORT_LINES_PER_BATCH
  const rows = isOverCap ? parsed.slice(0, MAX_IMPORT_LINES_PER_BATCH) : parsed

  // skipped = every raw line the preview does NOT show: blank/prefix-only lines
  // (parsed dropped them) plus any rows beyond the cap.
  const skipped = Math.max(rawLineCount - rows.length, 0)

  return {
    rows,
    total: rows.length,
    skipped,
    isOverCap,
    rawLineCount,
    cap: MAX_IMPORT_LINES_PER_BATCH,
  }
}
