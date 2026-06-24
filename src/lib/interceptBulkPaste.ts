import type { ClipboardEvent } from 'react'

import { isMultiLinePaste } from '@/lib/isMultiLinePaste'

/**
 * Routes a multi-line clipboard paste to the bulk paste-import dialog instead of
 * letting a whole list land as one mangled task. Shared by the main home
 * `AddTodoForm` and the Floating Navigator task input so both `onPaste` handlers
 * intercept identically (Issue #110 AC#1/#2) — the single source of the
 * "intercept only when it replaces the entire field" rule. Falls through to the
 * native paste (no `preventDefault`) for a single-line paste, when no bulk
 * handler is wired, or when the caret sits mid-text / over a partial selection,
 * so ordinary editing is never hijacked (AC#3).
 *
 * @param event - The `onPaste` clipboard event on a todo/task `<input>`.
 * @param onBulkPaste - Opens the import dialog seeded with the pasted text; when `undefined`, paste is never intercepted.
 * @returns nothing; on interception it calls `event.preventDefault()` then `onBulkPaste(pastedText)`, otherwise it does nothing and the native paste proceeds.
 * @example
 *   <input onPaste={(event) => interceptBulkPaste(event, openWithPaste)} />
 */
export function interceptBulkPaste(
  event: ClipboardEvent<HTMLInputElement>,
  onBulkPaste: ((text: string) => void) | undefined,
): void {
  // No bulk handler wired → leave paste entirely native.
  if (!onBulkPaste) return
  const pastedText = event.clipboardData.getData('text/plain')
  // A single line is ordinary input, not a list to import (AC#3).
  if (!isMultiLinePaste(pastedText)) return
  const input = event.currentTarget
  // Only hijack when the paste would replace the whole field — i.e. the input is
  // empty or fully selected. A mid-edit paste must stay native so a draft the
  // user is writing is never destroyed.
  const replacesEntireValue =
    input.selectionStart === 0 && input.selectionEnd === input.value.length
  if (!replacesEntireValue) return
  event.preventDefault()
  onBulkPaste(pastedText)
}
