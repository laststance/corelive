/**
 * @fileoverview Pure helpers for the BrainDump editor.
 *
 * The editor uses a single-line markdown checkbox grammar:
 *
 *     - [ ] something to do      ← unchecked
 *     - [x] finished something   ← checked, promoted to a Completed row
 *
 * Toggling an unchecked box flips it to `[x]` and emits a `Completed` create
 * with the line text (sans prefix). Toggling back within the 5-second toast
 * window calls `Completed.delete` with the row id we cached.
 *
 * The complete command also finishes a plain (non-checkbox) line:
 * `markPlainLineCompleted` wraps it as `- [x] <text>` so an ordinary prose line
 * can be logged without first typing the `- [ ]` markdown.
 *
 * Why a separate utils file: parsing/serialization stays pure so the editor
 * component can stay focused on UI/IPC orchestration and is easy to unit-test.
 *
 * @module components/braindump/braindumpUtils
 */

import type { Completed } from '@/server/schemas/completed'

/**
 * Regex for a markdown checkbox line. Captures leading indentation in group 1,
 * the `[ ]`/`[x]` state in group 2, and the title in group 3. Exported so the paste-import parser
 * (`src/lib/parsePasteToTasks.ts`) reuses one source of truth for checkbox
 * detection instead of redefining the grammar.
 */
export const CHECKBOX_LINE_REGEX = /^([ \t]*)- \[([ x])\] (.+)$/

/** Maximum allowed Completed.title length, mirroring `CreateCompletedSchema`. */
export const COMPLETED_TITLE_MAX_LENGTH = 255

/**
 * Zero-based line index inside the BrainDump textarea. Reused as the key for
 * `checkedRowsRef` so a line and its persisted Completed row stay associated.
 *
 * @example
 * const lineIndex: BrainDumpLineIndex = 3 // 4th line of the textarea
 */
export type BrainDumpLineIndex = number

/**
 * Title of a Completed row created from a BrainDump checkbox line. Aliased to
 * `Completed['title']` so any future schema-level constraint (e.g. branding)
 * propagates here without hand-editing.
 *
 * @example
 * const title: BrainDumpCompletedTitle = "buy milk"
 */
export type BrainDumpCompletedTitle = Completed['title']

/** A single parsed checkbox line. */
export type ParsedCheckbox = Readonly<{
  /** Zero-based line index in the original text. */
  lineIndex: BrainDumpLineIndex
  /** Original spaces/tabs before `-`, preserved when toggling nested tasks. */
  leadingWhitespace: string
  /** True when the box is `[x]`, false when `[ ]`. */
  checked: boolean
  /** The text after `- [x] ` / `- [ ] ` (already trimmed). */
  title: BrainDumpCompletedTitle
}>

/**
 * Parse a single line into a ParsedCheckbox, or return null when the line is
 * not a checkbox line.
 *
 * @param line - Raw line of text (no trailing newline).
 * @param lineIndex - Index of this line within the source text.
 * @returns ParsedCheckbox when the line matches an optionally indented dash checkbox, else null.
 * @example
 * parseCheckboxLine('  - [x] write tests', 3)
 * // → { lineIndex: 3, leadingWhitespace: '  ', checked: true, title: 'write tests' }
 * parseCheckboxLine('plain text', 0) // → null
 */
export function parseCheckboxLine(
  line: string,
  lineIndex: BrainDumpLineIndex,
): ParsedCheckbox | null {
  const match = CHECKBOX_LINE_REGEX.exec(line)
  if (!match) return null

  const leadingWhitespace = match[1]
  const mark = match[2]
  const rest = match[3]
  if (leadingWhitespace === undefined) return null
  if (mark === undefined || rest === undefined) return null

  const title = rest.trim()
  if (title.length === 0) return null

  return {
    lineIndex,
    leadingWhitespace,
    checked: mark === 'x',
    title,
  }
}

/**
 * Walk the full document and collect every checkbox line.
 *
 * @param text - The editor's full text contents.
 * @returns Array of ParsedCheckbox in document order.
 * @example
 * parseAllCheckboxes('- [ ] a\n- [x] b\nplain') // → [{0,false,'a'},{1,true,'b'}]
 */
export function parseAllCheckboxes(text: string): ParsedCheckbox[] {
  const lines = text.split('\n')
  const out: ParsedCheckbox[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    const parsed = parseCheckboxLine(line, i)
    if (parsed) out.push(parsed)
  }
  return out
}

