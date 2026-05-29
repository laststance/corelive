/**
 * @fileoverview Shared constants for bulk undo + paste-import.
 *
 * `COMPLETED_UNDO_WINDOW_MS` was previously a private const inside
 * `completed.ts`; it is promoted here because two server consumers now share it
 * — single-row `completed.delete` and the batch `completed.deleteMany` /
 * `todo.deleteMany` undo paths — and PR2's 60 s inline "Undo import" UI reads
 * the same window. Centralizing prevents the two windows from drifting.
 *
 * @module lib/constants/import
 */

/**
 * Window during which a Completed/Todo row may be hard-deleted via the undo
 * endpoints. Picked to cover the toast plus generous slack for slow networks;
 * older rows must go through archival flows so the destructive endpoints cannot
 * be weaponised against historical data. Because `createdAt` is the real insert
 * time (never overridden — `completedAt` holds the semantic date), this 60 s
 * window works even when a paste imports rows with a past `completedAt`.
 */
export const COMPLETED_UNDO_WINDOW_MS = 60 * 1000

/**
 * Hard cap on lines accepted per paste-import batch. Enforced on the server via
 * Zod `.max(MAX_IMPORT_LINES_PER_BATCH)` and mirrored in the PR2 client preview
 * ("N lines exceeded — importing the first 1000"). Precedent:
 * `BRAINDUMP_NOTE_LINES_PER_CAP = 200`; a paste import is bulkier, so the cap is
 * higher. Overflow is shown, never silently dropped.
 */
export const MAX_IMPORT_LINES_PER_BATCH = 1000
