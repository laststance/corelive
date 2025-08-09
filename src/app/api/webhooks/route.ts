import type { WebhookEvent } from '@clerk/nextjs/server'
import { PrismaClient } from '@prisma/client'
import { headers } from 'next/headers'
import { Webhook } from 'svix'

import { env } from '@/env.mjs'

const prisma = new PrismaClient()

export async function POST(req: Request) {
  // Header access
  const headerPayload = await headers()

  // Lightweight bypass for local mocking via MSW: when enabled and explicitly flagged,
  // accept the JSON payload without Svix signature verification.
  const isMockBypassEnabled = env.NEXT_PUBLIC_ENABLE_MSW_MOCK === 'true'
  const isMswMockRequest =
    headerPayload.get('x-msw-mock') === 'true' ||
    headerPayload.get('X-MSW-Mock') === 'true'

  if (isMockBypassEnabled && isMswMockRequest) {
    try {
      const payload = (await req.json()) as {
        type?: string
        data?: any
      }
      if (payload?.type === 'user.created' && payload?.data) {
        const data = payload.data as any
        await prisma.user.create({
          data: {
            clerkId: data.id,
            name: data.username ? data.username : `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
            email: data.email_addresses?.[0]?.email_address ?? null,
          },
        })
      }
      return new Response('', { status: 201 })
    } catch (err) {
      console.error('Mock webhook processing failed:', err)
      return new Response('Mock webhook processing failed', { status: 500 })
    }
  }

  // You can find this in the Clerk Dashboard -> Webhooks -> choose the endpoint
  const WEBHOOK_SECRET = env.WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error(
      'Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local',
    )
  }

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
    console.error('Error verifying webhook:', err)
    return new Response('Error occured', {
      status: 400,
    })
  }

  if (evt.type === 'user.created') {
    console.log('New user created')
    await prisma.user.create({
      data: {
        clerkId: evt.data.id,
        name: evt.data.username
          ? evt.data.username
          : evt.data.first_name + ' ' + evt.data.last_name,
        email: evt.data.email_addresses[0]!.email_address,
      },
    })
  }

  return new Response('', { status: 201 })
}
