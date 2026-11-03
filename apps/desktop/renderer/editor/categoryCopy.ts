/**
 * Inline copy for local category refusals (DA8, C5).
 *
 * A refused category command is a state of the form, never the storage failure
 * "Could not save writing on this Mac", so the picker shows these strings under the field.
 *
 * @module categoryCopy
 */

/** Result of one category command as the picker sees it. */
export type CategoryCommandOutcome =
  { ok: true } | { ok: false; reason: string; detail?: string }

/** Description shown instead of the hidden rename/move/delete actions of the default category (DA8). */
export const DEFAULT_CATEGORY_DESCRIPTION =
  'General is your default category. You can change its color.'

/**
 * Maps a refusal to its DA8 inline message.
 *
 * @param reason - The stable refusal reason from main.
 * @param name - The name the user typed, for the duplicate message.
 * @param detail - Extra input, e.g. the child name of an EA8 promotion clash.
 * @returns The exact inline copy.
 * @example
 * ```ts
 * categoryRefusalCopy('name-taken-local', 'Work') // `There's already a category called "Work" here.`
 * ```
 */
export function categoryRefusalCopy(
  reason: string,
  name: string,
  detail?: string,
): string {
  switch (reason) {
    case 'name-taken-local':
      return detail
        ? `A category called "${detail}" already exists at the top level.`
        : `There's already a category called "${name}" here.`
    case 'invalid-parent':
      return "A category inside another can't hold its own categories."
    case 'invalid-name':
      return 'Use 1–30 characters.'
    case 'default-locked':
      return DEFAULT_CATEGORY_DESCRIPTION
    default:
      return 'That change could not be applied. Please try again.'
  }
}
