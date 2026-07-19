import { ORPCError, os } from '@orpc/server'
import { Prisma, type User } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { ServerTiming } from '@/server/timing/ServerTiming'

export interface AuthContext {
  user: User
  serverTiming: ServerTiming
}

interface AuthInitialContext {
  headers: Headers
  serverTiming?: ServerTiming
  user?: User
}

const DEVELOPMENT_USER_ID = 'user_mock_user_id'

/** Reads the established Clerk user-ID Bearer contract whenever auth middleware starts an oRPC call. @param headers - Incoming oRPC request headers. @returns The Clerk user ID, or undefined for a missing/malformed credential. @example `getClerkUserId(new Headers({ Authorization: 'Bearer user_123' })) // => "user_123"` */
function getClerkUserId(headers: Headers): string | undefined {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined

  const clerkUserId = authorization.slice('Bearer '.length)
  return clerkUserId.length > 0 ? clerkUserId : undefined
}

/** Resolves webhook-synced users without writes and creates only a genuinely missing row when auth middleware first sees it. @param clerkUserId - Authenticated Clerk user identifier. @returns The existing, newly-created, or concurrent winning user row. @example `await resolveUser('user_123') // => { clerkId: 'user_123', ... }` */
async function resolveUser(clerkUserId: string): Promise<User> {
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  })
  if (existingUser) return existingUser

  try {
    return await prisma.user.create({
      data: {
        clerkId: clerkUserId,
        ...(clerkUserId === DEVELOPMENT_USER_ID
          ? { email: 'test@example.com', name: 'Test User' }
          : {}),
      },
    })
  } catch (error) {
    // A webhook or parallel request may insert the unique Clerk row after our read.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error
    }

    const concurrentUser = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    })
    if (concurrentUser) return concurrentUser

    // The unique winner should be readable; retain the original database error if it is not.
    throw error
  }
}

export const authMiddleware = os
  .$context<AuthInitialContext>()
  .use(async ({ context, next }) => {
    const serverTiming = context.serverTiming ?? new ServerTiming()

    // Bootstrap child procedures already carry the resolved row, so skip every auth DB phase.
    if (context.user) {
      return next({ context: { user: context.user, serverTiming } })
    }

    const clerkUserId = await serverTiming.measure('auth', () =>
      getClerkUserId(context.headers),
    )

    if (!clerkUserId) {
      throw new ORPCError('UNAUTHORIZED', {
        message: 'Authentication required',
      })
    }

    // `SELECT 1` isolates connection acquisition from user lookup in production timing.
    await serverTiming.measure(
      'db',
      async () =>
        prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 AS connected`,
    )

    const user = await serverTiming.measure('user', async () =>
      resolveUser(clerkUserId),
    )

    return next({ context: { user, serverTiming } })
  })
