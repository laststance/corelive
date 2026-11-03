import { AccountWhoamiOutputSchema } from '@corelive/desktop-contract/offline-sync'

import { authMiddleware } from '@/server/middleware/auth'

/**
 * Returns the account behind the bearer credential: its Clerk id and primary email (#216 EA2).
 *
 * The desktop controller treats `auth-set-user` as a trigger only and calls this with the
 * TokenBroker token before it binds or attaches anything, so the identity shown in Settings
 * and stored in the binding comes from the server, never from a renderer payload.
 *
 * @returns `{ clerkId, email }`; `email` is null until the Clerk webhook has synced one.
 * @example await call(whoami, undefined, { context })
 */
export const whoami = authMiddleware
  .output(AccountWhoamiOutputSchema)
  .handler(async ({ context }) => ({
    clerkId: context.user.clerkId,
    email: context.user.email,
  }))
