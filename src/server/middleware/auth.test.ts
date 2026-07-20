import { call } from '@orpc/server'
import { Prisma, type User } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { authMiddleware } from './auth'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

const EXISTING_USER: User = {
  id: 7,
  clerkId: 'user_synced',
  email: 'synced@example.com',
  name: 'Synced User',
  bio: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
}

const CONCURRENT_USER: User = {
  ...EXISTING_USER,
  id: 8,
  clerkId: 'user_concurrent',
  email: null,
  name: null,
}

const readAuthenticatedUser = authMiddleware.handler(
  async ({ context }) => context.user,
)

const mockedConnectionProbe = vi.mocked(prisma.$queryRaw)
const mockedFindUnique = vi.mocked(prisma.user.findUnique)
const mockedCreate = vi.mocked(prisma.user.create)

/** Builds the public oRPC context used by every browser query after Clerk resolves a user ID. @param clerkUserId - Clerk user identifier placed in the Bearer header. @returns Direct-call options for an authenticated procedure. @example `authCallOptions('user_123')` */
function authCallOptions(clerkUserId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkUserId}` }),
    },
  }
}

beforeEach(() => {
  mockedConnectionProbe.mockReset()
  mockedFindUnique.mockReset()
  mockedCreate.mockReset()
  mockedConnectionProbe.mockResolvedValue([{ connected: 1 }])
})

describe('authMiddleware user resolution', () => {
  it('reuses a webhook-synchronized user without writing on an authenticated query', async () => {
    // Arrange
    mockedFindUnique.mockResolvedValue(EXISTING_USER)

    // Act
    const user = await call(
      readAuthenticatedUser,
      undefined,
      authCallOptions('user_synced'),
    )

    // Assert
    expect(user).toEqual(EXISTING_USER)
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('creates the user only when the Clerk webhook row is genuinely missing', async () => {
    // Arrange
    mockedFindUnique.mockResolvedValue(null)
    mockedCreate.mockResolvedValue(CONCURRENT_USER)

    // Act
    const user = await call(
      readAuthenticatedUser,
      undefined,
      authCallOptions('user_concurrent'),
    )

    // Assert
    expect(user).toEqual(CONCURRENT_USER)
    expect(mockedCreate).toHaveBeenCalledWith({
      data: { clerkId: 'user_concurrent' },
    })
  })

  it('uses the winning webhook row when a concurrent create hits the Clerk ID unique constraint', async () => {
    // Arrange
    mockedFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(CONCURRENT_USER)
    mockedCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate Clerk user', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    )

    // Act
    const user = await call(
      readAuthenticatedUser,
      undefined,
      authCallOptions('user_concurrent'),
    )

    // Assert
    expect(user).toEqual(CONCURRENT_USER)
    expect(mockedFindUnique).toHaveBeenCalledTimes(2)
  })

  it('rejects an unauthenticated query before opening a database connection', async () => {
    // Arrange
    const operation = call(readAuthenticatedUser, undefined, {
      context: { headers: new Headers() },
    })

    // Act and Assert
    await expect(operation).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mockedConnectionProbe).not.toHaveBeenCalled()
    expect(mockedFindUnique).not.toHaveBeenCalled()
  })

  it('reuses a bootstrap-resolved user without repeating connection or user lookup work', async () => {
    // Arrange
    const options = {
      context: {
        headers: new Headers({ Authorization: 'Bearer user_synced' }),
        user: EXISTING_USER,
      },
    }

    // Act
    const user = await call(readAuthenticatedUser, undefined, options)

    // Assert
    expect(user).toEqual(EXISTING_USER)
    expect(mockedConnectionProbe).not.toHaveBeenCalled()
    expect(mockedFindUnique).not.toHaveBeenCalled()
  })
})
