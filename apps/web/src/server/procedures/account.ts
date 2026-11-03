import { clerkClient } from '@clerk/nextjs/server'
import { AccountWhoamiOutputSchema } from '@corelive/desktop-contract/offline-sync'

import { authMiddleware } from '@/server/middleware/auth'

/**
 * Reads the primary email of a Clerk user server-side, whenever `User.email` is still null (EA2).
 *
 * @param clerkId - Verified Clerk id of the bearer credential (never a client value).
 * @returns The primary email address, or null when Clerk has none or cannot be reached.
 * @example await readClerkPrimaryEmail('user_123') // => 'a@example.com'
 */
async function readClerkPrimaryEmail(clerkId: string): Promise<string | null> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(clerkId)
    const primary = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )
    return primary?.emailAddress ?? null
  } catch {
    // Best effort: a Clerk outage must not break identity verification.
    return null
  }
}

/**
 * Returns the account behind the bearer credential: its Clerk id and primary email (#216 EA2).
 *
 * The desktop controller treats `auth-set-user` as a trigger only and calls this with the
 * TokenBroker token before it binds or attaches anything, so the identity shown in Settings
 * and stored in the binding comes from the server, never from a renderer payload.
 *
 * @returns `{ clerkId, email }`; `email` falls back to Clerk's primary email while the webhook has not synced one.
 * @example await call(whoami, undefined, { context })
 */
export const whoami = authMiddleware
  .output(AccountWhoamiOutputSchema)
  .handler(async ({ context }) => ({
    clerkId: context.user.clerkId,
    email:
      context.user.email ?? (await readClerkPrimaryEmail(context.user.clerkId)),
  }))