/**
 * Replace the checkbox marker on a specific line, leaving all other lines
 * untouched. Returns the original text when the line is not a checkbox.
 *
 * @param text - The full document text.
 * @param lineIndex - Zero-based index of the line to flip.
 * @param checked - Desired checkbox state (`true` → `[x]`, `false` → `[ ]`).
 * @returns The updated text.
 * @example
 * setCheckboxStateAtLine('- [ ] todo\nfoo', 0, true) // → '- [x] todo\nfoo'
 */
export function setCheckboxStateAtLine(
  text: string,
  lineIndex: BrainDumpLineIndex,
  checked: boolean,
): string {
  const lines = text.split('\n')
  if (lineIndex < 0 || lineIndex >= lines.length) return text

  const line = lines[lineIndex]
  if (line === undefined) return text
  const parsed = parseCheckboxLine(line, lineIndex)
  if (!parsed) return text

  const mark = checked ? 'x' : ' '
  lines[lineIndex] = `${parsed.leadingWhitespace}- [${mark}] ${parsed.title}`
  return lines.join('\n')
}

/**
 * Replace the entire content of one line, leaving every other line verbatim.
 * Used by the complete command's failure-rollback to restore an original plain
 * prose line (e.g. `buy milk`) rather than leaving the optimistic
 * `- [x] buy milk` skeleton when the Completed-create rejects. Returns the
 * original text for out-of-range indices, mirroring `setCheckboxStateAtLine`.
 *
 * @param text - The full document text.
 * @param lineIndex - Zero-based index of the line to overwrite.
 * @param newLine - Replacement content for that line (no trailing newline).
 * @returns The updated text, or the original when `lineIndex` is out of range.
 * @example
 * replaceLineAtIndex('- [x] buy milk\ndishes', 0, 'buy milk')
 * // → 'buy milk\ndishes'
 */
export function replaceLineAtIndex(
  text: string,
  lineIndex: BrainDumpLineIndex,
  newLine: string,
): string {
  const lines = text.split('\n')
  if (lineIndex < 0 || lineIndex >= lines.length) return text
  lines[lineIndex] = newLine
  return lines.join('\n')
}

/**
 * Remove one line entirely, joining the surrounding lines. Used by the
 * clear-on-complete preference: once a finished line's undo window closes, the
 * `- [x] <title>` line is dropped so the BrainDump scratchpad stays clean.
 * Returns the original text for out-of-range indices, mirroring
 * `replaceLineAtIndex`.
 *
 * @param text - The full document text.
 * @param lineIndex - Zero-based index of the line to delete.
 * @returns The text with that line removed, or the original when out of range.
 * @example
 * removeLineAtIndex('- [x] buy milk\ndishes', 0) // → 'dishes'
 * removeLineAtIndex('a\nb\nc', 1)                 // → 'a\nc'
 */
export function removeLineAtIndex(
  text: string,
  lineIndex: BrainDumpLineIndex,
): string {
  const lines = text.split('\n')
  if (lineIndex < 0 || lineIndex >= lines.length) return text
  lines.splice(lineIndex, 1)
  return lines.join('\n')
}

/**
 * Insert a line at a (clamped) index — the inverse of `removeLineAtIndex`, used
 * by the optimistic clear-on-complete flow to restore a line that was removed
 * the instant it completed (toast Undo / failed-create rollback). The index is
 * clamped to `[0, lines.length]` so a drifted/stale index never throws and the
 * line always lands in-document; an empty document returns just the line so a
 * remove→insert round-trip is lossless (no spurious trailing newline).
 *
 * @param text - The full document text.
 * @param lineIndex - Desired zero-based insertion index (clamped in range).
 * @param newLine - The line content to insert (no trailing newline).
 * @returns The text with `newLine` spliced in at the clamped index.
 * @example
 * insertLineAtIndex('a\nc', 1, '- [ ] b') // → 'a\n- [ ] b\nc'
 * insertLineAtIndex('', 0, '- [ ] b')     // → '- [ ] b'
 * insertLineAtIndex('a', 9, 'b')          // → 'a\nb' (clamped to end)
 */
export function insertLineAtIndex(
  text: string,
  lineIndex: BrainDumpLineIndex,
  newLine: string,
): string {
  // Empty document: return just the line so remove('x')→insert restores 'x'
  // exactly, instead of 'x\n' (splicing into [''] would keep the empty tail).
  if (text === '') return newLine
  const lines = text.split('\n')
  const clampedIndex = Math.max(0, Math.min(lineIndex, lines.length))
  lines.splice(clampedIndex, 0, newLine)
  return lines.join('\n')
}

