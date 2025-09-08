import type { WebhookEvent } from '@clerk/nextjs/server'
import { PrismaClient } from '@prisma/client'
import { headers } from 'next/headers'
import { Webhook } from 'svix'

import { env } from '@/env.mjs'

import { log } from '../../../lib/logger'

export const runtime = 'nodejs'

const prisma = new PrismaClient()

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

  const payload = await req.json()
  const body = JSON.stringify(payload)

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    log.error('Error verifying webhook:', err)
    return new Response('Error occured', {
      status: 400,
    })
  }

  if (evt.type === 'user.created') {
    const userData = evt.data
    const emailAddress = userData.email_addresses?.[0]?.email_address

    if (!emailAddress) {
      log.error('No email address found for user')
      return new Response('No email address found', { status: 400 })
    }

    const firstName = userData.first_name || ''
    const lastName = userData.last_name || ''
    const name =
      userData.username || `${firstName} ${lastName}`.trim() || 'Unknown User'

    await prisma.user.create({
      data: {
        clerkId: userData.id,
        name,
        email: emailAddress,
      },
    })
  }

  return new Response('', { status: 201 })
}
