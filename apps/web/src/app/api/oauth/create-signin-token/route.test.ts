// @vitest-environment node
import { expect, test, vi } from 'vitest'

import { POST } from './route'

const { createSignInToken } = vi.hoisted(() => ({
  createSignInToken: vi.fn().mockResolvedValue({
    token: 'synthetic-ticket',
    createdAt: 1_700_000_000_000,
  }),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: 'synthetic-user' }),
  clerkClient: async () => ({ signInTokens: { createSignInToken } }),
}))

test('gives the desktop return the same lifetime requested from the ticket provider', async () => {
  // Arrange + Act
  const response = await POST()

  // Assert
  expect(createSignInToken).toHaveBeenCalledWith({
    userId: 'synthetic-user',
    expiresInSeconds: 60,
  })
  expect(await response.json()).toEqual({
    token: 'synthetic-ticket',
    expiresAt: 1_700_000_060_000,
    expiresInSeconds: 60,
  })
})
