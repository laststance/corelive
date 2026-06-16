/**
 * Formats a Date into a 24-hour HH:MM clock string for completion timestamps.
 *
 * Exists so the completion-time label is single-sourced across every surface
 * that lists a finished task (the day-detail dialog and the permanent
 * completion journal), instead of each re-deriving the same `toLocaleTimeString`
 * options and drifting apart.
 *
 * @param when - Timestamp the task was marked done.
 * @returns 24-hour clock string like `"18:47"`.
 * @example
 * formatClockTime(new Date('2026-05-10T18:47:00')) // => "18:47"
 */
export const formatClockTime = (when: Date): string =>
  when.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
