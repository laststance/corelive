import { isClerkAPIResponseError } from '@clerk/nextjs/errors'

/** Extracts Clerk's most helpful error text for Electron account creation and email verification failures.
 * @param error - Unknown SDK rejection.
 * @param fallback - The flow's default error message.
 * @returns The first detailed SDK message, its short message, or the fallback.
 * @example getClerkFormError(new Error('Network unavailable'), 'Try again') // 'Try again'
 */
export function getClerkFormError(error: unknown, fallback: string): string {
  // Unknown rejections keep the flow's fallback; only the SDK guard admits Clerk error details.
  if (!isClerkAPIResponseError(error)) return fallback
  return error.errors[0]?.longMessage || error.errors[0]?.message || fallback
}
