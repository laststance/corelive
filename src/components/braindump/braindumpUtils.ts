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
 * Why a separate utils file: parsing/serialization stays pure so the editor
 * component can stay focused on UI/IPC orchestration and is easy to unit-test.
 *
 * @module components/braindump/braindumpUtils
 */

import type { Completed } from '@/server/schemas/completed'

/** Regex for a markdown checkbox line. Captures the [ ] state and the title. */
const CHECKBOX_LINE_REGEX = /^- \[([ x])\] (.+)$/

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
