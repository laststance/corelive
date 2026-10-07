import { ORPCError, os } from '@orpc/server'
import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { PG_UNIQUE_VIOLATION } from '@/db/constants'
import { isPgError } from '@/db/isPgError'
import { requireRow } from '@/db/requireRow'
import { categoryTable, type User, userTable } from '@/db/schema'
import { runTransaction } from '@/db/transaction'
import { DEFAULT_CATEGORY_SEED } from '@/server/schemas/category'
import { ServerTiming } from '@/server/timing/ServerTiming'

interface AuthInitialContext {
  headers: Headers
  serverTiming?: ServerTiming
  user?: User
}

const DEVELOPMENT_USER_ID = 'user_mock_user_id'

/** Reads the trusted account identity supplied by the verified HTTP adapter or an internal procedure call. @param headers - Internal context headers; public HTTP headers are replaced by the route after Clerk verification. @returns The Clerk user ID, or undefined for a missing/malformed credential. @example `getClerkUserId(new Headers({ Authorization: 'Bearer user_123' })) // => "user_123"` */
function getClerkUserId(headers: Headers): string | undefined {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined

  const clerkUserId = authorization.slice('Bearer '.length)
  return clerkUserId.length > 0 ? clerkUserId : undefined
}

/** Reads one user row by Clerk ID, whenever auth middleware needs the account behind a Bearer credential. @param clerkUserId - Authenticated Clerk user identifier. @returns The user row, or undefined when none exists yet. @example `await findUserByClerkId('user_123') // => { id: 7, clerkId: 'user_123', ... }` */
async function findUserByClerkId(
  clerkUserId: string,
): Promise<User | undefined> {
  const [existingUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.clerkId, clerkUserId))
    .limit(1)
  return existingUser
}

/** Resolves webhook-synced users without writes and creates only a genuinely missing row when auth middleware first sees it. @param clerkUserId - Authenticated Clerk user identifier. @returns The existing, newly-created, or concurrent winning user row. @example `await resolveUser('user_123') // => { clerkId: 'user_123', ... }` */
async function resolveUser(clerkUserId: string): Promise<User> {
  const existingUser = await findUserByClerkId(clerkUserId)
  if (existingUser) return existingUser

  try {
    // One transaction, two inserts: the user and its default category commit
    // together, so a webhook-less user never reaches a procedure with zero
    // categories. `listCategories` keeps its own seed for accounts created before this.
    return await runTransaction(async (tx) => {
      const createdUser = requireRow(
        await tx
          .insert(userTable)
          .values({
            clerkId: clerkUserId,
            ...(clerkUserId === DEVELOPMENT_USER_ID
              ? { email: 'test@example.com', name: 'Test User' }
              : {}),
          })
          .returning(),
        'user.insert',
      )
      await tx
        .insert(categoryTable)
        .values({ ...DEFAULT_CATEGORY_SEED, userId: createdUser.id })
      return createdUser
    })
  } catch (error) {
    // A webhook or parallel request may insert the unique Clerk row after our read.
    if (!isPgError(error, PG_UNIQUE_VIOLATION)) throw error

    const concurrentUser = await findUserByClerkId(clerkUserId)
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
    await serverTiming.measure('db', async () =>
      db.execute(sql`SELECT 1 AS connected`),
    )

    const user = await serverTiming.measure('user', async () =>
      resolveUser(clerkUserId),
    )

    return next({ context: { user, serverTiming } })
  })
