/**
 * How long the "Removed from completed" Undo toast stays open before the
 * per-item delete is committed to the server (archive-then-delete). Undo within
 * this window is a pure client-side cancel — no server call is ever made, so the
 * completed row simply reappears in place. Kept short (a Gmail-style undo
 * window) so a real delete is not held back for long.
 */
export const TODO_DELETE_UNDO_WINDOW_MS = 5000