/**
 * Character offset of the start of a given line — used to reposition the caret
 * after the optimistic clear changes the line count (a removed line shifts all
 * following text up, so the caret must move with it). Clamps past-the-end to the
 * document length so completing the final line drops the caret at doc end.
 *
 * @param text - The full document text.
 * @param lineIndex - Zero-based line whose start offset is wanted.
 * @returns
 * - The char index of that line's first character when in range.
 * - `text.length` when `lineIndex` is past the last line (e.g. the final line
 *   was just removed and nothing shifted up into its slot).
 * @example
 * lineStartOffset('a\nbb\nccc', 1) // → 2  (after 'a' + '\n')
 * lineStartOffset('a\nbb\nccc', 3) // → 8  (past the end → doc length)
 */
export function lineStartOffset(
  text: string,
  lineIndex: BrainDumpLineIndex,
): number {
  const lines = text.split('\n')
  if (lineIndex >= lines.length) return text.length
  const clampedIndex = Math.max(0, lineIndex)
  let offset = 0
  for (let i = 0; i < clampedIndex; i++) {
    // +1 for the '\n' separator that join() puts back between lines.
    offset += (lines[i]?.length ?? 0) + 1
  }
  return offset
}

/**
 * Matches an empty checkbox skeleton — an indented checkbox prefix with no title, e.g.
 * `  - [ ]`, `- [x]`, `- []` (optional trailing whitespace). These have nothing
 * to record, so the complete command must skip them rather than logging a junk
 * `- [ ]` title.
 */
const EMPTY_CHECKBOX_SKELETON_REGEX = /^[ \t]*- \[[ xX]?\]\s*$/

/**
 * Result of wrapping a plain line as a checked checkbox for the complete
 * command. `text` is the full note with the caret line rewritten; `title` is
 * the content to persist.
 */
export type PlainLineCompletion = Readonly<{
  /** Full note text with the caret line rewritten as `- [x] <title>`. */
  text: string
  /** Trimmed line content to persist (uncapped; promote caps it for the DB). */
  title: BrainDumpCompletedTitle
}>

/**
 * Wrap a plain (non-checkbox) line as a checked checkbox so the complete
 * command (Cmd/Ctrl+Enter) can finish an ordinary prose line, not only a
 * pre-formatted `- [ ]` box. Called from `BrainDumpEditor.handleKeyDown` when
 * `parseCheckboxLine` returns null for the caret line.
 *
 * @param text - The editor's full text contents.
 * @param lineIndex - Zero-based index of the caret line to complete.
 * @returns
 * - `{ text, title }` when the caret line is plain and non-blank: `text` has
 *   that line rewritten as `- [x] <trimmed content>`; `title` is the trimmed
 *   content (uncapped, matching how the checkbox path passes `parsed.title`).
 * - `null` when the line is missing, blank, an empty checkbox skeleton, or an
 *   already well-formed checkbox line (the caller's toggle path owns that).
 * @example
 * markPlainLineCompleted('buy milk', 0)
 * // → { text: '- [x] buy milk', title: 'buy milk' }
 * markPlainLineCompleted('a\nb', 1) // → { text: 'a\n- [x] b', title: 'b' }
 * markPlainLineCompleted('- [ ] todo', 0) // → null (already a checkbox)
 * markPlainLineCompleted('   ', 0)         // → null (blank)
 */
export function markPlainLineCompleted(
  text: string,
  lineIndex: BrainDumpLineIndex,
): PlainLineCompletion | null {
  const lines = text.split('\n')
  if (lineIndex < 0 || lineIndex >= lines.length) return null

  const line = lines[lineIndex]
  if (line === undefined) return null
  // A well-formed checkbox line is owned by the toggle path, not this one.
  if (parseCheckboxLine(line, lineIndex)) return null
  // An empty checkbox skeleton has no content worth recording.
  if (EMPTY_CHECKBOX_SKELETON_REGEX.test(line)) return null

  const title = line.trim()
  if (title.length === 0) return null

  lines[lineIndex] = `- [x] ${title}`
  return { text: lines.join('\n'), title }
}

/**
 * Clamp a Completed title to the schema-imposed max length.
 *
 * Why a helper instead of inline `slice`: keeps the magic number co-located
 * with the schema and prevents drift if the column width ever changes.
 *
 * @param raw - Untrimmed title text from a checkbox line.
 * @returns A safe-to-send title (trimmed and length-capped).
 * @example
 * normalizeCompletedTitle('  hello world  ') // → 'hello world'
 */
export function normalizeCompletedTitle(raw: string): BrainDumpCompletedTitle {
  const trimmed = raw.trim()
  if (trimmed.length <= COMPLETED_TITLE_MAX_LENGTH) return trimmed
  return trimmed.slice(0, COMPLETED_TITLE_MAX_LENGTH)
}
