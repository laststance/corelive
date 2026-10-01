import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { createClient } from './create-client'

const initialUrl = window.location.href
const handler = new RPCHandler({
  category: { list: os.handler(() => ({ categories: [] })) },
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.Clerk
  window.location.href = initialUrl
})

describe('browser oRPC transport', () => {
  test('posts to the current origin API endpoint and preserves existing request headers', async () => {
    // Arrange
    window.location.href = 'https://corelive.example/write'
    Object.defineProperty(window, 'Clerk', {
      configurable: true,
      value: { session: { user: { id: 'test_user' } } },
    })
    const fetchRequest = vi.fn(async (url: string, init: RequestInit) => {
      const request = new Request(url, init)
      const { response } = await handler.handle(request, {
        prefix: '/api/orpc',
        context: {},
      })
      return response ?? new Response('Not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchRequest)

    // Act
    const result = await createClient().category.list()

    // Assert
    expect(result).toEqual({ categories: [] })
    expect(fetchRequest).toHaveBeenCalledTimes(1)
    const [url, init] = fetchRequest.mock.calls[0]!
    expect(url).toBe('https://corelive.example/api/orpc/category/list')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer test_user',
    )
  })

  test('does not make a browser HTTP request during server rendering', async () => {
    // Arrange
    vi.stubGlobal('window', undefined)
    const fetchRequest = vi.fn()
    vi.stubGlobal('fetch', fetchRequest)

    // Act
    const request = createClient().category.list()

    // Assert
    await expect(request).rejects.toThrow(
      'RPCLink is not allowed on the server side.',
    )
    expect(fetchRequest).not.toHaveBeenCalled()
  })
})
