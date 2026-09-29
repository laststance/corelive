import type { WebhookEvent } from '@clerk/nextjs/server'
import { and, eq, ne, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { Webhook } from 'svix'

import { requireRow } from '@/db/requireRow'
import { categoryTable, userTable } from '@/db/schema'
import { runTransaction } from '@/db/transaction'
import { env } from '@/env.mjs'
import { DEFAULT_CATEGORY_SEED } from '@/server/schemas/category'

import { createModuleLogger } from '../../../lib/logger'

const webhookLog = createModuleLogger('clerkWebhook')

export const runtime = 'nodejs'

/**
 * Handles signed Clerk events from Next.js and creates each new user's default category.
 *
 * A `user.created` is safe to deliver twice and to deliver late: when the auth middleware already created the account (its row has no name or email yet), the event fills those in and keeps the one "General" category instead of failing on the unique Clerk ID. When another row already holds the event's email address (an account deleted or re-addressed in Clerk), the account is stored without an address instead of failing on the unique email or taking it from that row.
 * @param req - Incoming Clerk webhook request.
 * @returns 201 after handling the event, 400 when verification fails or the payload has no email, 500 when the database write fails (Svix retries).
 * @example await POST(signedClerkRequest) // Response with status 201
 */
export async function POST(req: Request) {
  // Header access
  const headerPayload = await headers()

  // You can find this in the Clerk Dashboard -> Webhooks -> choose the endpoint
  const WEBHOOK_SECRET = env.WEBHOOK_SECRET

  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    })
  }

  const body = await req.text()

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent
  try {
    // Svix 2 verifies the original bytes; parse the event only after signature validation.
    wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    })
    evt = JSON.parse(body) as WebhookEvent
  } catch (err) {
    webhookLog.error({ err }, 'Error verifying webhook')
    return new Response('Error occured', {
      status: 400,
    })
  }

  if (evt.type === 'user.created') {
    const userData = evt.data
    const emailAddress = userData.email_addresses?.[0]?.email_address

    if (!emailAddress) {
      webhookLog.error('No email address found for user')
      return new Response('No email address found', { status: 400 })
    }

    const firstName = userData.first_name || ''
    const lastName = userData.last_name || ''
    const name =
      userData.username || `${firstName} ${lastName}`.trim() || 'Unknown User'

    // Row ids only, logged once the transaction has committed. A Clerk user id is never logged: the API
    // trusts `Authorization: Bearer <Clerk user id>`, so in a log line it would be a working credential.
    const outcome: { userId?: number; heldByUserId?: number } = {}
    try {
      await runTransaction(async (tx) => {
        // The address is unique, and nothing in the app reads it. When another row already holds it (an
        // account that was deleted or re-addressed in Clerk: no `user.deleted` / `user.updated` handler
        // exists), this account is stored without it. Taking the address from that row would need proof of
        // who owns it now, and a valid signature only proves the event happened: a replayed or late event of
        // an older account would take it back from the newer one. Storing it unclaimed is the one outcome that
        // cannot be wrong, and it ends the Svix retry loop the unique index used to cause.
        const [holder] = await tx
          .select({ id: userTable.id })
          .from(userTable)
          .where(
            and(
              eq(userTable.email, emailAddress),
              ne(userTable.clerkId, userData.id),
            ),
          )
          .limit(1)
        outcome.heldByUserId = holder?.id
        const emailToStore = holder ? null : emailAddress

        // Insert, or fill the blanks of a row the auth middleware created first. Existing values win,
        // so a late delivery never overwrites what the account already holds.
        const user = requireRow(
          await tx
            .insert(userTable)
            .values({ clerkId: userData.id, name, email: emailToStore })
            .onConflictDoUpdate({
              target: userTable.clerkId,
              set: {
                name: sql`COALESCE(${userTable.name}, ${name})`,
                email: sql`COALESCE(${userTable.email}, ${emailToStore})`,
              },
            })
            .returning({ id: userTable.id }),
          'user.insert',
        )
        outcome.userId = user.id

        // Unique index on (name, userId): the middleware's own "General" is left as it is.
        await tx
          .insert(categoryTable)
          .values({ ...DEFAULT_CATEGORY_SEED, userId: user.id })
          .onConflictDoNothing({
            target: [categoryTable.name, categoryTable.userId],
          })
      })
    } catch (error) {
      // The sanitizing serializer keeps the SQL, bound name and email out of the log line; the
      // bare `Response` keeps them out of Next's own error output. Svix retries a non-2xx, and the
      // delivery id lets the log line be matched with the Svix dashboard without naming the user.
      webhookLog.error({ error, svixId: svix_id }, 'Clerk user sync failed')
      return new Response('Error occured', { status: 500 })
    }

    // Say which row holds the address (row ids only; the address itself is PII), so a missing email on
    // an account can be traced.
    if (outcome.heldByUserId !== undefined) {
      webhookLog.warn(
        { userId: outcome.userId, heldByUserId: outcome.heldByUserId },
        'Stored an account without an email: another account holds the address',
      )
    }
  }

  return new Response('', { status: 201 })
}
