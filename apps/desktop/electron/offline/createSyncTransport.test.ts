import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { readAccountFrames } from '../mcp/historyStream'

import {
  createMcpAccountClient,
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

test('whoami asks the account.whoami procedure with the bearer and returns the verified identity', async () => {
  // Arrange
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ json: { clerkId: 'user_abc', email: 'me@example.com' } }),
  )
  const transport = createSyncTransport(
    'https://corelive.app',
    'test-token',
    fetcher,
  )

  // Act
  const identity = await transport.whoami()

  // Assert
  expect(identity).toEqual({ clerkId: 'user_abc', email: 'me@example.com' })
  expect(fetcher.mock.calls[0]![0]).toBe(
    'https://www.corelive.app/api/orpc/account/whoami',
  )
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

describe('MCP account history network deadlines', () => {
  const range = { from: 0, before: 100 }
  const rows = {
    type: 'rows',
    offset: 0,
    entries: [
      {
        source: 'completed',
        id: 7,
        completionId: null,
        title: 'Shipped',
        completedAt: 1,
        categoryId: 1,
        parentCategoryId: null,
        categoryPath: 'Work',
      },
    ],
  }
  const end = {
    type: 'end',
    accountId: 'test-account',
    total: 1,
    membership:
      '7ac74d2b3156abdbcd2b5bc31cbc7e6a4e1e665638bf83c51e33c2132d65b47e',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    // Put Node's native abort deadline on the same virtual clock as the network fixture.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const deadline = new AbortController()
      setTimeout(
        () => deadline.abort(new DOMException('Timed out', 'TimeoutError')),
        ms,
      )
      return deadline.signal
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function historyStream() {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = readable.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>(),
        { signal: init?.signal ?? undefined },
      )
      return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      })
    })
    return {
      writer: writable.getWriter(),
      fetcher,
      client: createMcpAccountClient('http://127.0.0.1', 'test-token', fetcher),
    }
  }

  test('verifies the final account history frame after 15 seconds when body bytes keep arriving', async () => {
    // Arrange
    const { client, fetcher, writer } = historyStream()
    const frames = await client.completed.historyRange(range)
    const received = readAccountFrames(frames, 'test-account', range).then(
      (verified) => ({ verified }),
      (error: unknown) => ({ error }),
    )

    // Act
    await vi.advanceTimersByTimeAsync(8_000)
    await writer.write(historyEvent(rows))
    await vi.advanceTimersByTimeAsync(8_000)
    const signal = fetcher.mock.calls[0]?.[1]?.signal
    if (!signal?.aborted) {
      await writer.write(historyEvent(end))
      await writer.close()
    }

    // Assert
    expect(await received).toMatchObject({
      verified: [{ id: 7, title: 'Shipped' }],
    })
  })

  test('fails a history request that receives no response headers within 15 seconds', async () => {
    // Arrange
    const client = createMcpAccountClient(
      'http://127.0.0.1',
      'test-token',
      async (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )

    // Act
    const read = client.completed.historyRange(range)
    const rejected = expect(read).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    await vi.advanceTimersByTimeAsync(15_000)

    // Assert
    await rejected
  })

  test('discards received account rows when the history body goes silent for 15 seconds', async () => {
    // Arrange
    const { client, writer } = historyStream()
    const frames = await client.completed.historyRange(range)
    const failed = vi.fn<(error: unknown) => void>()
    const received = readAccountFrames(frames, 'test-account', range).catch(
      (error: unknown) => {
        failed(error)
        return error
      },
    )

    // Act
    await vi.advanceTimersByTimeAsync(8_000)
    await writer.write(historyEvent(rows))
    await vi.advanceTimersByTimeAsync(14_999)

    // Assert
    expect(failed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await received).toMatchObject({ name: 'TimeoutError' })
  })

  test('caller cancellation interrupts an in-progress account history read', async () => {
    // Arrange
    const { client, writer } = historyStream()
    const cancellation = new AbortController()
    const frames = await client.completed.historyRange(range, {
      signal: cancellation.signal,
    })
    await writer.write(historyEvent(rows))
    const received = readAccountFrames(frames, 'test-account', range)
    const rejected = expect(received).rejects.toMatchObject({
      name: 'AbortError',
    })

    // Act
    cancellation.abort()

    // Assert
    await rejected
  })
})

function historyEvent(frame: unknown) {
  return new TextEncoder().encode(
    'event: message\ndata: ' + JSON.stringify({ json: frame }) + '\n\n',
  )
}
