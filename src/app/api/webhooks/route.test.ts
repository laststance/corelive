import { Webhook } from 'svix'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockHeaders,
  mockTransaction,
  mockTransactionClient,
  testSigningSecret,
} = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockTransaction: vi.fn(),
  mockTransactionClient: {
    user: { create: vi.fn() },
    category: { create: vi.fn() },
  },
  testSigningSecret: 'whsec_d2ViaG9vay10ZXN0LXNpZ25pbmctc2VjcmV0',
}))

vi.mock('next/headers', () => ({ headers: mockHeaders }))
vi.mock('@/env.mjs', () => ({ env: { WEBHOOK_SECRET: testSigningSecret } }))
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: vi.fn() }))
vi.mock('@prisma/client', () => ({
  /**
   * Replaces database access when {@link POST} initializes during webhook tests.
   * @returns A client backed by the transaction mock.
   * @example new PrismaClient().$transaction(callback)
   */
  PrismaClient: class {
    $transaction = mockTransaction
  },
}))

import { POST } from './route'

beforeEach(() => {
  mockTransaction.mockImplementation(
    async (
      callback: (client: typeof mockTransactionClient) => Promise<unknown>,
    ) => callback(mockTransactionClient),
  )
  mockTransactionClient.user.create.mockResolvedValue({ id: 42 })
  mockTransactionClient.category.create.mockResolvedValue({ id: 7 })
})

describe('Clerk webhook signature verification', () => {
  test.each([
    { format: 'compact', indentation: undefined },
    { format: 'formatted', indentation: 2 },
  ])(
    'creates the user and default category from a $format signed payload',
    async ({ indentation }) => {
      // Arrange
      const body = JSON.stringify(
        {
          type: 'user.created',
          data: {
            id: 'user_signed',
            email_addresses: [{ email_address: 'signed@example.com' }],
            username: 'signed-user',
          },
        },
        null,
        indentation,
      )
      const timestamp = new Date()
      mockHeaders.mockResolvedValue(
        new Headers({
          'svix-id': 'msg_signed',
          'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
          'svix-signature': new Webhook(testSigningSecret).sign(
            'msg_signed',
            timestamp,
            body,
          ),
        }),
      )
      const request = new Request('https://corelive.app/api/webhooks', {
        method: 'POST',
        body,
      })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(201)
      expect(mockTransactionClient.user.create).toHaveBeenCalledWith({
        data: {
          clerkId: 'user_signed',
          name: 'signed-user',
          email: 'signed@example.com',
        },
      })
      expect(mockTransactionClient.category.create).toHaveBeenCalledWith({
        data: { name: 'General', color: 'blue', isDefault: true, userId: 42 },
      })
    },
  )

  test('rejects a tampered signed payload before any database write', async () => {
    // Arrange
    const signedBody = '{"type":"user.created","data":{"id":"user_signed"}}'
    const timestamp = new Date()
    mockHeaders.mockResolvedValue(
      new Headers({
        'svix-id': 'msg_tampered',
        'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        'svix-signature': new Webhook(testSigningSecret).sign(
          'msg_tampered',
          timestamp,
          signedBody,
        ),
      }),
    )
    const request = new Request('https://corelive.app/api/webhooks', {
      method: 'POST',
      body: signedBody.replace('user_signed', 'user_tampered'),
    })

    // Act
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockTransactionClient.user.create).not.toHaveBeenCalled()
    expect(mockTransactionClient.category.create).not.toHaveBeenCalled()
  })
})
