import { MULTI_LINE_PASTE_MIN_LINES } from '@/lib/constants/import'
import { parsePasteToTasks } from '@/lib/parsePasteToTasks'

/**
 * Whether pasted clipboard text should open the bulk paste-import dialog rather
 * than paste as one task. True iff the text yields >= 2 PARSEABLE task lines —
 * reusing `parsePasteToTasks` so this detector can never disagree with the
 * dialog's own preview/count (a naive line split would open the dialog for
 * `"- \n- "`, which parses to 0 rows → a dead-end confirm). Triggered from the
 * main + floating todo inputs' `onPaste` (Issue #110); a single line — including
 * one with a trailing newline, or blank / whitespace-only / list-prefix-only
 * padding — stays an instant single add (AC#3).
 *
 * @param text - The raw pasted clipboard text (any mix of `\n` / `\r\n`).
 * @returns
 * - `true` when at least `MULTI_LINE_PASTE_MIN_LINES` parseable lines are present
 * - `false` for empty, single-line, or only-droppable-line pastes
 * @example
 * isMultiLinePaste('buy milk')        // => false (single line)
 * isMultiLinePaste('buy milk\n')      // => false (lone trailing newline)
 * isMultiLinePaste('buy milk\neggs')  // => true
 * isMultiLinePaste('- \n- ')          // => false (prefix-only lines drop)
 */
export function isMultiLinePaste(text: string): boolean {
  return parsePasteToTasks(text).length >= MULTI_LINE_PASTE_MIN_LINES
}
