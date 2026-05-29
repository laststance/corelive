/**
 * @fileoverview Pure, line-oriented parser for paste-to-import (Issue #53, PR1).
 *
 * Unlike `braindumpUtils` (checkbox-only grammar that returns `null` for plain
 * lines and strips nothing), this parser treats EVERY non-blank line as one
 * task. It strips only a single leading list/checkbox prefix to derive the
 * title and preserves URLs, `# headings`, and arbitrary body text as legitimate
 * titles — a task whose name IS a URL or a heading is valid.
 *
 * Why it lives in `src/lib/` (not a component): the same pure util runs in both
 * the PR2 client preview and the server normalization, so preview count ==
 * inserted count. No React/Electron deps; reuses `normalizeCompletedTitle` +
 * `CHECKBOX_LINE_REGEX` from braindumpUtils as the single source of truth for
 * title clamping and checkbox detection.
 *
 * @module lib/parsePasteToTasks
 */

import {
  CHECKBOX_LINE_REGEX,
  normalizeCompletedTitle,
} from '@/components/braindump/braindumpUtils'

/**
 * One task parsed from a pasted line.
 *
 * `done` records whether the source line was a checked checkbox (`- [x] `). It
 * is informational only in Slice 1 — routing is by import destination (which
 * zone the dialog was opened from), NOT by this flag. PR1 procedures ignore it;
 * a later slice may honor `[x]` to route a line to Completed from any zone.
 *
 * @example
 * const task: ParsedPasteTask = { title: 'write tests', done: true }
 */
export type ParsedPasteTask = {
  /** The derived title: trimmed, 255-clamped, with any leading list prefix stripped. */
  title: string
  /** True when the source line was a checked markdown checkbox (`- [x] `). */
  done: boolean
}

/**
 * Strips a single leading bullet (`- `, `* `, `+ `) or ordered-list (`1. `,
 * `2) `, …) prefix. Anchored at start with required trailing whitespace so a
 * mid-line `-` or a dash without a following space is never stripped. Checkbox
 * lines are handled separately (and earlier), so this never sees `- [ ] `.
 */
const LIST_PREFIX_REGEX = /^\s*(?:[-*+]|\d+[.)])\s+/

/**
 * Parses a single raw line into a {@link ParsedPasteTask}, or `null` when the
 * line normalizes to empty (blank / whitespace-only / prefix-only).
 *
 * Order matters: the checkbox grammar is tried FIRST so `- [x] ` sets
 * `done:true` and contributes only the post-prefix title; otherwise a single
 * leading list/ordered prefix is stripped. Lines that match neither (URLs,
 * `# headings`, plain text) are preserved verbatim as the title.
 *
 * @param rawLine - One line of pasted text (no trailing newline).
 * @returns
 * - `{ title, done }` when the line yields a non-empty title after normalize
 * - `null` when the line is blank, whitespace-only, or only a list prefix
 * @example
 * parsePasteLine('- [x] write tests')      // => { title: 'write tests', done: true }
 * parsePasteLine('- buy milk')             // => { title: 'buy milk', done: false }
 * parsePasteLine('1. ship it')             // => { title: 'ship it', done: false }
 * parsePasteLine('https://example.com')    // => { title: 'https://example.com', done: false }
 * parsePasteLine('# Today')                // => { title: '# Today', done: false }
 * parsePasteLine('   ')                    // => null
 * parsePasteLine('-   ')                   // => null  (prefix-only)
 */
export function parsePasteLine(rawLine: string): ParsedPasteTask | null {
  // Checkbox first: capture done-state, then derive the title from the
  // post-prefix capture group so the `[x] ` marker never leaks into the title.
  const checkboxMatch = CHECKBOX_LINE_REGEX.exec(rawLine)
  if (checkboxMatch) {
    const checkboxState = checkboxMatch[1]
    const checkboxBody = checkboxMatch[2]
    if (checkboxBody !== undefined) {
      const title = normalizeCompletedTitle(checkboxBody)
      if (title.length === 0) return null
      return { title, done: checkboxState === 'x' }
    }
  }

  // Not a checkbox: strip at most one leading bullet/ordered prefix, then
  // normalize. Anything that wasn't a list (URL, heading, prose) is untouched
  // by the strip and preserved as the title.
  const withoutPrefix = rawLine.replace(LIST_PREFIX_REGEX, '')
  const title = normalizeCompletedTitle(withoutPrefix)
  if (title.length === 0) return null
  return { title, done: false }
}

/**
 * Parses pasted multi-line text into one task per NON-blank line. Blank /
 * whitespace-only / prefix-only lines are dropped so the parsed count equals
 * the count the import will insert. Pure — the same util backs the PR2 client
 * preview and the server-side normalization, keeping preview == inserted.
 *
 * @param text - The full pasted text (any mix of `\n` / `\r\n` line endings).
 * @returns
 * - `ParsedPasteTask[]` in document order, one per surviving line
 * - Empty array when `text` is empty or contains only droppable lines
 * @example
 * parsePasteToTasks('- [x] shipped\n\n- buy milk\n# notes')
 * // => [
 * //   { title: 'shipped', done: true },
 * //   { title: 'buy milk', done: false },
 * //   { title: '# notes', done: false },
 * // ]
 * @example
 * parsePasteToTasks('\n   \n') // => []
 */
export function parsePasteToTasks(text: string): ParsedPasteTask[] {
  // Normalize CRLF/CR to LF before splitting so a Windows/Mac-classic paste
  // does not leave a stray \r at the end of each title.
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const tasks: ParsedPasteTask[] = []
  for (const line of lines) {
    const parsed = parsePasteLine(line)
    if (parsed) tasks.push(parsed)
  }
  return tasks
}
