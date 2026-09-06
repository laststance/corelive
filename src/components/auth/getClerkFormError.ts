/** Extracts Clerk's most helpful error text for Electron account creation and email verification failures.
 * @param error - Unknown SDK rejection.
 * @param fallback - The flow's default error message.
 * @returns The first detailed SDK message, its short message, or the fallback.
 * @example getClerkFormError({ errors: [{ message: 'Invalid code' }] }, 'Try again')
 */
export function getClerkFormError(error: unknown, fallback: string): string {
  // SDK rejections use this optional shape; missing details retain the caller's existing fallback.
  const clerkError = error as
    | { errors?: Array<{ longMessage?: string; message?: string }> }
    | null
    | undefined
  return (
    clerkError?.errors?.[0]?.longMessage ||
    clerkError?.errors?.[0]?.message ||
    fallback
  )
}
