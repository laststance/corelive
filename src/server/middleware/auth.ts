import { ORPCError, os } from '@orpc/server'
import type { User } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export interface AuthContext {
  user: User
}

export const authMiddleware = os
  .$context<{ headers: Headers }>()
  .use(async ({ context, next }) => {
    // Get Clerk user ID from Authorization header
    const authHeader = context.headers.get('authorization')
    const clerkUserId = authHeader?.replace('Bearer ', '')

    // Mock user handling in development environment
    if (
      process.env.NODE_ENV === 'development' &&
      clerkUserId === 'user_mock_user_id'
    ) {
      const user = await prisma.user.upsert({
        where: { clerkId: 'user_mock_user_id' },
        update: {},
        create: {
          // Bug: NEXT_PUBLIC_ENABLE_MSW_MOCK="true" の場合でもSign Up/Inでemailとnameが登録されない
          clerkId: 'user_mock_user_id',
          email: 'test@example.com',
          name: 'Test User',
        },
      })
      return next({ context: { user } })
    }

    if (!clerkUserId) {
      throw new ORPCError('UNAUTHORIZED', {
        message: 'Authentication required',
      })
    }

    // Fetch user with Prisma (create if not exists)
    const user = await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: {},
      create: {
        clerkId: clerkUserId,
        // Set additional info retrieval from Clerk here
      },
    })

    return next({ context: { user } })
  })
