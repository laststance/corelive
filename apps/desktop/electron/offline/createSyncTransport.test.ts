import { expect, test, vi } from 'vitest'

import {
  createSyncTransport,
  isSyncAuthenticationError,
} from './createSyncTransport'

test('the actual oRPC client sends a memory-only bearer to the canonical API and refuses redirects', async () => {
  // Arrange
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      json: { accountId: 'account-a', categories: [], deletions: [] },
    }),
  )
  const transport = createSyncTransport(
    'https://corelive.app',
    'test-token',
    fetcher,
  )
  const controller = new AbortController()

  // Act
  const result = await transport.bootstrap(controller.signal)

  // Assert
  expect(result.accountId).toBe('account-a')
  const [url, init] = fetcher.mock.calls[0]!
  expect(url).toBe('https://www.corelive.app/api/orpc/completed/syncBootstrap')
  expect(init?.redirect).toBe('error')
  expect(new Headers(init?.headers).get('Authorization')).toBe(
    'Bearer test-token',
  )
  expect(init?.signal?.aborted).toBe(false)
  controller.abort()
  expect(init?.signal?.aborted).toBe(true)
})

test.each(['rpc', 'plain'] as const)(
  'a real %s HTTP 401 becomes sign-in-required without relying on the retired oRPC status property',
  async (format) => {
    // Arrange
    const fetcher = vi.fn<typeof fetch>(async () =>
      format === 'rpc'
        ? Response.json(
            {
              json: {
                defined: false,
                code: 'UNAUTHORIZED',
                message: 'Sign in required',
              },
            },
            { status: 401 },
          )
        : new Response('Sign in required', { status: 401 }),
    )
    const transport = createSyncTransport(
      'http://localhost:4991',
      'test-token',
      fetcher,
    )

    // Act
    const error: unknown = await transport
      .bootstrap()
      .catch((error: unknown) => error)

    // Assert
    expect(isSyncAuthenticationError(error)).toBe(true)
    expect(isSyncAuthenticationError(new Error('Network unavailable'))).toBe(
      false,
    )
  },
)

test('a malformed successful API response cannot prepare an empty or wrongly shaped account workspace', async () => {
  // Arrange
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      json: { accountId: 'account-a', categories: 'invalid', deletions: [] },
    }),
  )
  const transport = createSyncTransport(
    'http://localhost:4991',
    'test-token',
    fetcher,
  )

  // Act / Assert
  await expect(transport.bootstrap()).rejects.toThrow()
  expect(() =>
    createSyncTransport('http://other.example', 'test-token'),
  ).toThrow('Unsupported sync origin')
})
