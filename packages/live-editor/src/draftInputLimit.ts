import { LIVE_EDITOR_NOTE_LINES_PER_CAP } from '@corelive/desktop-contract/live-editor-constants'
import type { OfflineDraft } from '@corelive/desktop-contract/offline-workspace'

import { COMPLETED_TITLE_MAX_LENGTH } from './liveEditorUtils'

/**
 * Retains editing capacity for writing enlarged by migration, recovery or completion.
 * The durable reducer and bundled editor use the same UTF-16/newline accounting.
 * Ordinary saves validate against the existing draft, never their submitted rows.
 * @example getDraftInputLimit({ revision: 0, rows: [] }) // 51000
 */
export function getDraftInputLimit(draft: OfflineDraft): number {
  return Math.max(
    COMPLETED_TITLE_MAX_LENGTH * LIVE_EDITOR_NOTE_LINES_PER_CAP,
    draft.inputLimit ?? 0,
    draft.rows.reduce(
      (length, row) => length + row.text.length,
      Math.max(0, draft.rows.length - 1),
    ),
  )
}
