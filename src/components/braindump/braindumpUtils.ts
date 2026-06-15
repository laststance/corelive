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
 * Regex for a markdown checkbox line. Captures the `[ ]`/`[x]` state in group 1
 * and the title in group 2. Exported so the paste-import parser
 * (`src/lib/parsePasteToTasks.ts`) reuses one source of truth for checkbox
 * detection instead of redefining the grammar.
 */
export const CHECKBOX_LINE_REGEX = /^- \[([ x])\] (.+)$/

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
 * @returns ParsedCheckbox when the line matches `^- \[ ?x\] .+$`, else null.
 * @example
 * parseCheckboxLine('- [x] write tests', 3)
 * // → { lineIndex: 3, checked: true, title: 'write tests' }
 * parseCheckboxLine('plain text', 0) // → null
 */
export function parseCheckboxLine(
  line: string,
  lineIndex: BrainDumpLineIndex,
): ParsedCheckbox | null {
  const match = CHECKBOX_LINE_REGEX.exec(line)
  if (!match) return null

  const mark = match[1]
  const rest = match[2]
  if (mark === undefined || rest === undefined) return null

  const title = rest.trim()
  if (title.length === 0) return null

  return {
    lineIndex,
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
  lines[lineIndex] = `- [${mark}] ${parsed.title}`
  return lines.join('\n')
}

/**
 * Matches an empty checkbox skeleton — a checkbox prefix with no title, e.g.
 * `- [ ]`, `- [x]`, `- []` (optional trailing whitespace). These have nothing
 * to record, so the complete command must skip them rather than logging a junk
 * `- [ ]` title.
 */
const EMPTY_CHECKBOX_SKELETON_REGEX = /^- \[[ xX]?\]\s*$/

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
