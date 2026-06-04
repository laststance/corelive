/**
 * Default user preferences for the core web/Electron experience. BOTH default
 * OFF so existing users — and anyone whose pre-existing persisted Redux blob
 * lacks this slice — keep today's behavior: no completion sound, and completed
 * todos move to the Completed list rather than staying in place.
 *
 * Read preferences through the slice's defensive `?? DEFAULT` selectors: the
 * persistence middleware's default `shallowMerge` drops any field ADDED to this
 * slice in a future release for users who already persisted it, so a missing
 * field must coalesce to its default here (eng-review Finding 5).
 */
export const DEFAULT_PREFERENCES = {
  /** Play a soft sound on completion. Opt-in DESIGN.md exception, default OFF. */
  completionSound: false,
  /**
   * 居残りモード — keep checked todos in the active list (checked + strikethrough)
   * instead of moving them to the Completed list. Default OFF (today's behavior).
   */
  retainCompletedInList: false,
}
